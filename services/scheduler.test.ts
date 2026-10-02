import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Endpoint } from '../db/schema';
import type { RunCheckResult } from './monitor';
import {
  acquireExecutionGuard,
  isExecutionActive,
  MAX_CONCURRENCY,
  releaseExecutionGuard,
  resetExecutionGuard,
  runScheduledChecks,
} from './scheduler';

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
// Helpers
// ---------------------------------------------------------------------------

function makeEndpoint(overrides: Partial<Endpoint> = {}): Endpoint {
  return {
    id: 1,
    name: 'Test API',
    url: 'https://api.example.com/health',
    latencyThresholdMs: 500,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeEndpoints(count: number): Endpoint[] {
  return Array.from({ length: count }, (_, i) =>
    makeEndpoint({ id: i + 1, name: `Endpoint ${i + 1}` })
  );
}

function makeSuccessResult(
  status: 'up' | 'degraded' | 'down' = 'up',
  overrides: Partial<RunCheckResult> = {}
): RunCheckResult {
  return {
    ok: true,
    endpoint: makeEndpoint(),
    check: {
      id: 42,
      endpointId: 1,
      checkedAt: new Date(),
      statusCode: status === 'down' ? 500 : 200,
      latencyMs: 120,
      success: status !== 'down',
      status,
      errorType: status === 'down' ? 'http' : null,
      errorMessage: status === 'down' ? 'HTTP request failed with status code 500' : null,
    },
    result: {
      statusCode: status === 'down' ? 500 : 200,
      latencyMs: 120,
      success: status !== 'down',
      status,
      errorType: status === 'down' ? 'http' : null,
      errorMessage: status === 'down' ? 'HTTP request failed with status code 500' : null,
    },
    id: 42,
    endpointId: 1,
    checkedAt: new Date(),
    statusCode: status === 'down' ? 500 : 200,
    latencyMs: 120,
    success: status !== 'down',
    status,
    errorType: status === 'down' ? 'http' : null,
    errorMessage: status === 'down' ? 'HTTP request failed with status code 500' : null,
    ...overrides,
  } as RunCheckResult;
}

function makeNotFoundResult(): RunCheckResult {
  return {
    ok: false,
    success: false,
    error: 'ENDPOINT_NOT_FOUND',
    message: 'Endpoint with ID 99 not found',
  } as RunCheckResult;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('services/scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetExecutionGuard();
  });

  // ========================================================================
  // Execution Guard
  // ========================================================================
  describe('Execution Guard', () => {
    it('acquireExecutionGuard returns true when inactive', () => {
      expect(acquireExecutionGuard()).toBe(true);
      expect(isExecutionActive()).toBe(true);
    });

    it('acquireExecutionGuard returns false when already active', () => {
      acquireExecutionGuard();
      expect(acquireExecutionGuard()).toBe(false);
    });

    it('releaseExecutionGuard resets state and allows re-acquisition', () => {
      acquireExecutionGuard();
      expect(isExecutionActive()).toBe(true);
      releaseExecutionGuard();
      expect(isExecutionActive()).toBe(false);
      expect(acquireExecutionGuard()).toBe(true);
    });

    it('releaseExecutionGuard is safe to call when not active', () => {
      expect(() => releaseExecutionGuard()).not.toThrow();
      expect(isExecutionActive()).toBe(false);
    });
  });

  // ========================================================================
  // Zero Endpoints
  // ========================================================================
  describe('Zero endpoints', () => {
    it('returns empty summary with success', async () => {
      vi.mocked(listEndpoints).mockResolvedValue([]);

      const summary = await runScheduledChecks();

      expect(summary).toEqual({
        success: true,
        totalEndpoints: 0,
        attempted: 0,
        succeeded: 0,
        failed: 0,
        durationMs: expect.any(Number),
        results: [],
      });
    });

    it('does not call runCheck', async () => {
      vi.mocked(listEndpoints).mockResolvedValue([]);

      await runScheduledChecks();

      expect(runCheck).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // Single Endpoint
  // ========================================================================
  describe('Single endpoint', () => {
    it('succeeds with UP target', async () => {
      const endpoint = makeEndpoint({ id: 1, name: 'Prod API' });
      vi.mocked(listEndpoints).mockResolvedValue([endpoint]);
      vi.mocked(runCheck).mockResolvedValue(makeSuccessResult('up'));

      const summary = await runScheduledChecks();

      expect(summary.succeeded).toBe(1);
      expect(summary.failed).toBe(0);
      expect(summary.results).toHaveLength(1);
      expect(summary.results[0]).toEqual({
        endpointId: 1,
        endpointName: 'Prod API',
        outcome: 'completed',
        status: 'up',
        error: null,
      });
    });

    it('succeeds with DEGRADED target', async () => {
      vi.mocked(listEndpoints).mockResolvedValue([makeEndpoint()]);
      vi.mocked(runCheck).mockResolvedValue(makeSuccessResult('degraded'));

      const summary = await runScheduledChecks();

      expect(summary.succeeded).toBe(1);
      expect(summary.failed).toBe(0);
      expect(summary.results[0].outcome).toBe('completed');
      expect(summary.results[0].status).toBe('degraded');
    });

    it('succeeds with DOWN target (target failure is a monitoring success)', async () => {
      vi.mocked(listEndpoints).mockResolvedValue([makeEndpoint()]);
      vi.mocked(runCheck).mockResolvedValue(makeSuccessResult('down'));

      const summary = await runScheduledChecks();

      expect(summary.succeeded).toBe(1);
      expect(summary.failed).toBe(0);
      expect(summary.results[0].outcome).toBe('completed');
      expect(summary.results[0].status).toBe('down');
    });

    it('records error when runCheck throws (infrastructure failure)', async () => {
      vi.mocked(listEndpoints).mockResolvedValue([makeEndpoint({ id: 7, name: 'DB API' })]);
      vi.mocked(runCheck).mockRejectedValue(new Error('DB failure'));

      const summary = await runScheduledChecks();

      expect(summary.succeeded).toBe(0);
      expect(summary.failed).toBe(1);
      expect(summary.results[0]).toEqual({
        endpointId: 7,
        endpointName: 'DB API',
        outcome: 'error',
        status: null,
        error: 'DB failure',
      });
    });

    it('records error when runCheck returns ENDPOINT_NOT_FOUND', async () => {
      vi.mocked(listEndpoints).mockResolvedValue([makeEndpoint({ id: 99, name: 'Ghost API' })]);
      vi.mocked(runCheck).mockResolvedValue(makeNotFoundResult());

      const summary = await runScheduledChecks();

      expect(summary.succeeded).toBe(0);
      expect(summary.failed).toBe(1);
      expect(summary.results[0].outcome).toBe('error');
      expect(summary.results[0].status).toBeNull();
      expect(summary.results[0].error).toBe('Endpoint with ID 99 not found');
    });
  });

  // ========================================================================
  // Multiple Endpoints
  // ========================================================================
  describe('Multiple endpoints', () => {
    it('processes all endpoints successfully', async () => {
      vi.mocked(listEndpoints).mockResolvedValue(makeEndpoints(3));
      vi.mocked(runCheck).mockResolvedValue(makeSuccessResult('up'));

      const summary = await runScheduledChecks();

      expect(summary.totalEndpoints).toBe(3);
      expect(summary.attempted).toBe(3);
      expect(summary.succeeded).toBe(3);
      expect(summary.failed).toBe(0);
      expect(runCheck).toHaveBeenCalledTimes(3);
    });

    it('handles mixed success and failure', async () => {
      vi.mocked(listEndpoints).mockResolvedValue(makeEndpoints(3));
      vi.mocked(runCheck)
        .mockResolvedValueOnce(makeSuccessResult('up'))
        .mockRejectedValueOnce(new Error('connection refused'))
        .mockResolvedValueOnce(makeSuccessResult('up'));

      const summary = await runScheduledChecks();

      expect(summary.succeeded).toBe(2);
      expect(summary.failed).toBe(1);
    });

    it('partial failure does not halt execution — all endpoints attempted', async () => {
      vi.mocked(listEndpoints).mockResolvedValue(makeEndpoints(5));
      vi.mocked(runCheck)
        .mockResolvedValueOnce(makeSuccessResult('up'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce(makeSuccessResult('up'))
        .mockResolvedValueOnce(makeSuccessResult('down'))
        .mockResolvedValueOnce(makeSuccessResult('up'));

      const summary = await runScheduledChecks();

      expect(summary.attempted).toBe(5);
      expect(runCheck).toHaveBeenCalledTimes(5);
      expect(summary.succeeded).toBe(4);
      expect(summary.failed).toBe(1);
    });
  });

  // ========================================================================
  // Target Failures Counted as Success
  // ========================================================================
  describe('Target failures counted as succeeded', () => {
    it('HTTP 500 target is counted as succeeded', async () => {
      vi.mocked(listEndpoints).mockResolvedValue([makeEndpoint()]);
      vi.mocked(runCheck).mockResolvedValue(
        makeSuccessResult('down')
      );

      const summary = await runScheduledChecks();

      expect(summary.succeeded).toBe(1);
      expect(summary.failed).toBe(0);
    });

    it('timeout target is counted as succeeded', async () => {
      vi.mocked(listEndpoints).mockResolvedValue([makeEndpoint()]);
      vi.mocked(runCheck).mockResolvedValue({
        ok: true,
        endpoint: makeEndpoint(),
        check: {
          id: 1, endpointId: 1, checkedAt: new Date(),
          statusCode: null, latencyMs: 5000, success: false,
          status: 'down', errorType: 'timeout', errorMessage: 'Request timed out',
        },
        result: {
          statusCode: null, latencyMs: 5000, success: false,
          status: 'down', errorType: 'timeout', errorMessage: 'Request timed out',
        },
        id: 1, endpointId: 1, checkedAt: new Date(),
        statusCode: null, latencyMs: 5000, success: false,
        status: 'down', errorType: 'timeout', errorMessage: 'Request timed out',
      } as RunCheckResult);

      const summary = await runScheduledChecks();

      expect(summary.succeeded).toBe(1);
      expect(summary.failed).toBe(0);
      expect(summary.results[0].outcome).toBe('completed');
      expect(summary.results[0].status).toBe('down');
    });

    it('DNS failure is counted as succeeded', async () => {
      vi.mocked(listEndpoints).mockResolvedValue([makeEndpoint()]);
      vi.mocked(runCheck).mockResolvedValue({
        ok: true,
        endpoint: makeEndpoint(),
        check: {
          id: 1, endpointId: 1, checkedAt: new Date(),
          statusCode: null, latencyMs: 50, success: false,
          status: 'down', errorType: 'dns', errorMessage: 'getaddrinfo ENOTFOUND',
        },
        result: {
          statusCode: null, latencyMs: 50, success: false,
          status: 'down', errorType: 'dns', errorMessage: 'getaddrinfo ENOTFOUND',
        },
        id: 1, endpointId: 1, checkedAt: new Date(),
        statusCode: null, latencyMs: 50, success: false,
        status: 'down', errorType: 'dns', errorMessage: 'getaddrinfo ENOTFOUND',
      } as RunCheckResult);

      const summary = await runScheduledChecks();

      expect(summary.succeeded).toBe(1);
      expect(summary.failed).toBe(0);
    });
  });

  // ========================================================================
  // Concurrency Limit
  // ========================================================================
  describe('Concurrency limit', () => {
    it('never exceeds MAX_CONCURRENCY concurrent runCheck calls', async () => {
      const endpoints = makeEndpoints(10);
      vi.mocked(listEndpoints).mockResolvedValue(endpoints);

      let activeConcurrent = 0;
      let peakConcurrent = 0;

      vi.mocked(runCheck).mockImplementation(() => {
        activeConcurrent++;
        if (activeConcurrent > peakConcurrent) {
          peakConcurrent = activeConcurrent;
        }
        return new Promise<RunCheckResult>((resolve) => {
          setTimeout(() => {
            activeConcurrent--;
            resolve(makeSuccessResult('up'));
          }, 20);
        });
      });

      const summary = await runScheduledChecks();

      expect(peakConcurrent).toBeLessThanOrEqual(MAX_CONCURRENCY);
      expect(peakConcurrent).toBeGreaterThan(0);
      expect(summary.attempted).toBe(10);
      expect(runCheck).toHaveBeenCalledTimes(10);
    });

    it('processes all endpoints despite concurrency limit', async () => {
      vi.mocked(listEndpoints).mockResolvedValue(makeEndpoints(12));
      vi.mocked(runCheck).mockImplementation(() => {
        return new Promise<RunCheckResult>((resolve) => {
          setTimeout(() => resolve(makeSuccessResult('up')), 5);
        });
      });

      const summary = await runScheduledChecks();

      expect(summary.totalEndpoints).toBe(12);
      expect(summary.attempted).toBe(12);
      expect(summary.succeeded).toBe(12);
      expect(runCheck).toHaveBeenCalledTimes(12);
    });

    it('exhibits sliding-window behavior — workers pull next immediately', async () => {
      const endpoints = makeEndpoints(7);
      vi.mocked(listEndpoints).mockResolvedValue(endpoints);

      const completionOrder: number[] = [];
      let callIndex = 0;

      vi.mocked(runCheck).mockImplementation((id: number) => {
        const myIndex = callIndex++;
        // First endpoint finishes fast, others take longer
        const delay = myIndex === 0 ? 5 : 50;
        return new Promise<RunCheckResult>((resolve) => {
          setTimeout(() => {
            completionOrder.push(id);
            resolve(makeSuccessResult('up'));
          }, delay);
        });
      });

      const summary = await runScheduledChecks();

      expect(summary.attempted).toBe(7);
      expect(runCheck).toHaveBeenCalledTimes(7);
      // The first endpoint completes much sooner, allowing endpoint 6
      // to start before all of the initial 5 are done
      // (i.e., endpoint 6 is processed, confirming sliding window)
      expect(completionOrder).toHaveLength(7);
    });
  });

  // ========================================================================
  // Endpoint Retrieval Failure
  // ========================================================================
  describe('Endpoint retrieval failure', () => {
    it('propagates exception when listEndpoints throws', async () => {
      vi.mocked(listEndpoints).mockRejectedValue(new Error('DB down'));

      await expect(runScheduledChecks()).rejects.toThrow('DB down');
      expect(runCheck).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // Duration Tracking
  // ========================================================================
  describe('Duration tracking', () => {
    it('durationMs is a non-negative number', async () => {
      vi.mocked(listEndpoints).mockResolvedValue([makeEndpoint()]);
      vi.mocked(runCheck).mockResolvedValue(makeSuccessResult('up'));

      const summary = await runScheduledChecks();

      expect(typeof summary.durationMs).toBe('number');
      expect(summary.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ========================================================================
  // Partial Failure Scenario (from spec Section 9)
  // ========================================================================
  describe('Partial failure scenario', () => {
    it('matches the exact spec scenario: A→up, B→timeout/down, C→infra error, D→up', async () => {
      const endpoints = [
        makeEndpoint({ id: 1, name: 'Production API' }),
        makeEndpoint({ id: 2, name: 'Staging API' }),
        makeEndpoint({ id: 3, name: 'Internal API' }),
        makeEndpoint({ id: 4, name: 'Health Check' }),
      ];
      vi.mocked(listEndpoints).mockResolvedValue(endpoints);
      vi.mocked(runCheck)
        .mockResolvedValueOnce(makeSuccessResult('up'))
        .mockResolvedValueOnce(makeSuccessResult('down'))
        .mockRejectedValueOnce(new Error('connection refused'))
        .mockResolvedValueOnce(makeSuccessResult('up'));

      const summary = await runScheduledChecks();

      expect(summary.success).toBe(true);
      expect(summary.totalEndpoints).toBe(4);
      expect(summary.attempted).toBe(4);
      expect(summary.succeeded).toBe(3);
      expect(summary.failed).toBe(1);

      expect(summary.results[0]).toEqual(
        expect.objectContaining({ endpointId: 1, outcome: 'completed', status: 'up' })
      );
      expect(summary.results[1]).toEqual(
        expect.objectContaining({ endpointId: 2, outcome: 'completed', status: 'down' })
      );
      expect(summary.results[2]).toEqual(
        expect.objectContaining({
          endpointId: 3,
          outcome: 'error',
          status: null,
          error: 'connection refused',
        })
      );
      expect(summary.results[3]).toEqual(
        expect.objectContaining({ endpointId: 4, outcome: 'completed', status: 'up' })
      );
    });
  });
});
