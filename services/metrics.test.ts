import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db';
import type { Check } from '../db/schema';
import {
  DEFAULT_RECENT_CHECKS_LIMIT,
  calculateAverageLatency,
  calculateErrorRate,
  calculateP95Latency,
  calculateUptime,
  getChecksForEndpoint,
  getEndpointMetrics,
  getRecentChecks,
  type MetricCheckInput,
} from './metrics';

vi.mock('../db', () => ({
  db: {
    select: vi.fn(),
  },
}));

describe('services/metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // PART 1: PURE METRICS FUNCTIONS
  // ==========================================================================

  describe('1. calculateUptime', () => {
    it('returns 100% when all checks are UP', () => {
      const checks: MetricCheckInput[] = [
        { status: 'up', latencyMs: 120 },
        { status: 'up', latencyMs: 140 },
        { status: 'up', latencyMs: 110 },
      ];

      expect(calculateUptime(checks)).toBe(100);
    });

    it('counts both UP and DEGRADED as successful, and DOWN as failed', () => {
      const checks: MetricCheckInput[] = [
        { status: 'up', latencyMs: 100 },
        { status: 'degraded', latencyMs: 650 },
        { status: 'up', latencyMs: 150 },
        { status: 'down', latencyMs: null },
      ];

      // 3 successful out of 4 total = 75%
      expect(calculateUptime(checks)).toBe(75);
    });

    it('returns 0 for zero checks safely without returning NaN or Infinity', () => {
      expect(calculateUptime([])).toBe(0);
      expect(Number.isNaN(calculateUptime([]))).toBe(false);
      expect(Number.isFinite(calculateUptime([]))).toBe(true);
    });

    it('returns 0% when all checks are DOWN', () => {
      const checks: MetricCheckInput[] = [
        { status: 'down', latencyMs: null },
        { status: 'down', latencyMs: 5000 },
      ];

      expect(calculateUptime(checks)).toBe(0);
    });
  });

  describe('2. calculateErrorRate', () => {
    it('returns 0% when there are no failures (all UP or DEGRADED)', () => {
      const checks: MetricCheckInput[] = [
        { status: 'up', latencyMs: 100 },
        { status: 'degraded', latencyMs: 700 },
      ];

      expect(calculateErrorRate(checks)).toBe(0);
    });

    it('returns correct percentage when failures are present', () => {
      const checks: MetricCheckInput[] = [
        { status: 'up', latencyMs: 120 },
        { status: 'down', latencyMs: 50 },
        { status: 'degraded', latencyMs: 800 },
        { status: 'down', latencyMs: null },
      ];

      // 2 failed out of 4 total = 50%
      expect(calculateErrorRate(checks)).toBe(50);
    });

    it('returns 0 for zero checks safely without returning NaN or Infinity', () => {
      expect(calculateErrorRate([])).toBe(0);
      expect(Number.isNaN(calculateErrorRate([]))).toBe(false);
      expect(Number.isFinite(calculateErrorRate([]))).toBe(true);
    });

    it('returns 100% when all checks are DOWN', () => {
      const checks: MetricCheckInput[] = [
        { status: 'down', latencyMs: null },
        { status: 'down', latencyMs: null },
      ];

      expect(calculateErrorRate(checks)).toBe(100);
    });
  });

  describe('3. calculateAverageLatency', () => {
    it('calculates the exact average from normal latency values', () => {
      const checks: MetricCheckInput[] = [
        { status: 'up', latencyMs: 100 },
        { status: 'up', latencyMs: 200 },
        { status: 'degraded', latencyMs: 300 },
      ];

      // (100 + 200 + 300) / 3 = 200
      expect(calculateAverageLatency(checks)).toBe(200);
    });

    it('ignores null latencies without treating them as zero', () => {
      const checks: MetricCheckInput[] = [
        { status: 'up', latencyMs: 100 },
        { status: 'up', latencyMs: null },
        { status: 'up', latencyMs: 200 },
      ];

      // (100 + 200) / 2 = 150 (if null were treated as 0, result would be 100)
      expect(calculateAverageLatency(checks)).toBe(150);
    });

    it('excludes failed (DOWN) checks even if they have latency values', () => {
      const checks: MetricCheckInput[] = [
        { status: 'up', latencyMs: 100 },
        { status: 'down', latencyMs: 500 }, // down checks excluded
        { status: 'up', latencyMs: 200 },
      ];

      expect(calculateAverageLatency(checks)).toBe(150);
    });

    it('returns null when there are no valid latency values', () => {
      expect(calculateAverageLatency([])).toBeNull();

      const checksWithOnlyNull: MetricCheckInput[] = [
        { status: 'up', latencyMs: null },
        { status: 'down', latencyMs: null },
      ];
      expect(calculateAverageLatency(checksWithOnlyNull)).toBeNull();

      const checksWithOnlyFailed: MetricCheckInput[] = [
        { status: 'down', latencyMs: 150 },
      ];
      expect(calculateAverageLatency(checksWithOnlyFailed)).toBeNull();
    });
  });

  describe('4. calculateP95Latency', () => {
    it('calculates P95 using the nearest-rank formula on a small deterministic dataset', () => {
      // 10 checks: n = 10 -> index = ceil(0.95 * 10) - 1 = 10 - 1 = 9 (last element)
      const checks: MetricCheckInput[] = [
        10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
      ].map((lat) => ({ status: 'up', latencyMs: lat }));

      expect(calculateP95Latency(checks)).toBe(100);
    });

    it('verifies nearest-rank formula on a 20-element dataset', () => {
      // 20 checks: n = 20 -> index = ceil(0.95 * 20) - 1 = 19 - 1 = 18 (19th element)
      const checks: MetricCheckInput[] = Array.from({ length: 20 }, (_, i) => ({
        status: 'up',
        latencyMs: (i + 1) * 10, // 10, 20, ..., 190, 200
      }));

      // 19th element is 190
      expect(calculateP95Latency(checks)).toBe(190);
    });

    it('verifies single element dataset (n=1)', () => {
      // n = 1 -> index = ceil(0.95 * 1) - 1 = 0
      const checks: MetricCheckInput[] = [{ status: 'up', latencyMs: 250 }];
      expect(calculateP95Latency(checks)).toBe(250);
    });

    it('correctly handles unsorted input', () => {
      const unsortedLatencies = [500, 120, 300, 80, 450, 200, 100, 600, 250, 150];
      const checks: MetricCheckInput[] = unsortedLatencies.map((lat) => ({
        status: 'up',
        latencyMs: lat,
      }));

      // Sorted: 80, 100, 120, 150, 200, 250, 300, 450, 500, 600
      // n = 10 -> index = 9 -> 600
      expect(calculateP95Latency(checks)).toBe(600);
    });

    it('does not mutate the original caller array during sorting', () => {
      const originalInput: MetricCheckInput[] = [
        { status: 'up', latencyMs: 500 },
        { status: 'up', latencyMs: 100 },
        { status: 'up', latencyMs: 300 },
      ];

      const shallowCopy = [...originalInput];

      calculateP95Latency(originalInput);

      expect(originalInput[0].latencyMs).toBe(500);
      expect(originalInput[1].latencyMs).toBe(100);
      expect(originalInput[2].latencyMs).toBe(300);
      expect(originalInput).toEqual(shallowCopy);
    });

    it('ignores null latencies and failed checks', () => {
      const checks: MetricCheckInput[] = [
        { status: 'down', latencyMs: 1000 }, // down -> ignored
        { status: 'up', latencyMs: null }, // null -> ignored
        { status: 'up', latencyMs: 100 },
        { status: 'degraded', latencyMs: 200 },
      ];

      // Valid: [100, 200], n = 2 -> index = ceil(0.95 * 2) - 1 = ceil(1.9) - 1 = 2 - 1 = 1 -> 200
      expect(calculateP95Latency(checks)).toBe(200);
    });

    it('returns null when there are no valid latency observations', () => {
      expect(calculateP95Latency([])).toBeNull();

      const checksWithOnlyNull: MetricCheckInput[] = [
        { status: 'up', latencyMs: null },
      ];
      expect(calculateP95Latency(checksWithOnlyNull)).toBeNull();
    });
  });

  // ==========================================================================
  // PART 2: DATABASE READ SERVICE & TIME WINDOW
  // ==========================================================================

  describe('5. getChecksForEndpoint (24-hour filtering)', () => {
    it('queries checks table, filters by endpointId and 24-hour date window, and orders descending', async () => {
      const fakeChecks: Check[] = [
        {
          id: 2,
          endpointId: 1,
          checkedAt: new Date('2026-09-30T10:00:00Z'),
          statusCode: 200,
          latencyMs: 120,
          success: true,
          status: 'up',
          errorType: null,
          errorMessage: null,
        },
        {
          id: 1,
          endpointId: 1,
          checkedAt: new Date('2026-09-30T09:00:00Z'),
          statusCode: 200,
          latencyMs: 130,
          success: true,
          status: 'up',
          errorType: null,
          errorMessage: null,
        },
      ];

      const orderByFn = vi.fn().mockResolvedValue(fakeChecks);
      const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      (db.select as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        from: fromFn,
      });

      const startTime = new Date('2026-09-29T10:00:00Z');
      const endTime = new Date('2026-09-30T10:00:00Z');

      const result = await getChecksForEndpoint(1, startTime, endTime);

      expect(db.select).toHaveBeenCalledTimes(1);
      expect(fromFn).toHaveBeenCalledTimes(1);
      expect(whereFn).toHaveBeenCalledTimes(1);
      expect(orderByFn).toHaveBeenCalledTimes(1);
      expect(result).toEqual(fakeChecks);
    });

    it('uses default 24-hour window when start and end times are omitted', async () => {
      const orderByFn = vi.fn().mockResolvedValue([]);
      const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      (db.select as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        from: fromFn,
      });

      const now = new Date('2026-09-30T12:00:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);

      await getChecksForEndpoint(5);

      expect(db.select).toHaveBeenCalledTimes(1);
      expect(whereFn).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('accepts options object with custom db and time window', async () => {
      const orderByFn = vi.fn().mockResolvedValue([]);
      const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      const customDb = {
        select: vi.fn().mockReturnValue({ from: fromFn }),
      };

      await getChecksForEndpoint(1, {
        startTime: new Date('2026-09-29T00:00:00Z'),
        endTime: new Date('2026-09-30T00:00:00Z'),
        db: customDb as unknown as typeof db,
      });

      expect(customDb.select).toHaveBeenCalledTimes(1);
      expect(db.select).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // PART 3: ENDPOINT METRICS AGGREGATION
  // ==========================================================================

  describe('getEndpointMetrics', () => {
    it('retrieves checks and computes uptime, errorRate, averageLatency, p95, and totalChecks', async () => {
      const fakeChecks: Check[] = [
        {
          id: 3,
          endpointId: 1,
          checkedAt: new Date('2026-09-30T12:00:00Z'),
          statusCode: 200,
          latencyMs: 100,
          success: true,
          status: 'up',
          errorType: null,
          errorMessage: null,
        },
        {
          id: 2,
          endpointId: 1,
          checkedAt: new Date('2026-09-30T11:00:00Z'),
          statusCode: 200,
          latencyMs: 300,
          success: true,
          status: 'degraded',
          errorType: null,
          errorMessage: null,
        },
        {
          id: 1,
          endpointId: 1,
          checkedAt: new Date('2026-09-30T10:00:00Z'),
          statusCode: 500,
          latencyMs: null,
          success: false,
          status: 'down',
          errorType: 'http',
          errorMessage: 'Server Error',
        },
      ];

      const orderByFn = vi.fn().mockResolvedValue(fakeChecks);
      const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      (db.select as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        from: fromFn,
      });

      const metrics = await getEndpointMetrics(1);

      // 2 successful out of 3 = 66.66666666666667%
      expect(metrics.uptime).toBeCloseTo(66.666, 2);
      // 1 failed out of 3 = 33.33333333333333%
      expect(metrics.errorRate).toBeCloseTo(33.333, 2);
      // Successful with latency: [100, 300] -> avg = 200
      expect(metrics.averageLatencyMs).toBe(200);
      // n=2 -> index = ceil(0.95 * 2) - 1 = 1 -> 300
      expect(metrics.p95LatencyMs).toBe(300);
      expect(metrics.totalChecks).toBe(3);
    });

    it('returns safe metrics when no checks exist for endpoint', async () => {
      const orderByFn = vi.fn().mockResolvedValue([]);
      const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      (db.select as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        from: fromFn,
      });

      const metrics = await getEndpointMetrics(999);

      expect(metrics).toEqual({
        uptime: 0,
        errorRate: 0,
        averageLatencyMs: null,
        p95LatencyMs: null,
        totalChecks: 0,
      });
    });
  });

  // ==========================================================================
  // PART 4: RECENT CHECK HISTORY
  // ==========================================================================

  describe('6. getRecentChecks', () => {
    it('orders by checkedAt descending and applies default limit of 50', async () => {
      const limitFn = vi.fn().mockResolvedValue([]);
      const orderByFn = vi.fn().mockReturnValue({ limit: limitFn });
      const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      (db.select as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        from: fromFn,
      });

      await getRecentChecks(1);

      expect(db.select).toHaveBeenCalledTimes(1);
      expect(orderByFn).toHaveBeenCalledTimes(1);
      expect(limitFn).toHaveBeenCalledWith(DEFAULT_RECENT_CHECKS_LIMIT);
    });

    it('respects a custom limit parameter', async () => {
      const limitFn = vi.fn().mockResolvedValue([]);
      const orderByFn = vi.fn().mockReturnValue({ limit: limitFn });
      const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      (db.select as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
        from: fromFn,
      });

      await getRecentChecks(1, 10);

      expect(limitFn).toHaveBeenCalledWith(10);
    });

    it('accepts options object with limit and custom db', async () => {
      const limitFn = vi.fn().mockResolvedValue([]);
      const orderByFn = vi.fn().mockReturnValue({ limit: limitFn });
      const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      const customDb = {
        select: vi.fn().mockReturnValue({ from: fromFn }),
      };

      await getRecentChecks(1, {
        limit: 25,
        db: customDb as unknown as typeof db,
      });

      expect(customDb.select).toHaveBeenCalledTimes(1);
      expect(db.select).not.toHaveBeenCalled();
      expect(limitFn).toHaveBeenCalledWith(25);
    });
  });
});
