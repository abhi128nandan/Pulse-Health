import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SchedulerRunSummary } from '../../../../services/scheduler';

// ---------------------------------------------------------------------------
// Mocking Setup: Mock ONLY runScheduledChecks; keep execution guard 100% REAL
// ---------------------------------------------------------------------------

vi.mock('../../../../services/scheduler', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../services/scheduler')>();
  return {
    ...actual,
    runScheduledChecks: vi.fn(),
  };
});

import {
  isExecutionActive,
  resetExecutionGuard,
  runScheduledChecks,
} from '../../../../services/scheduler';
import { POST } from './route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_SECRET = 'test-cron-secret-sentinel-value-12345';

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
    durationMs: 150,
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
// Route & Boundary Reliability Test Suite
// ---------------------------------------------------------------------------

describe('Route & Boundary Reliability Tests (Phase 7D)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.CRON_SECRET = TEST_SECRET;
    resetExecutionGuard();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetExecutionGuard();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // =========================================================================
  // REL-011: Endpoint List / Database Query Crash
  // =========================================================================
  describe('REL-011: Endpoint List / Database Query Crash', () => {
    it('returns HTTP 500 without stack trace and releases execution guard when scheduler throws', async () => {
      vi.mocked(runScheduledChecks).mockRejectedValueOnce(
        new Error('DB Connection Terminated')
      );

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await POST(makeAuthRequest());

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: 'Internal server error' });
      expect(JSON.stringify(body)).not.toContain('DB Connection Terminated');

      // Invariant: Guard must be released in finally block
      expect(isExecutionActive()).toBe(false);

      // Verify a subsequent request can acquire the guard
      vi.mocked(runScheduledChecks).mockResolvedValueOnce(makeSchedulerSummary());
      const nextResponse = await POST(makeAuthRequest());
      expect(nextResponse.status).toBe(200);

      consoleErrorSpy.mockRestore();
    });
  });

  // =========================================================================
  // REL-014: Missing Authorization Header
  // =========================================================================
  describe('REL-014: Missing Authorization Header', () => {
    it('returns HTTP 401 when Authorization header is omitted and does not execute scheduler', async () => {
      const response = await POST(makeRequest());

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body).toEqual({ error: 'Unauthorized' });
      expect(runScheduledChecks).not.toHaveBeenCalled();
      expect(isExecutionActive()).toBe(false);
    });
  });

  // =========================================================================
  // REL-015: Malformed Authorization Header
  // =========================================================================
  describe('REL-015: Malformed Authorization Header', () => {
    it('returns HTTP 401 for Basic auth scheme', async () => {
      const response = await POST(makeRequest({ Authorization: 'Basic dXNlcjpwYXNz' }));

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Unauthorized' });
      expect(runScheduledChecks).not.toHaveBeenCalled();
    });

    it('returns HTTP 401 for Bearer with no token', async () => {
      const response = await POST(makeRequest({ Authorization: 'Bearer' }));

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Unauthorized' });
      expect(runScheduledChecks).not.toHaveBeenCalled();
    });

    it('returns HTTP 401 for Bearer with only whitespace', async () => {
      const response = await POST(makeRequest({ Authorization: 'Bearer    ' }));

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Unauthorized' });
      expect(runScheduledChecks).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // REL-016: Incorrect Secret
  // =========================================================================
  describe('REL-016: Incorrect Secret', () => {
    it('returns HTTP 401 for secret of different length without throwing buffer error', async () => {
      const response = await POST(makeAuthRequest('short-token'));

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Unauthorized' });
      expect(runScheduledChecks).not.toHaveBeenCalled();
    });

    it('returns HTTP 401 for secret with exact same byte length but incorrect characters', async () => {
      // Create a string with the exact same length as TEST_SECRET but different characters
      const wrongSecretSameLength = 'x'.repeat(TEST_SECRET.length);

      const response = await POST(makeAuthRequest(wrongSecretSameLength));

      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: 'Unauthorized' });
      expect(runScheduledChecks).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // REL-017: Correct Secret Execution
  // =========================================================================
  describe('REL-017: Correct Secret Execution', () => {
    it('returns HTTP 200 with summary when correct Bearer secret is provided', async () => {
      const expectedSummary = makeSchedulerSummary();
      vi.mocked(runScheduledChecks).mockResolvedValueOnce(expectedSummary);

      const response = await POST(makeAuthRequest(TEST_SECRET));

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual(expectedSummary);
      expect(runScheduledChecks).toHaveBeenCalledTimes(1);
      expect(isExecutionActive()).toBe(false);
    });
  });

  // =========================================================================
  // REL-018: Missing Server Secret Configuration
  // =========================================================================
  describe('REL-018: Missing Server Secret Configuration', () => {
    it('returns HTTP 500 without revealing missing configuration when CRON_SECRET is unset', async () => {
      delete process.env.CRON_SECRET;

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const response = await POST(makeAuthRequest('any-token'));

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: 'Internal server error' });
      expect(JSON.stringify(body)).not.toContain('CRON_SECRET');
      expect(runScheduledChecks).not.toHaveBeenCalled();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'CRON_SECRET environment variable is not configured'
      );
      consoleErrorSpy.mockRestore();
    });
  });

  // =========================================================================
  // REL-019: Overlapping Execution Prevention
  // =========================================================================
  describe('REL-019: Overlapping Execution Prevention', () => {
    it('returns HTTP 200 skipped when a run is already active, and does not hijack the guard', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Request 1 takes 150ms to finish
      vi.mocked(runScheduledChecks).mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        return makeSchedulerSummary();
      });

      // Start Request 1
      const request1Promise = POST(makeAuthRequest());

      // Yield event loop briefly to ensure Request 1 has acquired the guard
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(isExecutionActive()).toBe(true);

      // Start Request 2 while Request 1 is still in flight
      const request2Response = await POST(makeAuthRequest());

      // Request 2 must return HTTP 200 skipped
      expect(request2Response.status).toBe(200);
      const request2Body = await request2Response.json();
      expect(request2Body).toEqual({
        success: true,
        skipped: true,
        reason: 'Previous scheduled check run is still active',
      });

      // Invariant: Request 2 must NOT have released Request 1's guard
      expect(isExecutionActive()).toBe(true);

      // Await Request 1 completion
      const request1Response = await request1Promise;
      expect(request1Response.status).toBe(200);
      const request1Body = await request1Response.json();
      expect(request1Body.success).toBe(true);
      expect(request1Body.skipped).toBeUndefined();

      // Guard must now be released
      expect(isExecutionActive()).toBe(false);

      // Subsequent Request 3 can now execute normally
      vi.mocked(runScheduledChecks).mockResolvedValueOnce(makeSchedulerSummary());
      const request3Response = await POST(makeAuthRequest());
      expect(request3Response.status).toBe(200);
      const request3Body = await request3Response.json();
      expect(request3Body.skipped).toBeUndefined();

      consoleWarnSpy.mockRestore();
    });
  });

  // =========================================================================
  // REL-020: Guard Release Guarantee on Fatal Crash
  // =========================================================================
  describe('REL-020: Guard Release Guarantee on Fatal Crash', () => {
    it('guarantees guard is released in finally even if runScheduledChecks throws', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      vi.mocked(runScheduledChecks).mockRejectedValueOnce(
        new Error('Catastrophic failure inside scheduler')
      );

      const response1 = await POST(makeAuthRequest());
      expect(response1.status).toBe(500);

      // Guard must be released despite the crash
      expect(isExecutionActive()).toBe(false);

      // Immediate subsequent request must succeed
      vi.mocked(runScheduledChecks).mockResolvedValueOnce(makeSchedulerSummary());
      const response2 = await POST(makeAuthRequest());
      expect(response2.status).toBe(200);

      consoleErrorSpy.mockRestore();
    });
  });

  // =========================================================================
  // REL-023: Secret & Credential Sanitization
  // =========================================================================
  describe('REL-023: Secret & Credential Sanitization', () => {
    it('verifies zero occurrence of CRON_SECRET or database credentials in client responses or output', async () => {
      const SENTINEL_SECRET = 'CRON_SECRET_SENTINEL_xyz789';
      const SENTINEL_PASS = 'sentinel_pass_secret_456';
      process.env.CRON_SECRET = SENTINEL_SECRET;

      const capturedLogs: string[] = [];
      const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
        capturedLogs.push(args.map(String).join(' '));
      });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
        capturedLogs.push(args.map(String).join(' '));
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...args) => {
        capturedLogs.push(args.map(String).join(' '));
      });

      const responseBodies: string[] = [];

      // 1. Missing auth
      const r1 = await POST(makeRequest());
      responseBodies.push(await r1.text());

      // 2. Wrong token
      const r2 = await POST(makeAuthRequest('invalid-sentinel-guess'));
      responseBodies.push(await r2.text());

      // 3. Malformed header
      const r3 = await POST(makeRequest({ Authorization: 'Bearer' }));
      responseBodies.push(await r3.text());

      // 4. Internal error simulating a crash that mentions DB info internally
      vi.mocked(runScheduledChecks).mockRejectedValueOnce(
        new Error(`Connection failed to postgresql://user:${SENTINEL_PASS}@db.test:5432/db`)
      );
      const r4 = await POST(makeAuthRequest(SENTINEL_SECRET));
      responseBodies.push(await r4.text());

      // 5. Successful request
      vi.mocked(runScheduledChecks).mockResolvedValueOnce(makeSchedulerSummary());
      const r5 = await POST(makeAuthRequest(SENTINEL_SECRET));
      responseBodies.push(await r5.text());

      const allClientVisibleText = responseBodies.join('\n');

      // Assertions:
      // A. The secret password must NEVER appear in client responses
      expect(allClientVisibleText).not.toContain(SENTINEL_PASS);

      // B. The CRON_SECRET itself must NEVER appear in client responses
      expect(allClientVisibleText).not.toContain(SENTINEL_SECRET);

      // C. Guessed or provided tokens must never be echoed back in unauthorized responses
      expect(responseBodies[1]).not.toContain('invalid-sentinel-guess');

      logSpy.mockRestore();
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    });
  });
});
