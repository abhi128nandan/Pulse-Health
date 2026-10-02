import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Endpoint } from '../db/schema';
import type { RunCheckResult } from './monitor';
import {
  MAX_CONCURRENCY,
  resetExecutionGuard,
  runScheduledChecks,
} from './scheduler';

// ---------------------------------------------------------------------------
// Mocking Setup
// ---------------------------------------------------------------------------

vi.mock('./endpoints', () => ({
  listEndpoints: vi.fn(),
}));

vi.mock('./monitor', () => ({
  runCheck: vi.fn(),
  isRunCheckSuccess: vi.fn((result: RunCheckResult) => result.ok === true),
}));

import { listEndpoints } from './endpoints';
import { runCheck } from './monitor';

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function makeEndpoint(overrides: Partial<Endpoint> = {}): Endpoint {
  return {
    id: 1,
    name: 'Reliability Test Endpoint',
    url: 'http://127.0.0.1/health',
    latencyThresholdMs: 500,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeEndpoints(count: number): Endpoint[] {
  return Array.from({ length: count }, (_, i) =>
    makeEndpoint({ id: i + 1, name: `Reliability Endpoint ${i + 1}` })
  );
}

function makeSuccessResult(
  status: 'up' | 'degraded' | 'down' = 'up',
  endpointId = 1
): RunCheckResult {
  return {
    ok: true,
    endpoint: makeEndpoint({ id: endpointId }),
    check: {
      id: 100 + endpointId,
      endpointId,
      checkedAt: new Date(),
      statusCode: status === 'down' ? 500 : 200,
      latencyMs: status === 'degraded' ? 600 : 80,
      success: status !== 'down',
      status,
      errorType: status === 'down' ? 'http' : null,
      errorMessage: status === 'down' ? 'HTTP request failed with status code 500' : null,
    },
    result: {
      statusCode: status === 'down' ? 500 : 200,
      latencyMs: status === 'degraded' ? 600 : 80,
      success: status !== 'down',
      status,
      errorType: status === 'down' ? 'http' : null,
      errorMessage: status === 'down' ? 'HTTP request failed with status code 500' : null,
    },
    id: 100 + endpointId,
    endpointId,
    checkedAt: new Date(),
    statusCode: status === 'down' ? 500 : 200,
    latencyMs: status === 'degraded' ? 600 : 80,
    success: status !== 'down',
    status,
    errorType: status === 'down' ? 'http' : null,
    errorMessage: status === 'down' ? 'HTTP request failed with status code 500' : null,
  };
}

// ---------------------------------------------------------------------------
// Scheduler Unit Reliability Test Suite
// ---------------------------------------------------------------------------

describe('Scheduler Unit Reliability Tests (Phase 7D)', () => {
  beforeEach(() => {
    resetExecutionGuard();
    vi.clearAllMocks();
  });

  // =========================================================================
  // REL-001: Zero Endpoints Handling
  // =========================================================================
  describe('REL-001: Zero Endpoints Handling', () => {
    it('completes cleanly with zero counts and empty results when listEndpoints returns []', async () => {
      vi.mocked(listEndpoints).mockResolvedValueOnce([]);

      const summary = await runScheduledChecks();

      expect(summary.success).toBe(true);
      expect(summary.totalEndpoints).toBe(0);
      expect(summary.attempted).toBe(0);
      expect(summary.succeeded).toBe(0);
      expect(summary.failed).toBe(0);
      expect(summary.durationMs).toBeGreaterThanOrEqual(0);
      expect(summary.results).toEqual([]);
      expect(runCheck).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // REL-006: Maximum Concurrency Ceiling (<= 5)
  // =========================================================================
  describe('REL-006: Maximum Concurrency Ceiling (<= 5)', () => {
    it('guarantees active concurrency never exceeds MAX_CONCURRENCY (5) across 12 endpoints', async () => {
      const endpoints = makeEndpoints(12);
      vi.mocked(listEndpoints).mockResolvedValueOnce(endpoints);

      let activeChecks = 0;
      let maxObservedConcurrency = 0;
      const processedIds = new Set<number>();

      vi.mocked(runCheck).mockImplementation(async (id: number) => {
        activeChecks++;
        maxObservedConcurrency = Math.max(maxObservedConcurrency, activeChecks);
        processedIds.add(id);

        try {
          await new Promise((resolve) => setTimeout(resolve, 30));
          return makeSuccessResult('up', id);
        } finally {
          activeChecks--;
        }
      });

      const summary = await runScheduledChecks();

      expect(maxObservedConcurrency).toBeLessThanOrEqual(MAX_CONCURRENCY);
      expect(maxObservedConcurrency).toBeGreaterThan(1);
      expect(processedIds.size).toBe(12);
      expect(summary.totalEndpoints).toBe(12);
      expect(summary.attempted).toBe(12);
      expect(summary.succeeded).toBe(12);
      expect(summary.failed).toBe(0);
      expect(activeChecks).toBe(0);
    });
  });

  // =========================================================================
  // REL-007: Sliding Worker Queue Behavior
  // =========================================================================
  describe('REL-007: Sliding Worker Queue Behavior', () => {
    it('proves that a freed worker pulls immediately without waiting for slower initial workers', async () => {
      // 7 endpoints: 1-4 slow (100ms), 5 fast (10ms), 6-7 normal (50ms)
      const endpoints = makeEndpoints(7);
      vi.mocked(listEndpoints).mockResolvedValueOnce(endpoints);

      let t5Done = 0;
      let t6Start = 0;
      let t1Done = 0;

      vi.mocked(runCheck).mockImplementation(async (id: number) => {
        if (id === 6) {
          t6Start = Date.now();
        }

        let delayMs = 50;
        if (id >= 1 && id <= 4) {
          delayMs = 120;
        } else if (id === 5) {
          delayMs = 10;
        }

        await new Promise((resolve) => setTimeout(resolve, delayMs));

        if (id === 5) {
          t5Done = Date.now();
        } else if (id === 1) {
          t1Done = Date.now();
        }

        return makeSuccessResult('up', id);
      });

      const summary = await runScheduledChecks();

      expect(summary.totalEndpoints).toBe(7);
      expect(summary.succeeded).toBe(7);
      expect(t5Done).toBeGreaterThan(0);
      expect(t6Start).toBeGreaterThan(0);
      expect(t1Done).toBeGreaterThan(0);

      // Invariant: Worker 5 completed early (10ms) and pulled Endpoint 6 immediately (t6Start)
      // before Worker 1 finished its 120ms task (t1Done).
      expect(t6Start).toBeLessThan(t1Done);
    });
  });

  // =========================================================================
  // REL-012: Persistence Crash on Single Endpoint
  // =========================================================================
  describe('REL-012: Persistence Crash on Single Endpoint', () => {
    it('isolates infrastructure failure on one endpoint while allowing remaining endpoints to complete', async () => {
      const endpoints = makeEndpoints(3);
      vi.mocked(listEndpoints).mockResolvedValueOnce(endpoints);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      vi.mocked(runCheck).mockImplementation(async (id: number) => {
        if (id === 2) {
          throw new Error('PostgreSQL write failed: disk full');
        }
        return makeSuccessResult('up', id);
      });

      const summary = await runScheduledChecks();

      expect(summary.totalEndpoints).toBe(3);
      expect(summary.attempted).toBe(3);
      expect(summary.succeeded).toBe(2);
      expect(summary.failed).toBe(1);

      // Endpoint 1: completed
      const res1 = summary.results.find((r) => r.endpointId === 1);
      expect(res1).toBeDefined();
      expect(res1?.outcome).toBe('completed');
      expect(res1?.status).toBe('up');
      expect(res1?.error).toBeNull();

      // Endpoint 2: error outcome, status null, error message recorded
      const res2 = summary.results.find((r) => r.endpointId === 2);
      expect(res2).toBeDefined();
      expect(res2?.outcome).toBe('error');
      expect(res2?.status).toBeNull();
      expect(res2?.error).toBe('PostgreSQL write failed: disk full');

      // Endpoint 3: completed
      const res3 = summary.results.find((r) => r.endpointId === 3);
      expect(res3).toBeDefined();
      expect(res3?.outcome).toBe('completed');
      expect(res3?.status).toBe('up');
      expect(res3?.error).toBeNull();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Scheduled check failed for endpoint 2: PostgreSQL write failed: disk full')
      );
      consoleErrorSpy.mockRestore();
    });
  });

  // =========================================================================
  // REL-013: Endpoint Deleted Mid-Run (ENDPOINT_NOT_FOUND)
  // =========================================================================
  describe('REL-013: Endpoint Deleted Mid-Run (ENDPOINT_NOT_FOUND)', () => {
    it('records ENDPOINT_NOT_FOUND as an error outcome and continues remaining endpoints', async () => {
      const endpoints = makeEndpoints(2);
      vi.mocked(listEndpoints).mockResolvedValueOnce(endpoints);

      vi.mocked(runCheck).mockImplementation(async (id: number) => {
        if (id === 2) {
          return {
            ok: false,
            success: false,
            error: 'ENDPOINT_NOT_FOUND',
            message: 'Endpoint with ID 2 not found',
          };
        }
        return makeSuccessResult('up', id);
      });

      const summary = await runScheduledChecks();

      expect(summary.totalEndpoints).toBe(2);
      expect(summary.attempted).toBe(2);
      expect(summary.succeeded).toBe(1);
      expect(summary.failed).toBe(1);

      const res1 = summary.results.find((r) => r.endpointId === 1);
      expect(res1?.outcome).toBe('completed');
      expect(res1?.status).toBe('up');

      const res2 = summary.results.find((r) => r.endpointId === 2);
      expect(res2?.outcome).toBe('error');
      expect(res2?.status).toBeNull();
      expect(res2?.error).toBe('Endpoint with ID 2 not found');
    });
  });

  // =========================================================================
  // REL-022: Partial Failure Benchmark Workload
  // =========================================================================
  describe('REL-022: Partial Failure Benchmark Workload', () => {
    it('accurately reports mixed workload: 1 UP, 1 DEGRADED, 1 DOWN, 1 INFRA ERROR, 1 NOT_FOUND', async () => {
      const endpoints = makeEndpoints(5);
      vi.mocked(listEndpoints).mockResolvedValueOnce(endpoints);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      vi.mocked(runCheck).mockImplementation(async (id: number) => {
        switch (id) {
          case 1:
            return makeSuccessResult('up', 1);
          case 2:
            return makeSuccessResult('degraded', 2);
          case 3:
            return makeSuccessResult('down', 3);
          case 4:
            throw new Error('DB Timeout');
          case 5:
            return {
              ok: false,
              success: false,
              error: 'ENDPOINT_NOT_FOUND',
              message: 'Endpoint with ID 5 not found',
            };
          default:
            return makeSuccessResult('up', id);
        }
      });

      const summary = await runScheduledChecks();

      expect(summary.totalEndpoints).toBe(5);
      expect(summary.attempted).toBe(5);
      // Endpoints 1, 2, 3 completed monitoring (target down counts as succeeded monitoring)
      expect(summary.succeeded).toBe(3);
      // Endpoints 4, 5 failed operationally
      expect(summary.failed).toBe(2);
      expect(summary.results).toHaveLength(5);

      const r1 = summary.results.find((r) => r.endpointId === 1);
      expect(r1).toEqual({
        endpointId: 1,
        endpointName: 'Reliability Endpoint 1',
        outcome: 'completed',
        status: 'up',
        error: null,
      });

      const r2 = summary.results.find((r) => r.endpointId === 2);
      expect(r2).toEqual({
        endpointId: 2,
        endpointName: 'Reliability Endpoint 2',
        outcome: 'completed',
        status: 'degraded',
        error: null,
      });

      const r3 = summary.results.find((r) => r.endpointId === 3);
      expect(r3).toEqual({
        endpointId: 3,
        endpointName: 'Reliability Endpoint 3',
        outcome: 'completed',
        status: 'down',
        error: null,
      });

      const r4 = summary.results.find((r) => r.endpointId === 4);
      expect(r4).toEqual({
        endpointId: 4,
        endpointName: 'Reliability Endpoint 4',
        outcome: 'error',
        status: null,
        error: 'DB Timeout',
      });

      const r5 = summary.results.find((r) => r.endpointId === 5);
      expect(r5).toEqual({
        endpointId: 5,
        endpointName: 'Reliability Endpoint 5',
        outcome: 'error',
        status: null,
        error: 'Endpoint with ID 5 not found',
      });

      consoleErrorSpy.mockRestore();
    });
  });
});
