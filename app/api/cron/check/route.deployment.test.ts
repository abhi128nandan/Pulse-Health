import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SchedulerRunSummary } from '../../../../services/scheduler';

// Mock only runScheduledChecks, leaving execution guard functions real
vi.mock('../../../../services/scheduler', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../services/scheduler')>();
  return {
    ...actual,
    runScheduledChecks: vi.fn(),
  };
});

import {
  acquireExecutionGuard,
  isExecutionActive,
  releaseExecutionGuard,
  resetExecutionGuard,
  runScheduledChecks,
} from '../../../../services/scheduler';
import { POST } from './route';

// ---------------------------------------------------------------------------
// Helpers & Test Data
// ---------------------------------------------------------------------------

const VALID_SECRET = 'secret-token-32-chars-long-12345';

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3000/api/cron/check', {
    method: 'POST',
    headers,
  });
}

function makeAuthRequest(token: string = VALID_SECRET): Request {
  return makeRequest({ Authorization: `Bearer ${token}` });
}

function createSampleSummary(
  overrides: Partial<SchedulerRunSummary> = {}
): SchedulerRunSummary {
  return {
    success: true,
    totalEndpoints: 1,
    attempted: 1,
    succeeded: 1,
    failed: 0,
    durationMs: 45,
    results: [
      {
        endpointId: 101,
        endpointName: 'Health API',
        outcome: 'completed',
        status: 'up',
        error: null,
      },
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('Deployment Route Verification (Phase 7E-D-C)', () => {
  const originalEnvSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    resetExecutionGuard();
    process.env.CRON_SECRET = VALID_SECRET;
    vi.mocked(runScheduledChecks).mockResolvedValue(createSampleSummary());
  });

  afterEach(() => {
    resetExecutionGuard();
    if (originalEnvSecret !== undefined) {
      process.env.CRON_SECRET = originalEnvSecret;
    } else {
      delete process.env.CRON_SECRET;
    }
  });

  // =========================================================================
  // Section 6 & 13: Authentication Verification Matrix (AUTH-001..008)
  // =========================================================================
  describe('Authentication Verification Matrix (AUTH-001 to AUTH-008)', () => {
    it('AUTH-001: Missing Authorization header returns 401 and does not invoke scheduler or acquire guard', async () => {
      const response = await POST(makeRequest());

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: 'Unauthorized' });
      expect(runScheduledChecks).not.toHaveBeenCalled();
      expect(isExecutionActive()).toBe(false);
    });

    it('AUTH-002: Basic authentication scheme returns 401 and does not invoke scheduler', async () => {
      const response = await POST(
        makeRequest({ Authorization: 'Basic dXNlcjpwYXNz' })
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: 'Unauthorized' });
      expect(runScheduledChecks).not.toHaveBeenCalled();
      expect(isExecutionActive()).toBe(false);
    });

    it('AUTH-003: Empty Bearer token returns 401 and does not invoke scheduler', async () => {
      const response = await POST(makeRequest({ Authorization: 'Bearer ' }));

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: 'Unauthorized' });
      expect(runScheduledChecks).not.toHaveBeenCalled();
      expect(isExecutionActive()).toBe(false);
    });

    it('AUTH-004: Whitespace Bearer token returns 401 and does not invoke scheduler', async () => {
      const response = await POST(makeRequest({ Authorization: 'Bearer    ' }));

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: 'Unauthorized' });
      expect(runScheduledChecks).not.toHaveBeenCalled();
      expect(isExecutionActive()).toBe(false);
    });

    it('AUTH-005: Wrong token with different byte length returns 401 without buffer length exception', async () => {
      // Short token has different length than VALID_SECRET
      const response = await POST(makeAuthRequest('short-token'));

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: 'Unauthorized' });
      expect(runScheduledChecks).not.toHaveBeenCalled();
      expect(isExecutionActive()).toBe(false);
    });

    it('AUTH-006: Wrong token with identical byte length returns 401 via timingSafeEqual', async () => {
      // Create a wrong token with identical length to VALID_SECRET (32 chars)
      const wrongTokenSameLength = 'secret-token-32-chars-long-1234X';
      expect(wrongTokenSameLength.length).toBe(VALID_SECRET.length);

      const response = await POST(makeAuthRequest(wrongTokenSameLength));

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: 'Unauthorized' });
      expect(runScheduledChecks).not.toHaveBeenCalled();
      expect(isExecutionActive()).toBe(false);
    });

    it('AUTH-007: Correct token returns 200 and invokes scheduler normally', async () => {
      const response = await POST(makeAuthRequest(VALID_SECRET));

      expect(response.status).toBe(200);
      expect(runScheduledChecks).toHaveBeenCalledTimes(1);
      expect(isExecutionActive()).toBe(false); // Released after execution
    });

    it('AUTH-008: CRON_SECRET missing or unconfigured fails closed with 500 and does not invoke scheduler', async () => {
      delete process.env.CRON_SECRET;

      const response = await POST(makeAuthRequest(VALID_SECRET));

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toEqual({ error: 'Internal server error' });
      expect(runScheduledChecks).not.toHaveBeenCalled();
      expect(isExecutionActive()).toBe(false);
    });
  });

  // =========================================================================
  // Section 7 & 12: HTTP Transport Verification Matrix (HTTP-001..008)
  // =========================================================================
  describe('HTTP Transport Verification Matrix (HTTP-001 to HTTP-008)', () => {
    it('HTTP-001: Valid authenticated POST executes successfully and returns summary', async () => {
      const mockSummary = createSampleSummary({
        totalEndpoints: 2,
        attempted: 2,
        succeeded: 2,
        failed: 0,
      });
      vi.mocked(runScheduledChecks).mockResolvedValue(mockSummary);

      const response = await POST(makeAuthRequest());

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.totalEndpoints).toBe(2);
      expect(body.succeeded).toBe(2);
      expect(body.failed).toBe(0);
      expect(isExecutionActive()).toBe(false);
    });

    it('HTTP-002: Unauthorized POST returns 401', async () => {
      const response = await POST(makeRequest());

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body).toEqual({ error: 'Unauthorized' });
    });

    it('HTTP-003: Malformed Authorization returns 401', async () => {
      const response = await POST(makeRequest({ Authorization: 'InvalidFormat' }));

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body).toEqual({ error: 'Unauthorized' });
    });

    it('HTTP-004: Empty endpoint database returns valid 200 summary with zero endpoints', async () => {
      const emptySummary: SchedulerRunSummary = {
        success: true,
        totalEndpoints: 0,
        attempted: 0,
        succeeded: 0,
        failed: 0,
        durationMs: 1,
        results: [],
      };
      vi.mocked(runScheduledChecks).mockResolvedValue(emptySummary);

      const response = await POST(makeAuthRequest());

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.totalEndpoints).toBe(0);
      expect(body.attempted).toBe(0);
      expect(body.succeeded).toBe(0);
      expect(body.failed).toBe(0);
      expect(body.results).toEqual([]);
    });

    it('HTTP-005: Monitored target HTTP 500 produces HTTP 200, succeeded = 1, failed = 0', async () => {
      const targetFailedSummary: SchedulerRunSummary = {
        success: true,
        totalEndpoints: 1,
        attempted: 1,
        succeeded: 1,
        failed: 0,
        durationMs: 30,
        results: [
          {
            endpointId: 201,
            endpointName: 'Error Target',
            outcome: 'completed',
            status: 'down',
            error: null,
          },
        ],
      };
      vi.mocked(runScheduledChecks).mockResolvedValue(targetFailedSummary);

      const response = await POST(makeAuthRequest());

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.succeeded).toBe(1);
      expect(body.failed).toBe(0);
      expect(body.results[0].status).toBe('down');
      expect(body.results[0].outcome).toBe('completed');
    });

    it('HTTP-006: Monitored target timeout produces HTTP 200, succeeded = 1, failed = 0', async () => {
      const timeoutSummary: SchedulerRunSummary = {
        success: true,
        totalEndpoints: 1,
        attempted: 1,
        succeeded: 1,
        failed: 0,
        durationMs: 5012,
        results: [
          {
            endpointId: 202,
            endpointName: 'Timeout Target',
            outcome: 'completed',
            status: 'down',
            error: null,
          },
        ],
      };
      vi.mocked(runScheduledChecks).mockResolvedValue(timeoutSummary);

      const response = await POST(makeAuthRequest());

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.succeeded).toBe(1);
      expect(body.failed).toBe(0);
      expect(body.results[0].status).toBe('down');
    });

    it('HTTP-007: Overlapping request returns HTTP 200 with skipped: true and does not interfere', async () => {
      let resolveFirstRun!: (val: SchedulerRunSummary) => void;
      const firstRunPromise = new Promise<SchedulerRunSummary>((resolve) => {
        resolveFirstRun = resolve;
      });

      vi.mocked(runScheduledChecks).mockImplementationOnce(() => firstRunPromise);

      // Start Request 1
      const request1Promise = POST(makeAuthRequest());

      // Yield execution briefly so request 1 acquires guard and enters runScheduledChecks
      await new Promise((r) => setTimeout(r, 10));
      expect(isExecutionActive()).toBe(true);

      // Start Request 2 (overlapping)
      const request2Response = await POST(makeAuthRequest());

      expect(request2Response.status).toBe(200);
      const body2 = await request2Response.json();
      expect(body2).toEqual({
        success: true,
        skipped: true,
        reason: 'Previous scheduled check run is still active',
      });

      // Request 1 is still actively running and its guard has NOT been released
      expect(isExecutionActive()).toBe(true);

      // Complete Request 1
      resolveFirstRun(createSampleSummary());
      const request1Response = await request1Promise;

      expect(request1Response.status).toBe(200);
      const body1 = await request1Response.json();
      expect(body1.success).toBe(true);
      expect(body1.skipped).toBeUndefined();

      // Guard is now cleanly released
      expect(isExecutionActive()).toBe(false);
    });

    it('HTTP-008: Fatal scheduler/infrastructure failure returns HTTP 500, generic body, guard released', async () => {
      vi.mocked(runScheduledChecks).mockRejectedValue(
        new Error('PostgreSQL connection pool exhausted')
      );

      const response = await POST(makeAuthRequest());

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body).toEqual({ error: 'Internal server error' });
      // Guard released in finally
      expect(isExecutionActive()).toBe(false);
    });
  });

  // =========================================================================
  // Section 8 & 14: Execution Guard Verification (GUARD-001..005)
  // =========================================================================
  describe('Execution Guard Verification (GUARD-001 to GUARD-005)', () => {
    it('GUARD-001: Idle guard can be acquired; isExecutionActive becomes true', () => {
      expect(isExecutionActive()).toBe(false);
      const acquired = acquireExecutionGuard();
      expect(acquired).toBe(true);
      expect(isExecutionActive()).toBe(true);
      releaseExecutionGuard();
      expect(isExecutionActive()).toBe(false);
    });

    it('GUARD-002: Active guard causes second request to skip', async () => {
      acquireExecutionGuard();
      expect(isExecutionActive()).toBe(true);

      const response = await POST(makeAuthRequest());

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({
        success: true,
        skipped: true,
        reason: 'Previous scheduled check run is still active',
      });
      expect(runScheduledChecks).not.toHaveBeenCalled();

      releaseExecutionGuard();
    });

    it('GUARD-003: Skipped request does not release another request guard', async () => {
      // Simulate another in-flight run owning the guard
      acquireExecutionGuard();
      expect(isExecutionActive()).toBe(true);

      const response = await POST(makeAuthRequest());
      expect(response.status).toBe(200);

      // Verify guard is still held by the owner
      expect(isExecutionActive()).toBe(true);

      releaseExecutionGuard();
      expect(isExecutionActive()).toBe(false);
    });

    it('GUARD-004: Normal completion releases guard via finally', async () => {
      vi.mocked(runScheduledChecks).mockResolvedValue(createSampleSummary());

      expect(isExecutionActive()).toBe(false);
      const response = await POST(makeAuthRequest());
      expect(response.status).toBe(200);

      expect(isExecutionActive()).toBe(false);
    });

    it('GUARD-005: Fatal scheduler exception releases guard through finally and subsequent request succeeds', async () => {
      // First request fails fatally
      vi.mocked(runScheduledChecks).mockRejectedValueOnce(
        new Error('Fatal catastrophic database drop')
      );

      const response1 = await POST(makeAuthRequest());
      expect(response1.status).toBe(500);
      expect(isExecutionActive()).toBe(false);

      // Second request now succeeds because guard was released
      vi.mocked(runScheduledChecks).mockResolvedValueOnce(createSampleSummary());
      const response2 = await POST(makeAuthRequest());
      expect(response2.status).toBe(200);
      const body2 = await response2.json();
      expect(body2.success).toBe(true);
      expect(isExecutionActive()).toBe(false);
    });
  });

  // =========================================================================
  // Section 9 & 22: Security & Secret Sanitization Verification (SEC-001)
  // =========================================================================
  describe('Security & Secret Sanitization Verification (SEC-001)', () => {
    const SENTINEL_SECRET = 'CRON_SECRET_SENTINEL_xyz987_deployment_test';
    const SENTINEL_DB_PWD = 'sentinel_super_secret_pwd_9988';
    const SENTINEL_DB_URL = `postgresql://sentinel_usr:${SENTINEL_DB_PWD}@db.example.com/testdb`;
    const SENTINEL_AUTH_TOKEN = 'SENTINEL_BEARER_TOKEN_ATTACKER_VALUE_5544';

    it('SEC-001: Ensures no secrets, tokens, connection strings, or table names leak in logs or response bodies', async () => {
      const consoleOutput: string[] = [];

      const spyLog = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
        consoleOutput.push(args.map(String).join(' '));
      });
      const spyWarn = vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
        consoleOutput.push(args.map(String).join(' '));
      });
      const spyError = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
        consoleOutput.push(args.map(String).join(' '));
      });

      const originalDbUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = SENTINEL_DB_URL;
      process.env.CRON_SECRET = SENTINEL_SECRET;

      try {
        // 1. Valid request
        const resValid = await POST(makeAuthRequest(SENTINEL_SECRET));
        const bodyValid = JSON.stringify(await resValid.json());

        // 2. Invalid auth with sentinel attacker token
        const resInvalid = await POST(makeAuthRequest(SENTINEL_AUTH_TOKEN));
        const bodyInvalid = JSON.stringify(await resInvalid.json());

        // 3. Malformed auth
        const resMalformed = await POST(makeRequest({ Authorization: 'Bearer ' }));
        const bodyMalformed = JSON.stringify(await resMalformed.json());

        // 4. Missing secret
        delete process.env.CRON_SECRET;
        const resMissing = await POST(makeAuthRequest(SENTINEL_SECRET));
        const bodyMissing = JSON.stringify(await resMissing.json());

        // 5. Internal error
        process.env.CRON_SECRET = SENTINEL_SECRET;
        vi.mocked(runScheduledChecks).mockRejectedValueOnce(
          new Error('Connection terminated unexpectedly')
        );
        const resInternal = await POST(makeAuthRequest(SENTINEL_SECRET));
        const bodyInternal = JSON.stringify(await resInternal.json());

        // Collect all logged output and responses
        const allLogs = consoleOutput.join('\n');
        const allResponses = [
          bodyValid,
          bodyInvalid,
          bodyMalformed,
          bodyMissing,
          bodyInternal,
        ].join('\n');

        // Check for leaks without exposing secrets in failure messages
        const secretLeakedInLogs = allLogs.includes(SENTINEL_SECRET);
        const secretLeakedInResponse = allResponses.includes(SENTINEL_SECRET);
        const pwdLeakedInLogs = allLogs.includes(SENTINEL_DB_PWD);
        const pwdLeakedInResponse = allResponses.includes(SENTINEL_DB_PWD);
        const tokenLeakedInLogs = allLogs.includes(SENTINEL_AUTH_TOKEN);
        const tokenLeakedInResponse = allResponses.includes(SENTINEL_AUTH_TOKEN);
        const dbUrlLeakedInLogs = allLogs.includes(SENTINEL_DB_URL);
        const dbUrlLeakedInResponse = allResponses.includes(SENTINEL_DB_URL);
        const rawSqlInResponse =
          allResponses.includes('SELECT') ||
          allResponses.includes('INSERT') ||
          allResponses.includes('endpoints') ||
          allResponses.includes('checks');
        const stackTraceInResponse =
          allResponses.includes('Error:') ||
          allResponses.includes('at ') ||
          allResponses.includes('.ts:');

        // Assertions using boolean flags to protect credentials in test output
        expect(secretLeakedInLogs, 'CRON_SECRET leaked in console logs').toBe(false);
        expect(secretLeakedInResponse, 'CRON_SECRET leaked in HTTP response body').toBe(false);
        expect(pwdLeakedInLogs, 'Database password leaked in console logs').toBe(false);
        expect(pwdLeakedInResponse, 'Database password leaked in HTTP response body').toBe(false);
        expect(tokenLeakedInLogs, 'Authorization token leaked in console logs').toBe(false);
        expect(tokenLeakedInResponse, 'Authorization token leaked in HTTP response body').toBe(false);
        expect(dbUrlLeakedInLogs, 'DATABASE_URL leaked in console logs').toBe(false);
        expect(dbUrlLeakedInResponse, 'DATABASE_URL leaked in HTTP response body').toBe(false);
        expect(rawSqlInResponse, 'SQL query/table name leaked in HTTP response body').toBe(false);
        expect(stackTraceInResponse, 'Stack trace leaked in HTTP response body').toBe(false);
      } finally {
        if (originalDbUrl !== undefined) {
          process.env.DATABASE_URL = originalDbUrl;
        } else {
          delete process.env.DATABASE_URL;
        }
        spyLog.mockRestore();
        spyWarn.mockRestore();
        spyError.mockRestore();
      }
    });
  });
});
