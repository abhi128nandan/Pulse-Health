import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SchedulerRunSummary } from '../../../../services/scheduler';

// Mock the scheduler module BEFORE importing the route
vi.mock('../../../../services/scheduler', () => ({
  acquireExecutionGuard: vi.fn(),
  releaseExecutionGuard: vi.fn(),
  runScheduledChecks: vi.fn(),
}));

import {
  acquireExecutionGuard,
  releaseExecutionGuard,
  runScheduledChecks,
} from '../../../../services/scheduler';
import { POST } from './route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_SECRET = 'test-cron-secret-value-for-testing';

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3000/api/cron/check', {
    method: 'POST',
    headers,
  });
}

function makeAuthRequest(token: string = TEST_SECRET): Request {
  return makeRequest({ Authorization: `Bearer ${token}` });
}

function makeSchedulerSummary(
  overrides: Partial<SchedulerRunSummary> = {}
): SchedulerRunSummary {
  return {
    success: true,
    totalEndpoints: 3,
    attempted: 3,
    succeeded: 3,
    failed: 0,
    durationMs: 250,
    results: [
      {
        endpointId: 1,
        endpointName: 'API 1',
        outcome: 'completed',
        status: 'up',
        error: null,
      },
      {
        endpointId: 2,
        endpointName: 'API 2',
        outcome: 'completed',
        status: 'degraded',
        error: null,
      },
      {
        endpointId: 3,
        endpointName: 'API 3',
        outcome: 'completed',
        status: 'down',
        error: null,
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/cron/check', () => {
  const originalEnv = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = TEST_SECRET;
    // Default: guard acquisition succeeds
    vi.mocked(acquireExecutionGuard).mockReturnValue(true);
    vi.mocked(runScheduledChecks).mockResolvedValue(makeSchedulerSummary());
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.CRON_SECRET = originalEnv;
    } else {
      delete process.env.CRON_SECRET;
    }
  });

  // ========================================================================
  // Authentication Tests
  // ========================================================================
  describe('Authentication', () => {
    it('returns 500 when CRON_SECRET is not configured', async () => {
      delete process.env.CRON_SECRET;

      const response = await POST(makeAuthRequest());

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toEqual({ error: 'Internal server error' });
      expect(runScheduledChecks).not.toHaveBeenCalled();
    });

    it('returns 500 when CRON_SECRET is empty string', async () => {
      process.env.CRON_SECRET = '';

      const response = await POST(makeAuthRequest());

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toEqual({ error: 'Internal server error' });
    });

    it('returns 401 when Authorization header is missing', async () => {
      const response = await POST(makeRequest());

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: 'Unauthorized' });
      expect(runScheduledChecks).not.toHaveBeenCalled();
    });

    it('returns 401 when Authorization header is malformed (no Bearer prefix)', async () => {
      const response = await POST(makeRequest({ Authorization: 'Token abc123' }));

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: 'Unauthorized' });
    });

    it('returns 401 when Authorization is just "Bearer" with no token', async () => {
      const response = await POST(makeRequest({ Authorization: 'Bearer' }));

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: 'Unauthorized' });
    });

    it('returns 401 when the wrong secret is provided', async () => {
      const response = await POST(makeAuthRequest('wrong-secret'));

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: 'Unauthorized' });
      expect(runScheduledChecks).not.toHaveBeenCalled();
    });

    it('returns 200 and invokes scheduler with correct secret', async () => {
      const response = await POST(makeAuthRequest(TEST_SECRET));

      expect(response.status).toBe(200);
      expect(runScheduledChecks).toHaveBeenCalledTimes(1);
    });
  });

  // ========================================================================
  // Successful Execution Tests
  // ========================================================================
  describe('Successful execution', () => {
    it('returns exact scheduler summary as JSON', async () => {
      const summary = makeSchedulerSummary();
      vi.mocked(runScheduledChecks).mockResolvedValue(summary);

      const response = await POST(makeAuthRequest());

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.totalEndpoints).toBe(3);
      expect(data.attempted).toBe(3);
      expect(data.succeeded).toBe(3);
      expect(data.failed).toBe(0);
      expect(data.durationMs).toBe(250);
      expect(data.results).toHaveLength(3);
    });

    it('returns zero-endpoint summary correctly', async () => {
      vi.mocked(runScheduledChecks).mockResolvedValue(
        makeSchedulerSummary({
          totalEndpoints: 0,
          attempted: 0,
          succeeded: 0,
          failed: 0,
          durationMs: 2,
          results: [],
        })
      );

      const response = await POST(makeAuthRequest());

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.totalEndpoints).toBe(0);
      expect(data.attempted).toBe(0);
      expect(data.results).toEqual([]);
    });
  });

  // ========================================================================
  // Overlap Tests
  // ========================================================================
  describe('Overlap protection', () => {
    it('returns 200 with skipped=true when guard acquisition fails', async () => {
      vi.mocked(acquireExecutionGuard).mockReturnValue(false);

      const response = await POST(makeAuthRequest());

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.skipped).toBe(true);
      expect(data.reason).toBe('Previous scheduled check run is still active');
      expect(runScheduledChecks).not.toHaveBeenCalled();
    });
  });

  // ========================================================================
  // Error Handling Tests
  // ========================================================================
  describe('Error handling', () => {
    it('returns 500 when scheduler throws infrastructure error', async () => {
      vi.mocked(runScheduledChecks).mockRejectedValue(
        new Error('Database connection refused')
      );

      const response = await POST(makeAuthRequest());

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toEqual({ error: 'Internal server error' });
      // Must NOT leak the actual error message
      expect(JSON.stringify(data)).not.toContain('Database');
      expect(JSON.stringify(data)).not.toContain('connection');
    });

    it('releases guard after successful execution', async () => {
      vi.mocked(runScheduledChecks).mockResolvedValue(makeSchedulerSummary());

      await POST(makeAuthRequest());

      expect(releaseExecutionGuard).toHaveBeenCalledTimes(1);
    });

    it('releases guard after scheduler throws', async () => {
      vi.mocked(runScheduledChecks).mockRejectedValue(new Error('fail'));

      await POST(makeAuthRequest());

      expect(releaseExecutionGuard).toHaveBeenCalledTimes(1);
    });

    it('does not call releaseExecutionGuard when guard was not acquired (overlap)', async () => {
      vi.mocked(acquireExecutionGuard).mockReturnValue(false);

      await POST(makeAuthRequest());

      expect(releaseExecutionGuard).not.toHaveBeenCalled();
    });

    it('does not call releaseExecutionGuard on auth failure', async () => {
      await POST(makeAuthRequest('wrong'));

      expect(releaseExecutionGuard).not.toHaveBeenCalled();
    });
  });
});
