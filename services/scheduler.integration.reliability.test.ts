import fs from 'fs';
import path from 'path';
import { createServer, type Server } from 'http';
import { inArray } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Endpoint } from '../db/schema';

// ---------------------------------------------------------------------------
// Load .env.local into process.env before any DB modules are evaluated
// ---------------------------------------------------------------------------

try {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2] || '';
      }
    }
  }
} catch {
  // Ignore
}

// ---------------------------------------------------------------------------
// Dynamic Imports to guarantee process.env.DATABASE_URL is populated before db/index loads
// ---------------------------------------------------------------------------

let db: typeof import('../db').db;
let endpoints: typeof import('../db/schema').endpoints;
let checks: typeof import('../db/schema').checks;
let runScheduledChecks: typeof import('./scheduler').runScheduledChecks;
let resetExecutionGuard: typeof import('./scheduler').resetExecutionGuard;

// ---------------------------------------------------------------------------
// Test Server Setup
// ---------------------------------------------------------------------------

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const dbMod = await import('../db');
  db = dbMod.db;

  const schemaMod = await import('../db/schema');
  endpoints = schemaMod.endpoints;
  checks = schemaMod.checks;

  const schedulerMod = await import('./scheduler');
  runScheduledChecks = schedulerMod.runScheduledChecks;
  resetExecutionGuard = schedulerMod.resetExecutionGuard;

  // Start local loopback test server
  await new Promise<void>((resolve) => {
    server = createServer((req, res) => {
      const url = req.url ?? '/';

      if (url.startsWith('/up')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } else if (url === '/degraded') {
        setTimeout(() => {
          if (!res.writableEnded) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', degraded: true }));
          }
        }, 220);
      } else if (url === '/down') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Server error' }));
      } else if (url === '/timeout') {
        // Deliberately hold connection open to trigger client AbortController timeout
        req.on('close', () => {
          if (!res.writableEnded) {
            res.end();
          }
        });
      } else if (url === '/status-400') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad Request' }));
      } else if (url === '/status-404') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
      } else if (url === '/status-502') {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad Gateway' }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ default: true }));
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    if (server) {
      server.close(() => resolve());
    } else {
      resolve();
    }
  });
});

// ---------------------------------------------------------------------------
// Endpoint Tracking & Cleanup Helper
// ---------------------------------------------------------------------------

const createdEndpointIds: number[] = [];

async function insertTestEndpoint(
  name: string,
  path: string,
  latencyThresholdMs = 500
): Promise<Endpoint> {
  const url = `${baseUrl}${path}`;
  const [created] = await db
    .insert(endpoints)
    .values({
      name,
      url,
      latencyThresholdMs,
    })
    .returning();

  createdEndpointIds.push(created.id);
  return created;
}

async function cleanupTestEndpoints(): Promise<void> {
  if (db && createdEndpointIds.length > 0) {
    await db.delete(endpoints).where(inArray(endpoints.id, createdEndpointIds));
    createdEndpointIds.length = 0;
  }
}

// ---------------------------------------------------------------------------
// Scheduler Integration Reliability Test Suite
// ---------------------------------------------------------------------------

describe('Scheduler Integration Reliability Tests (Phase 7D)', () => {
  beforeEach(async () => {
    resetExecutionGuard();
    await cleanupTestEndpoints();
  });

  afterEach(async () => {
    resetExecutionGuard();
    await cleanupTestEndpoints();
  });

  // =========================================================================
  // REL-002: Single Healthy Target (UP)
  // =========================================================================
  describe('REL-002: Single Healthy Target (UP)', () => {
    it('accurately verifies UP classification, threshold check, and PostgreSQL persistence', async () => {
      const ep = await insertTestEndpoint('Reliability Target UP', '/up', 500);

      const summary = await runScheduledChecks();

      // Find the outcome for this test endpoint
      const result = summary.results.find((r) => r.endpointId === ep.id);
      expect(result).toBeDefined();
      expect(result?.outcome).toBe('completed');
      expect(result?.status).toBe('up');
      expect(result?.error).toBeNull();

      // Verify PostgreSQL row
      const savedChecks = await db
        .select()
        .from(checks)
        .where(inArray(checks.endpointId, [ep.id]));

      expect(savedChecks).toHaveLength(1);
      const checkRow = savedChecks[0];

      expect(checkRow.endpointId).toBe(ep.id);
      expect(checkRow.status).toBe('up');
      expect(checkRow.success).toBe(true);
      expect(checkRow.statusCode).toBe(200);
      expect(checkRow.latencyMs).not.toBeNull();
      expect(checkRow.latencyMs!).toBeGreaterThanOrEqual(0);
      expect(checkRow.latencyMs!).toBeLessThanOrEqual(500);
      expect(checkRow.errorType).toBeNull();
      expect(checkRow.checkedAt).toBeInstanceOf(Date);
    });
  });

  // =========================================================================
  // REL-003: Single Degraded Target (DEGRADED)
  // =========================================================================
  describe('REL-003: Single Degraded Target (DEGRADED)', () => {
    it('classifies response exceeding latency threshold as DEGRADED with latencyMs > threshold', async () => {
      // Configured threshold 100ms; server delays ~220ms
      const ep = await insertTestEndpoint('Reliability Target Degraded', '/degraded', 100);

      const summary = await runScheduledChecks();

      const result = summary.results.find((r) => r.endpointId === ep.id);
      expect(result).toBeDefined();
      expect(result?.outcome).toBe('completed');
      expect(result?.status).toBe('degraded');
      expect(result?.error).toBeNull();

      const savedChecks = await db
        .select()
        .from(checks)
        .where(inArray(checks.endpointId, [ep.id]));

      expect(savedChecks).toHaveLength(1);
      const checkRow = savedChecks[0];

      expect(checkRow.status).toBe('degraded');
      expect(checkRow.success).toBe(true);
      expect(checkRow.statusCode).toBe(200);
      expect(checkRow.latencyMs).not.toBeNull();
      // Threshold check: latency exceeds the 100ms threshold
      expect(checkRow.latencyMs!).toBeGreaterThan(100);
      expect(checkRow.errorType).toBeNull();
    });
  });

  // =========================================================================
  // REL-004: Single Down Target (DOWN)
  // =========================================================================
  describe('REL-004: Single Down Target (DOWN)', () => {
    it('classifies HTTP 500 as completed monitoring outcome with status DOWN', async () => {
      const ep = await insertTestEndpoint('Reliability Target Down', '/down', 500);

      const summary = await runScheduledChecks();

      const result = summary.results.find((r) => r.endpointId === ep.id);
      expect(result).toBeDefined();
      // Crucial: Target down is a successful monitoring result, NOT a scheduler failure
      expect(result?.outcome).toBe('completed');
      expect(result?.status).toBe('down');
      expect(result?.error).toBeNull();

      const savedChecks = await db
        .select()
        .from(checks)
        .where(inArray(checks.endpointId, [ep.id]));

      expect(savedChecks).toHaveLength(1);
      const checkRow = savedChecks[0];

      expect(checkRow.status).toBe('down');
      expect(checkRow.success).toBe(false);
      expect(checkRow.statusCode).toBe(500);
      expect(checkRow.latencyMs!).toBeGreaterThanOrEqual(0);
      expect(checkRow.errorType).toBe('http');
    });
  });

  // =========================================================================
  // REL-005: Mixed Workload (UP, DEGRADED, DOWN)
  // =========================================================================
  describe('REL-005: Mixed Workload (UP, DEGRADED, DOWN)', () => {
    it('processes UP, DEGRADED, and DOWN endpoints concurrently without target failure interference', async () => {
      const epUp = await insertTestEndpoint('Mixed Target UP', '/up', 500);
      const epDeg = await insertTestEndpoint('Mixed Target DEG', '/degraded', 100);
      const epDown = await insertTestEndpoint('Mixed Target DOWN', '/down', 500);

      const summary = await runScheduledChecks();

      const resUp = summary.results.find((r) => r.endpointId === epUp.id);
      const resDeg = summary.results.find((r) => r.endpointId === epDeg.id);
      const resDown = summary.results.find((r) => r.endpointId === epDown.id);

      expect(resUp?.outcome).toBe('completed');
      expect(resUp?.status).toBe('up');

      expect(resDeg?.outcome).toBe('completed');
      expect(resDeg?.status).toBe('degraded');

      expect(resDown?.outcome).toBe('completed');
      expect(resDown?.status).toBe('down');

      const savedChecks = await db
        .select()
        .from(checks)
        .where(inArray(checks.endpointId, [epUp.id, epDeg.id, epDown.id]));

      expect(savedChecks).toHaveLength(3);

      const rowUp = savedChecks.find((c) => c.endpointId === epUp.id);
      const rowDeg = savedChecks.find((c) => c.endpointId === epDeg.id);
      const rowDown = savedChecks.find((c) => c.endpointId === epDown.id);

      expect(rowUp).toBeDefined();
      expect(rowUp!.status).toBe('up');
      expect(rowUp!.latencyMs).toBeLessThanOrEqual(500);

      expect(rowDeg).toBeDefined();
      expect(rowDeg!.status).toBe('degraded');
      expect(rowDeg!.latencyMs).toBeGreaterThan(100);

      expect(rowDown).toBeDefined();
      expect(rowDown!.status).toBe('down');
      expect(rowDown!.statusCode).toBe(500);
    });
  });

  // =========================================================================
  // REL-008: Target HTTP Timeout Isolation
  // =========================================================================
  describe('REL-008: Target HTTP Timeout Isolation', () => {
    it(
      'isolates target timeout using AbortController, marks outcome completed/down with errorType timeout',
      async () => {
        const epUp = await insertTestEndpoint('Timeout Test UP', '/up', 500);
        const epTimeout = await insertTestEndpoint('Timeout Test Hanging', '/timeout', 500);

        const summary = await runScheduledChecks();

        const resUp = summary.results.find((r) => r.endpointId === epUp.id);
        const resTimeout = summary.results.find((r) => r.endpointId === epTimeout.id);

        expect(resUp?.status).toBe('up');
        expect(resUp?.outcome).toBe('completed');

        expect(resTimeout?.status).toBe('down');
        expect(resTimeout?.outcome).toBe('completed');

        const savedChecks = await db
          .select()
          .from(checks)
          .where(inArray(checks.endpointId, [epUp.id, epTimeout.id]));

        expect(savedChecks).toHaveLength(2);

        const timeoutRow = savedChecks.find((c) => c.endpointId === epTimeout.id);
        expect(timeoutRow?.status).toBe('down');
        expect(timeoutRow?.success).toBe(false);
        expect(timeoutRow?.errorType).toBe('timeout');
      },
      15000 // Allow up to 15s for the 5s AbortController timeout to fire cleanly
    );
  });

  // =========================================================================
  // REL-009: Target DNS Failure Isolation (Deterministic Injection)
  // =========================================================================
  describe('REL-009: Target DNS Failure Isolation', () => {
    it('isolates deterministic DNS resolution failure without external internet dependency', async () => {
      const epUp = await insertTestEndpoint('DNS Test Healthy', '/up', 500);
      const epDns = await insertTestEndpoint('DNS Test Failing', '/dns-failure', 500);

      const originalFetch = globalThis.fetch;

      // Intercept fetch ONLY for /dns-failure; let all other calls go to real loopback server
      globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = String(input);
        if (urlStr.includes('/dns-failure')) {
          const dnsError = new Error('getaddrinfo ENOTFOUND simulated-host.internal');
          Object.assign(dnsError, { code: 'ENOTFOUND' });
          return Promise.reject(dnsError);
        }
        return originalFetch(input, init);
      };

      try {
        const summary = await runScheduledChecks();

        const resUp = summary.results.find((r) => r.endpointId === epUp.id);
        const resDns = summary.results.find((r) => r.endpointId === epDns.id);

        expect(resUp?.status).toBe('up');
        expect(resUp?.outcome).toBe('completed');

        expect(resDns?.status).toBe('down');
        expect(resDns?.outcome).toBe('completed');

        const savedChecks = await db
          .select()
          .from(checks)
          .where(inArray(checks.endpointId, [epUp.id, epDns.id]));

        expect(savedChecks).toHaveLength(2);

        const dnsRow = savedChecks.find((c) => c.endpointId === epDns.id);
        expect(dnsRow?.status).toBe('down');
        expect(dnsRow?.success).toBe(false);
        expect(dnsRow?.errorType).toBe('dns');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // =========================================================================
  // REL-010: Target HTTP 4xx & 5xx Isolation
  // =========================================================================
  describe('REL-010: Target HTTP 4xx & 5xx Isolation', () => {
    it('records 400, 404, 502 as DOWN with preserved status_code and errorType http', async () => {
      const ep200 = await insertTestEndpoint('HTTP 200', '/up', 500);
      const ep400 = await insertTestEndpoint('HTTP 400', '/status-400', 500);
      const ep404 = await insertTestEndpoint('HTTP 404', '/status-404', 500);
      const ep502 = await insertTestEndpoint('HTTP 502', '/status-502', 500);

      const summary = await runScheduledChecks();

      const testResults = summary.results.filter((r) =>
        [ep200.id, ep400.id, ep404.id, ep502.id].includes(r.endpointId)
      );
      expect(testResults).toHaveLength(4);
      expect(testResults.every((r) => r.outcome === 'completed')).toBe(true);

      const savedChecks = await db
        .select()
        .from(checks)
        .where(inArray(checks.endpointId, [ep200.id, ep400.id, ep404.id, ep502.id]));

      expect(savedChecks).toHaveLength(4);

      const row200 = savedChecks.find((c) => c.endpointId === ep200.id);
      const row400 = savedChecks.find((c) => c.endpointId === ep400.id);
      const row404 = savedChecks.find((c) => c.endpointId === ep404.id);
      const row502 = savedChecks.find((c) => c.endpointId === ep502.id);

      expect(row200?.status).toBe('up');
      expect(row200?.success).toBe(true);
      expect(row200?.statusCode).toBe(200);

      expect(row400?.status).toBe('down');
      expect(row400?.success).toBe(false);
      expect(row400?.statusCode).toBe(400);
      expect(row400?.errorType).toBe('http');

      expect(row404?.status).toBe('down');
      expect(row404?.success).toBe(false);
      expect(row404?.statusCode).toBe(404);
      expect(row404?.errorType).toBe('http');

      expect(row502?.status).toBe('down');
      expect(row502?.success).toBe(false);
      expect(row502?.statusCode).toBe(502);
      expect(row502?.errorType).toBe('http');
    });
  });

  // =========================================================================
  // REL-021: Multi-Cycle Sequential Runs (5 Cycles x 3 Endpoints)
  // =========================================================================
  describe('REL-021: Multi-Cycle Sequential Runs', () => {
    it('creates exactly 15 distinct check records across 5 sequential runs for 3 endpoints', async () => {
      const ep1 = await insertTestEndpoint('MultiCycle 1', '/up?ep=1', 500);
      const ep2 = await insertTestEndpoint('MultiCycle 2', '/up?ep=2', 500);
      const ep3 = await insertTestEndpoint('MultiCycle 3', '/up?ep=3', 500);
      const testIds = [ep1.id, ep2.id, ep3.id];

      // Measure starting check count for these endpoints
      const checksBefore = await db
        .select()
        .from(checks)
        .where(inArray(checks.endpointId, testIds));
      expect(checksBefore).toHaveLength(0);

      // Execute 5 sequential cycles
      for (let cycle = 1; cycle <= 5; cycle++) {
        const summary = await runScheduledChecks();
        const cycleResults = summary.results.filter((r) => testIds.includes(r.endpointId));
        expect(cycleResults).toHaveLength(3);
        expect(cycleResults.every((r) => r.outcome === 'completed')).toBe(true);
      }

      // Query checks after 5 runs
      const checksAfter = await db
        .select()
        .from(checks)
        .where(inArray(checks.endpointId, testIds))
        .orderBy(checks.checkedAt);

      // Invariant 1: Exactly 15 total rows inserted (5 cycles * 3 endpoints)
      expect(checksAfter).toHaveLength(15);

      // Invariant 2: Each endpoint has exactly 5 records
      for (const id of testIds) {
        const epChecks = checksAfter.filter((c) => c.endpointId === id);
        expect(epChecks).toHaveLength(5);

        // Invariant 3: Monotonically increasing or distinct timestamps
        for (let i = 1; i < epChecks.length; i++) {
          expect(epChecks[i].checkedAt.getTime()).toBeGreaterThanOrEqual(
            epChecks[i - 1].checkedAt.getTime()
          );
        }

        // Invariant 4: All IDs are unique primary keys (no overwrite)
        const rowIds = new Set(epChecks.map((c) => c.id));
        expect(rowIds.size).toBe(5);
      }
    });
  });
});
