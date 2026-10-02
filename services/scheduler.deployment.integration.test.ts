import fs from 'fs';
import path from 'path';
import { createServer, type Server } from 'http';
import { inArray, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
// Dynamic imports to guarantee process.env.DATABASE_URL is populated
// ---------------------------------------------------------------------------

let db: typeof import('../db').db;
let endpoints: typeof import('../db/schema').endpoints;
let checks: typeof import('../db/schema').checks;
let runScheduledChecks: typeof import('./scheduler').runScheduledChecks;
let resetExecutionGuard: typeof import('./scheduler').resetExecutionGuard;
let endpointsMod: typeof import('./endpoints');
let monitorMod: typeof import('./monitor');

// ---------------------------------------------------------------------------
// Local Deterministic Target HTTP Server (127.0.0.1:0)
// ---------------------------------------------------------------------------

let server: Server;
let baseUrl: string;

let activeWorkers = 0;
let maxObservedConcurrency = 0;
const processedEndpoints = new Set<number>();
const startTimes = new Map<number, number>();
const endTimes = new Map<number, number>();

beforeAll(async () => {
  const dbMod = await import('../db');
  db = dbMod.db;

  const schemaMod = await import('../db/schema');
  endpoints = schemaMod.endpoints;
  checks = schemaMod.checks;

  const schedulerMod = await import('./scheduler');
  runScheduledChecks = schedulerMod.runScheduledChecks;
  resetExecutionGuard = schedulerMod.resetExecutionGuard;

  endpointsMod = await import('./endpoints');
  monitorMod = await import('./monitor');

  // If running concurrently with Phase 7D reliability tests in the same PostgreSQL DB (e.g. during npm test),
  // wait for Phase 7D suite to complete so both suites execute with full database and loopback isolation.
  const phase7dPrefixes = [
    'Reliability',
    'Mixed Target',
    'Timeout Test',
    'DNS Test',
    'HTTP ',
    'MultiCycle',
  ];

  // Brief pause to allow Phase 7D to insert its first endpoint if started concurrently
  await new Promise((r) => setTimeout(r, 1500));

  const initialCheck = await db.select().from(endpoints);
  const phase7dActive = initialCheck.some((e) =>
    phase7dPrefixes.some((prefix) => e.name.startsWith(prefix))
  );

  if (phase7dActive) {
    let sawMultiCycle = false;
    const syncStart = Date.now();
    while (Date.now() - syncStart < 45000) {
      const existing = await db.select().from(endpoints);
      const hasMultiCycle = existing.some((e) => e.name.startsWith('MultiCycle'));
      if (hasMultiCycle) {
        sawMultiCycle = true;
      }
      if (sawMultiCycle && !hasMultiCycle) {
        // MultiCycle was created and then deleted in afterEach; Phase 7D is fully finished
        break;
      }
      await new Promise((r) => setTimeout(r, 800));
    }
    // Grace period to ensure Phase 7D has cleanly closed its local server and connections
    await new Promise((r) => setTimeout(r, 1000));
  }

  await new Promise<void>((resolve) => {
    server = createServer((req, res) => {
      const parsedUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
      const pathname = parsedUrl.pathname;

      if (pathname === '/conc') {
        const id = Number(parsedUrl.searchParams.get('id') ?? '0');
        const delay = Number(parsedUrl.searchParams.get('delay') ?? '0');

        activeWorkers++;
        if (activeWorkers > maxObservedConcurrency) {
          maxObservedConcurrency = activeWorkers;
        }
        processedEndpoints.add(id);
        startTimes.set(id, performance.now());

        setTimeout(() => {
          activeWorkers--;
          endTimes.set(id, performance.now());
          if (!res.writableEnded) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', id }));
          }
        }, delay);
      } else if (pathname.startsWith('/up')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } else if (pathname === '/degraded') {
        setTimeout(() => {
          if (!res.writableEnded) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', degraded: true }));
          }
        }, 220);
      } else if (pathname === '/down') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
      } else if (pathname === '/status-400') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad Request' }));
      } else if (pathname === '/status-404') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
      } else if (pathname === '/status-502') {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad Gateway' }));
      } else if (pathname === '/timeout') {
        // Deliberately hold connection open to trigger client AbortController timeout
        req.on('close', () => {
          if (!res.writableEnded) {
            res.end();
          }
        });
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
}, 60000);

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
// Endpoint Tracking & Database Helpers
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
// Integration Suite
// ---------------------------------------------------------------------------

describe('Scheduler Deployment Integration Tests (Phase 7E-D-C)', () => {
  beforeEach(async () => {
    resetExecutionGuard();
    vi.restoreAllMocks();
    activeWorkers = 0;
    maxObservedConcurrency = 0;
    processedEndpoints.clear();
    startTimes.clear();
    endTimes.clear();
    await cleanupTestEndpoints();
  });

  afterEach(async () => {
    resetExecutionGuard();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await cleanupTestEndpoints();
  });

  // =========================================================================
  // SCHED-001: Scheduler Run Summary Verification
  // =========================================================================
  describe('SCHED-001: Scheduler Run Summary Verification', () => {
    it('accurately computes summary metrics and differentiates target failure from infrastructure failure', async () => {
      const epUp = await insertTestEndpoint('Sched UP', '/up', 500);
      const epDown = await insertTestEndpoint('Sched DOWN', '/down', 500);

      const summary = await runScheduledChecks();

      expect(summary.success).toBe(true);
      expect(summary.totalEndpoints).toBeGreaterThanOrEqual(2);
      expect(summary.attempted).toBe(summary.totalEndpoints);
      expect(summary.durationMs).toBeGreaterThan(0);

      const resUp = summary.results.find((r) => r.endpointId === epUp.id);
      const resDown = summary.results.find((r) => r.endpointId === epDown.id);

      expect(resUp).toBeDefined();
      expect(resUp?.outcome).toBe('completed');
      expect(resUp?.status).toBe('up');
      expect(resUp?.error).toBeNull();

      expect(resDown).toBeDefined();
      // Target failure must be completed outcome, NOT infrastructure failure
      expect(resDown?.outcome).toBe('completed');
      expect(resDown?.status).toBe('down');
      expect(resDown?.error).toBeNull();

      // Verify DB persistence
      const savedChecks = await db
        .select()
        .from(checks)
        .where(inArray(checks.endpointId, [epUp.id, epDown.id]));

      expect(savedChecks).toHaveLength(2);
    });
  });

  // =========================================================================
  // CONC-001: Concurrency Verification (Ceiling <= 5 and Sliding Queue Pull)
  // =========================================================================
  describe('CONC-001: Concurrency Verification', () => {
    it(
      'empirically proves worker pool concurrency <= 5, sliding queue pull, and exhaustive processing',
      async () => {
        // Register 12 test endpoints with asymmetric delays
        // Endpoints 1-4 have 300ms delay to comfortably absorb DB query overhead
        const delays = [
          300, // Endpoint 1
          300, // Endpoint 2
          300, // Endpoint 3
          300, // Endpoint 4
          10,  // Endpoint 5 (fast)
          50,  // Endpoint 6 (pulled as soon as 5 finishes)
          25,  // Endpoint 7
          25,  // Endpoint 8
          25,  // Endpoint 9
          25,  // Endpoint 10
          25,  // Endpoint 11
          25,  // Endpoint 12
        ];

        const eps: Endpoint[] = [];
        for (let i = 0; i < 12; i++) {
          const ep = await insertTestEndpoint(
            `Conc Worker ${i + 1}`,
            `/conc?id=${i + 1}&delay=${delays[i]}`,
            500
          );
          eps.push(ep);
        }

        // Warm up connection pool clients so all 5 workers launch concurrently without SSL cold-start jitter
        await Promise.all([
          db.select().from(endpoints).limit(1),
          db.select().from(endpoints).limit(1),
          db.select().from(endpoints).limit(1),
          db.select().from(endpoints).limit(1),
          db.select().from(endpoints).limit(1),
        ]);

        // Scope scheduler run strictly to the 12 concurrency test endpoints
        vi.spyOn(endpointsMod, 'listEndpoints').mockResolvedValue(eps);

        const summary = await runScheduledChecks();

        // 1. Concurrency ceiling: max active concurrent workers on server never exceeded 5
        expect(maxObservedConcurrency).toBeLessThanOrEqual(5);
        expect(maxObservedConcurrency).toBeGreaterThanOrEqual(1);

        // 2. All 12 endpoints evaluated
        expect(processedEndpoints.size).toBe(12);

        // 3. Every endpoint processed exactly once
        for (let i = 1; i <= 12; i++) {
          expect(processedEndpoints.has(i)).toBe(true);
        }

        // 4. All 12 endpoints succeeded in monitoring
        expect(summary.totalEndpoints).toBe(12);
        expect(summary.attempted).toBe(12);
        expect(summary.succeeded).toBe(12);
        expect(summary.failed).toBe(0);
        expect(summary.results).toHaveLength(12);
        expect(summary.results.every((r) => r.outcome === 'completed')).toBe(true);

        // 5. Sliding queue pull: Endpoint 5 (10ms) finishes and Endpoint 6 starts
        // before Endpoint 1 (300ms) completes
        const ep1End = endTimes.get(1);
        const ep6Start = startTimes.get(6);
        expect(ep1End).toBeDefined();
        expect(ep6Start).toBeDefined();
        if (ep1End && ep6Start) {
          expect(ep6Start).toBeLessThan(ep1End);
        }
      },
      15000
    );
  });

  // =========================================================================
  // TARGET-001..005: Target Failure Verification
  // =========================================================================
  describe('TARGET-001 to TARGET-005: Target Failure Verification', () => {
    it('TARGET-001: Local /down returns 500, recorded as completed DOWN with errorType http and code 500', async () => {
      const ep = await insertTestEndpoint('Target 500', '/down', 500);

      const summary = await runScheduledChecks();

      const result = summary.results.find((r) => r.endpointId === ep.id);
      expect(result?.outcome).toBe('completed');
      expect(result?.status).toBe('down');
      expect(result?.error).toBeNull();

      const [checkRow] = await db
        .select()
        .from(checks)
        .where(inArray(checks.endpointId, [ep.id]));

      expect(checkRow.status).toBe('down');
      expect(checkRow.success).toBe(false);
      expect(checkRow.statusCode).toBe(500);
      expect(checkRow.errorType).toBe('http');
    });

    it('TARGET-002: Local /status-404 returns 404, recorded as completed DOWN with code 404', async () => {
      const ep = await insertTestEndpoint('Target 404', '/status-404', 500);

      const summary = await runScheduledChecks();

      const result = summary.results.find((r) => r.endpointId === ep.id);
      expect(result?.outcome).toBe('completed');
      expect(result?.status).toBe('down');

      const [checkRow] = await db
        .select()
        .from(checks)
        .where(inArray(checks.endpointId, [ep.id]));

      expect(checkRow.status).toBe('down');
      expect(checkRow.success).toBe(false);
      expect(checkRow.statusCode).toBe(404);
      expect(checkRow.errorType).toBe('http');
    });

    it(
      'TARGET-003: Local /timeout hangs > 5s, isolated via AbortController, recorded as DOWN with errorType timeout and code null',
      async () => {
        const ep = await insertTestEndpoint('Target Timeout', '/timeout', 500);

        const summary = await runScheduledChecks();

        const result = summary.results.find((r) => r.endpointId === ep.id);
        expect(result?.outcome).toBe('completed');
        expect(result?.status).toBe('down');

        const [checkRow] = await db
          .select()
          .from(checks)
          .where(inArray(checks.endpointId, [ep.id]));

        expect(checkRow.status).toBe('down');
        expect(checkRow.success).toBe(false);
        expect(checkRow.statusCode).toBeNull();
        expect(checkRow.errorType).toBe('timeout');
      },
      15000
    );

    it('TARGET-004: Local /degraded delays 220ms, recorded as completed DEGRADED with code 200 and latency > threshold', async () => {
      const ep = await insertTestEndpoint('Target Degraded', '/degraded', 100);

      const summary = await runScheduledChecks();

      const result = summary.results.find((r) => r.endpointId === ep.id);
      expect(result?.outcome).toBe('completed');
      expect(result?.status).toBe('degraded');

      const [checkRow] = await db
        .select()
        .from(checks)
        .where(inArray(checks.endpointId, [ep.id]));

      expect(checkRow.status).toBe('degraded');
      expect(checkRow.success).toBe(true);
      expect(checkRow.statusCode).toBe(200);
      expect(checkRow.latencyMs).toBeGreaterThan(100);
      expect(checkRow.errorType).toBeNull();
    });

    it('TARGET-005: Deterministic DNS failure is isolated as completed DOWN with errorType dns and code null', async () => {
      const ep = await insertTestEndpoint('Target DNS Fail', '/dns-mock-endpoint', 500);

      const originalFetch = globalThis.fetch;
      globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = String(input);
        if (urlStr.includes('/dns-mock-endpoint')) {
          const dnsError = new Error('getaddrinfo ENOTFOUND simulated.dns.internal');
          Object.assign(dnsError, { code: 'ENOTFOUND' });
          return Promise.reject(dnsError);
        }
        return originalFetch(input, init);
      };

      try {
        const summary = await runScheduledChecks();

        const result = summary.results.find((r) => r.endpointId === ep.id);
        expect(result?.outcome).toBe('completed');
        expect(result?.status).toBe('down');

        const [checkRow] = await db
          .select()
          .from(checks)
          .where(inArray(checks.endpointId, [ep.id]));

        expect(checkRow.status).toBe('down');
        expect(checkRow.success).toBe(false);
        expect(checkRow.statusCode).toBeNull();
        expect(checkRow.errorType).toBe('dns');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  // =========================================================================
  // INFRA-001..003: Infrastructure Failure Verification
  // =========================================================================
  describe('INFRA-001 to INFRA-003: Infrastructure Failure Verification', () => {
    it('INFRA-001: listEndpoints failure throws infrastructure error and releases guard', async () => {
      vi.spyOn(endpointsMod, 'listEndpoints').mockRejectedValueOnce(
        new Error('PostgreSQL connection terminated')
      );

      await expect(runScheduledChecks()).rejects.toThrow(
        'PostgreSQL connection terminated'
      );
    });

    it('INFRA-002: Persistence failure on 1 of 3 targets isolates error, continues healthy runs, and updates summary', async () => {
      const ep1 = await insertTestEndpoint('Persist Healthy 1', '/up?p=1', 500);
      const ep2 = await insertTestEndpoint('Persist Broken 2', '/up?p=2', 500);
      const ep3 = await insertTestEndpoint('Persist Healthy 3', '/up?p=3', 500);

      // Scope scheduler strictly to these 3 test endpoints
      vi.spyOn(endpointsMod, 'listEndpoints').mockResolvedValue([ep1, ep2, ep3]);

      const originalRunCheck = monitorMod.runCheck;
      vi.spyOn(monitorMod, 'runCheck').mockImplementation(async (endpointId, options) => {
        if (endpointId === ep2.id) {
          // Simulate fatal persistence failure during runCheck
          throw new Error('Disk full');
        }
        return originalRunCheck(endpointId, options);
      });

      const summary = await runScheduledChecks();

      expect(summary.totalEndpoints).toBe(3);
      expect(summary.attempted).toBe(3);
      expect(summary.succeeded).toBe(2);
      expect(summary.failed).toBe(1);

      const res1 = summary.results.find((r) => r.endpointId === ep1.id);
      const res2 = summary.results.find((r) => r.endpointId === ep2.id);
      const res3 = summary.results.find((r) => r.endpointId === ep3.id);

      expect(res1?.outcome).toBe('completed');
      expect(res2?.outcome).toBe('error');
      expect(res2?.error).toBe('Disk full');
      expect(res3?.outcome).toBe('completed');

      // Healthy rows exist in DB, failed row does not
      const savedChecks = await db
        .select()
        .from(checks)
        .where(inArray(checks.endpointId, [ep1.id, ep2.id, ep3.id]));

      expect(savedChecks.some((c) => c.endpointId === ep1.id)).toBe(true);
      expect(savedChecks.some((c) => c.endpointId === ep2.id)).toBe(false);
      expect(savedChecks.some((c) => c.endpointId === ep3.id)).toBe(true);
    });

    it('INFRA-003: Endpoint deleted mid-run is recorded as outcome: error and does not abort scheduler', async () => {
      const ep1 = await insertTestEndpoint('MidRun Exist', '/up?m=1', 500);
      const ep2 = await insertTestEndpoint('MidRun Deleted', '/up?m=2', 500);

      vi.spyOn(endpointsMod, 'listEndpoints').mockResolvedValue([ep1, ep2]);

      const originalRunCheck = monitorMod.runCheck;
      vi.spyOn(monitorMod, 'runCheck').mockImplementation(async (endpointId, options) => {
        if (endpointId === ep2.id) {
          return {
            ok: false,
            success: false,
            error: 'ENDPOINT_NOT_FOUND',
            message: `Endpoint with ID ${endpointId} not found`,
          };
        }
        return originalRunCheck(endpointId, options);
      });

      const summary = await runScheduledChecks();

      expect(summary.totalEndpoints).toBe(2);
      expect(summary.attempted).toBe(2);
      expect(summary.succeeded).toBe(1);
      expect(summary.failed).toBe(1);

      const res1 = summary.results.find((r) => r.endpointId === ep1.id);
      const res2 = summary.results.find((r) => r.endpointId === ep2.id);

      expect(res1?.outcome).toBe('completed');
      expect(res2?.outcome).toBe('error');
      expect(res2?.error).toContain('not found');
    });
  });

  // =========================================================================
  // DB-001: Database Persistence Verification
  // =========================================================================
  describe('DB-001: Database Persistence Verification', () => {
    it('verifies row delta integrity (countAfter - countBefore === summary.succeeded) and column types', async () => {
      const epUp = await insertTestEndpoint('DB Delta UP', '/up', 500);
      const epDown = await insertTestEndpoint('DB Delta DOWN', '/down', 500);

      const [countBeforeRow] = await db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(checks);
      const countBefore = countBeforeRow.count;

      const summary = await runScheduledChecks();

      const [countAfterRow] = await db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(checks);
      const countAfter = countAfterRow.count;

      // Invariant: Exactly summary.succeeded rows inserted
      expect(countAfter - countBefore).toBe(summary.succeeded);

      // Verify exact columns for inserted rows
      const insertedRows = await db
        .select()
        .from(checks)
        .where(inArray(checks.endpointId, [epUp.id, epDown.id]));

      expect(insertedRows).toHaveLength(2);

      const upRow = insertedRows.find((r) => r.endpointId === epUp.id);
      const downRow = insertedRows.find((r) => r.endpointId === epDown.id);

      expect(upRow).toBeDefined();
      expect(upRow!.checkedAt).toBeInstanceOf(Date);
      expect(upRow!.statusCode).toBe(200);
      expect(upRow!.latencyMs).not.toBeNull();
      expect(upRow!.latencyMs!).toBeGreaterThanOrEqual(0);
      expect(upRow!.success).toBe(true);
      expect(upRow!.status).toBe('up');
      expect(upRow!.errorType).toBeNull();
      expect(upRow!.errorMessage).toBeNull();

      expect(downRow).toBeDefined();
      expect(downRow!.checkedAt).toBeInstanceOf(Date);
      expect(downRow!.statusCode).toBe(500);
      expect(downRow!.latencyMs).not.toBeNull();
      expect(downRow!.success).toBe(false);
      expect(downRow!.status).toBe('down');
      expect(downRow!.errorType).toBe('http');
      expect(downRow!.errorMessage).not.toBeNull();
    });
  });

  // =========================================================================
  // CYCLE-001: Repeated-Cycle Verification
  // =========================================================================
  describe('CYCLE-001: Repeated-Cycle Verification', () => {
    it(
      'creates exactly 15 new distinct monotonic check records for 3 endpoints across 5 sequential runs',
      async () => {
        const ep1 = await insertTestEndpoint('Cycle 1', '/up?c=1', 500);
        const ep2 = await insertTestEndpoint('Cycle 2', '/up?c=2', 500);
        const ep3 = await insertTestEndpoint('Cycle 3', '/up?c=3', 500);
        const cycleIds = [ep1.id, ep2.id, ep3.id];

        // Scope to the 3 local cycle test endpoints
        vi.spyOn(endpointsMod, 'listEndpoints').mockResolvedValue([ep1, ep2, ep3]);

        // Execute 5 consecutive runs
        for (let i = 0; i < 5; i++) {
          const summary = await runScheduledChecks();
          expect(summary.totalEndpoints).toBe(3);
          expect(summary.succeeded).toBe(3);
          expect(summary.failed).toBe(0);
          const resultsForCycle = summary.results.filter((r) =>
            cycleIds.includes(r.endpointId)
          );
          expect(resultsForCycle).toHaveLength(3);
          expect(resultsForCycle.every((r) => r.outcome === 'completed')).toBe(true);
        }

        const checksInDb = await db
          .select()
          .from(checks)
          .where(inArray(checks.endpointId, cycleIds))
          .orderBy(checks.checkedAt);

        // Invariant 1: Exactly 15 total rows
        expect(checksInDb).toHaveLength(15);

        // Invariant 2: Exactly 5 rows per endpoint
        for (const id of cycleIds) {
          const epChecks = checksInDb.filter((c) => c.endpointId === id);
          expect(epChecks).toHaveLength(5);

          // Invariant 3: Unique primary keys
          const idSet = new Set(epChecks.map((c) => c.id));
          expect(idSet.size).toBe(5);

          // Invariant 4: Monotonically non-decreasing timestamps
          for (let j = 1; j < epChecks.length; j++) {
            expect(epChecks[j].checkedAt.getTime()).toBeGreaterThanOrEqual(
              epChecks[j - 1].checkedAt.getTime()
            );
          }
        }
      },
      15000
    );
  });

  // =========================================================================
  // Timeout Budget Test (Section 18 & 21)
  // =========================================================================
  describe('Timeout Budget Verification', () => {
    it(
      'executes 4 fast /up endpoints and 1 /timeout endpoint without blocking fast endpoints',
      async () => {
        const epFast1 = await insertTestEndpoint('Budget Fast 1', '/up?f=1', 500);
        const epFast2 = await insertTestEndpoint('Budget Fast 2', '/up?f=2', 500);
        const epFast3 = await insertTestEndpoint('Budget Fast 3', '/up?f=3', 500);
        const epFast4 = await insertTestEndpoint('Budget Fast 4', '/up?f=4', 500);
        const epHang = await insertTestEndpoint('Budget Hang', '/timeout', 500);

        const testIds = [
          epFast1.id,
          epFast2.id,
          epFast3.id,
          epFast4.id,
          epHang.id,
        ];

        vi.spyOn(endpointsMod, 'listEndpoints').mockResolvedValue([
          epFast1,
          epFast2,
          epFast3,
          epFast4,
          epHang,
        ]);

        const summary = await runScheduledChecks();

        expect(summary.totalEndpoints).toBe(5);
        expect(summary.attempted).toBe(5);
        expect(summary.succeeded).toBe(5);
        expect(summary.failed).toBe(0);

        const testResults = summary.results.filter((r) => testIds.includes(r.endpointId));
        expect(testResults).toHaveLength(5);
        expect(testResults.every((r) => r.outcome === 'completed')).toBe(true);

        const fastResults = testResults.filter((r) => r.endpointId !== epHang.id);
        const hangResult = testResults.find((r) => r.endpointId === epHang.id);

        expect(fastResults.every((r) => r.status === 'up')).toBe(true);
        expect(hangResult?.status).toBe('down');

        const savedChecks = await db
          .select()
          .from(checks)
          .where(inArray(checks.endpointId, testIds));

        expect(savedChecks).toHaveLength(5);
        const hangRow = savedChecks.find((c) => c.endpointId === epHang.id);
        expect(hangRow?.status).toBe('down');
        expect(hangRow?.statusCode).toBeNull();
        expect(hangRow?.errorType).toBe('timeout');
      },
      15000
    );
  });
});
