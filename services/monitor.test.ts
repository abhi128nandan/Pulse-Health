import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import type { Check, Endpoint, NewCheck } from '../db/schema';
import { checkEndpoint, type CheckResult } from './checker';
import { persistCheckResult, runCheck } from './monitor';

vi.mock('../db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock('./checker', () => ({
  checkEndpoint: vi.fn(),
}));

describe('services/monitor', () => {
  const mockEndpoint: Endpoint = {
    id: 1,
    name: 'Production API',
    url: 'https://api.example.com/health',
    latencyThresholdMs: 350,
    createdAt: new Date('2026-01-01T12:00:00Z'),
  };

  let mockValuesFn: Mock<
    (val: NewCheck) => { returning: () => Promise<Check[]> }
  >;
  let mockReturningFn: Mock<(val: NewCheck) => Promise<Check[]>>;

  function setupDbMocks(endpoint: Endpoint | null = mockEndpoint) {
    mockReturningFn = vi.fn().mockImplementation((val: NewCheck) => {
      const persistedRow: Check = {
        id: 42,
        endpointId: val.endpointId,
        checkedAt: new Date('2026-09-30T10:00:00Z'),
        statusCode: val.statusCode ?? null,
        latencyMs: val.latencyMs ?? null,
        success: val.success,
        status: val.status,
        errorType: val.errorType ?? null,
        errorMessage: val.errorMessage ?? null,
      };
      return Promise.resolve([persistedRow]);
    });

    mockValuesFn = vi.fn().mockImplementation((val: NewCheck) => ({
      returning: () => mockReturningFn(val),
    }));

    (db.insert as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      values: mockValuesFn,
    });

    const limitFn = vi.fn().mockResolvedValue(endpoint ? [endpoint] : []);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    (db.select as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      from: fromFn,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Existing endpoint probe coordination', () => {
    it('calls checker with correct URL and threshold, and inserts exactly one check row', async () => {
      setupDbMocks(mockEndpoint);

      const checkResult: CheckResult = {
        statusCode: 200,
        latencyMs: 120,
        success: true,
        status: 'up',
        errorType: null,
        errorMessage: null,
      };
      (checkEndpoint as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        checkResult
      );

      const response = await runCheck(1);

      // Verify checker is called with correct URL and latency threshold
      expect(checkEndpoint).toHaveBeenCalledTimes(1);
      expect(checkEndpoint).toHaveBeenCalledWith(
        'https://api.example.com/health',
        350,
        undefined
      );

      // Verify exactly one check row is inserted
      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(mockValuesFn).toHaveBeenCalledTimes(1);
      expect(mockValuesFn).toHaveBeenCalledWith({
        endpointId: 1,
        statusCode: 200,
        latencyMs: 120,
        success: true,
        status: 'up',
        errorType: null,
        errorMessage: null,
      });

      // Verify returned structured result
      expect(response.ok).toBe(true);
      if (response.ok) {
        expect(response.endpoint).toEqual(mockEndpoint);
        expect(response.check.id).toBe(42);
        expect(response.check.endpointId).toBe(1);
      }
    });

    it('passes custom timeout option to checkEndpoint when provided', async () => {
      setupDbMocks(mockEndpoint);

      const checkResult: CheckResult = {
        statusCode: 200,
        latencyMs: 90,
        success: true,
        status: 'up',
        errorType: null,
        errorMessage: null,
      };
      (checkEndpoint as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        checkResult
      );

      await runCheck(1, { timeoutMs: 2500 });

      expect(checkEndpoint).toHaveBeenCalledWith(
        'https://api.example.com/health',
        350,
        { timeoutMs: 2500 }
      );
    });
  });

  describe('2. Successful check persistence', () => {
    it('persists status_code, latency_ms, success=true, and status=up', async () => {
      setupDbMocks(mockEndpoint);

      const successfulResult: CheckResult = {
        statusCode: 200,
        latencyMs: 145,
        success: true,
        status: 'up',
        errorType: null,
        errorMessage: null,
      };
      (checkEndpoint as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        successfulResult
      );

      const response = await runCheck(1);

      expect(response.ok).toBe(true);
      if (response.ok) {
        expect(response.statusCode).toBe(200);
        expect(response.latencyMs).toBe(145);
        expect(response.success).toBe(true);
        expect(response.status).toBe('up');
        expect(response.errorType).toBeNull();
        expect(response.errorMessage).toBeNull();

        // Check persisted record details
        expect(response.check.statusCode).toBe(200);
        expect(response.check.latencyMs).toBe(145);
        expect(response.check.success).toBe(true);
        expect(response.check.status).toBe('up');
      }

      expect(mockValuesFn).toHaveBeenCalledWith(
        expect.objectContaining({
          endpointId: 1,
          statusCode: 200,
          latencyMs: 145,
          success: true,
          status: 'up',
        })
      );
    });
  });

  describe('3. Degraded check persistence', () => {
    it('persists status=degraded, latency_ms, status_code, and success=true', async () => {
      setupDbMocks(mockEndpoint);

      const degradedResult: CheckResult = {
        statusCode: 200,
        latencyMs: 820,
        success: true,
        status: 'degraded',
        errorType: null,
        errorMessage: null,
      };
      (checkEndpoint as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        degradedResult
      );

      const response = await runCheck(1);

      expect(response.ok).toBe(true);
      if (response.ok) {
        expect(response.status).toBe('degraded');
        expect(response.latencyMs).toBe(820);
        expect(response.statusCode).toBe(200);
        expect(response.success).toBe(true);
        expect(response.errorType).toBeNull();

        expect(response.check.status).toBe('degraded');
        expect(response.check.latencyMs).toBe(820);
      }

      expect(mockValuesFn).toHaveBeenCalledWith(
        expect.objectContaining({
          endpointId: 1,
          statusCode: 200,
          latencyMs: 820,
          success: true,
          status: 'degraded',
        })
      );
    });
  });

  describe('4. HTTP failure persistence', () => {
    it('persists status=down, status_code, and error_type=http for 4xx/5xx responses', async () => {
      setupDbMocks(mockEndpoint);

      const httpErrorResult: CheckResult = {
        statusCode: 502,
        latencyMs: 110,
        success: false,
        status: 'down',
        errorType: 'http',
        errorMessage: 'HTTP request failed with status code 502',
      };
      (checkEndpoint as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        httpErrorResult
      );

      const response = await runCheck(1);

      expect(response.ok).toBe(true);
      if (response.ok) {
        expect(response.status).toBe('down');
        expect(response.statusCode).toBe(502);
        expect(response.latencyMs).toBe(110);
        expect(response.success).toBe(false);
        expect(response.errorType).toBe('http');
        expect(response.errorMessage).toBe(
          'HTTP request failed with status code 502'
        );

        expect(response.check.status).toBe('down');
        expect(response.check.statusCode).toBe(502);
        expect(response.check.errorType).toBe('http');
      }

      expect(mockValuesFn).toHaveBeenCalledWith(
        expect.objectContaining({
          endpointId: 1,
          statusCode: 502,
          latencyMs: 110,
          success: false,
          status: 'down',
          errorType: 'http',
          errorMessage: 'HTTP request failed with status code 502',
        })
      );
    });
  });

  describe('5. Timeout/network failure persistence', () => {
    it('persists status=down with error_type=timeout when check times out', async () => {
      setupDbMocks(mockEndpoint);

      const timeoutResult: CheckResult = {
        statusCode: null,
        latencyMs: 5000,
        success: false,
        status: 'down',
        errorType: 'timeout',
        errorMessage: 'Request timed out after 5000ms',
      };
      (checkEndpoint as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        timeoutResult
      );

      const response = await runCheck(1);

      expect(response.ok).toBe(true);
      if (response.ok) {
        expect(response.status).toBe('down');
        expect(response.statusCode).toBeNull();
        expect(response.latencyMs).toBe(5000);
        expect(response.success).toBe(false);
        expect(response.errorType).toBe('timeout');
        expect(response.errorMessage).toBe('Request timed out after 5000ms');
      }

      expect(mockValuesFn).toHaveBeenCalledWith(
        expect.objectContaining({
          endpointId: 1,
          statusCode: null,
          latencyMs: 5000,
          success: false,
          status: 'down',
          errorType: 'timeout',
        })
      );
    });

    it('persists status=down with error_type=dns when DNS resolution fails', async () => {
      setupDbMocks(mockEndpoint);

      const dnsResult: CheckResult = {
        statusCode: null,
        latencyMs: 40,
        success: false,
        status: 'down',
        errorType: 'dns',
        errorMessage: 'getaddrinfo ENOTFOUND nonexistent.domain',
      };
      (checkEndpoint as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        dnsResult
      );

      const response = await runCheck(1);

      expect(response.ok).toBe(true);
      if (response.ok) {
        expect(response.status).toBe('down');
        expect(response.statusCode).toBeNull();
        expect(response.errorType).toBe('dns');
        expect(response.errorMessage).toBe(
          'getaddrinfo ENOTFOUND nonexistent.domain'
        );
      }

      expect(mockValuesFn).toHaveBeenCalledWith(
        expect.objectContaining({
          endpointId: 1,
          statusCode: null,
          status: 'down',
          errorType: 'dns',
        })
      );
    });

    it('persists status=down with error_type=network when connection is refused', async () => {
      setupDbMocks(mockEndpoint);

      const networkResult: CheckResult = {
        statusCode: null,
        latencyMs: 25,
        success: false,
        status: 'down',
        errorType: 'network',
        errorMessage: 'connect ECONNREFUSED 127.0.0.1:8080',
      };
      (checkEndpoint as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        networkResult
      );

      const response = await runCheck(1);

      expect(response.ok).toBe(true);
      if (response.ok) {
        expect(response.status).toBe('down');
        expect(response.statusCode).toBeNull();
        expect(response.errorType).toBe('network');
      }

      expect(mockValuesFn).toHaveBeenCalledWith(
        expect.objectContaining({
          endpointId: 1,
          statusCode: null,
          status: 'down',
          errorType: 'network',
        })
      );
    });
  });

  describe('6. Missing endpoint handling', () => {
    it('returns typed error, makes no HTTP request, and inserts no check row', async () => {
      setupDbMocks(null); // No endpoint found in DB

      const response = await runCheck(999);

      // Verify no HTTP request is made
      expect(checkEndpoint).not.toHaveBeenCalled();

      // Verify no check row is inserted
      expect(db.insert).not.toHaveBeenCalled();

      // Verify clear typed not-found result
      expect(response).toEqual({
        ok: false,
        success: false,
        error: 'ENDPOINT_NOT_FOUND',
        message: 'Endpoint with ID 999 not found',
      });
    });
  });

  describe('7. Infrastructure and application error propagation', () => {
    it('propagates database read error without swallowing as check failure', async () => {
      const dbError = new Error('Database connection pool exhausted');
      const limitFn = vi.fn().mockRejectedValue(dbError);
      const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      (db.select as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        from: fromFn,
      });

      await expect(runCheck(1)).rejects.toThrow(
        'Database connection pool exhausted'
      );

      expect(checkEndpoint).not.toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('propagates database insertion error when persisting check result', async () => {
      setupDbMocks(mockEndpoint);

      const checkResult: CheckResult = {
        statusCode: 200,
        latencyMs: 100,
        success: true,
        status: 'up',
        errorType: null,
        errorMessage: null,
      };
      (checkEndpoint as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        checkResult
      );

      const dbInsertError = new Error('Postgres connection lost on insert');
      mockReturningFn.mockRejectedValue(dbInsertError);

      await expect(runCheck(1)).rejects.toThrow(
        'Postgres connection lost on insert'
      );
    });
  });

  describe('persistCheckResult direct helper', () => {
    it('inserts exactly one record with matching fields into checks table', async () => {
      setupDbMocks(mockEndpoint);

      const checkResult: CheckResult = {
        statusCode: 200,
        latencyMs: 150,
        success: true,
        status: 'up',
        errorType: null,
        errorMessage: null,
      };

      const inserted = await persistCheckResult(42, checkResult);

      expect(inserted.endpointId).toBe(42);
      expect(inserted.statusCode).toBe(200);
      expect(inserted.latencyMs).toBe(150);
      expect(inserted.success).toBe(true);
      expect(inserted.status).toBe('up');
      expect(db.insert).toHaveBeenCalledTimes(1);
    });
  });
});
