import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { db } from '../db';
import { checks, type Check, type CheckStatus } from '../db/schema';

export interface MetricCheckInput {
  status: CheckStatus | string;
  latencyMs: number | null;
}

export interface EndpointMetrics {
  uptime: number;
  errorRate: number;
  averageLatencyMs: number | null;
  p95LatencyMs: number | null;
  totalChecks: number;
}

export interface TimeWindowOptions {
  startTime?: Date;
  endTime?: Date;
  db?: typeof db;
}

export const DEFAULT_RECENT_CHECKS_LIMIT = 50;

export interface GetRecentChecksOptions {
  limit?: number;
  db?: typeof db;
}

// ============================================================================
// PART 1: PURE METRICS FUNCTIONS
// ============================================================================

/**
 * Calculates the uptime percentage from a list of check records.
 *
 * Formula: (successful checks / total checks) * 100
 * - status = "up" counts as successful
 * - status = "degraded" counts as successful
 * - status = "down" counts as failed
 *
 * Returns 0 for zero checks to avoid NaN / Infinity.
 */
export function calculateUptime(checksList: readonly MetricCheckInput[]): number {
  if (checksList.length === 0) {
    return 0;
  }

  const successfulCount = checksList.reduce((acc, check) => {
    return check.status === 'up' || check.status === 'degraded' ? acc + 1 : acc;
  }, 0);

  return (successfulCount / checksList.length) * 100;
}

/**
 * Calculates the error rate percentage from a list of check records.
 *
 * Formula: (failed checks / total checks) * 100
 * - status = "down" counts as failed
 * - status = "up" counts as successful
 * - status = "degraded" counts as successful
 *
 * Returns 0 for zero checks to avoid NaN / Infinity.
 */
export function calculateErrorRate(checksList: readonly MetricCheckInput[]): number {
  if (checksList.length === 0) {
    return 0;
  }

  const failedCount = checksList.reduce((acc, check) => {
    return check.status === 'down' ? acc + 1 : acc;
  }, 0);

  return (failedCount / checksList.length) * 100;
}

/**
 * Calculates average latency in milliseconds from successful checks with non-null latency.
 *
 * - Only includes successful checks (status = "up" or "degraded").
 * - Does not treat null latency as zero.
 * - Excludes failed checks and checks with null latency.
 * - Returns null when no valid latency values exist.
 */
export function calculateAverageLatency(
  checksList: readonly MetricCheckInput[]
): number | null {
  const validLatencies: number[] = [];

  for (const check of checksList) {
    const isSuccessful = check.status === 'up' || check.status === 'degraded';
    if (
      isSuccessful &&
      check.latencyMs !== null &&
      typeof check.latencyMs === 'number' &&
      !Number.isNaN(check.latencyMs)
    ) {
      validLatencies.push(check.latencyMs);
    }
  }

  if (validLatencies.length === 0) {
    return null;
  }

  const sum = validLatencies.reduce((acc, val) => acc + val, 0);
  return sum / validLatencies.length;
}

/**
 * Calculates the 95th percentile (P95) latency using the Nearest-Rank method.
 *
 * Nearest-Rank Method Details:
 * 1. Filter input checks to take only successful checks ('up' or 'degraded') with non-null latency.
 * 2. Extract numeric latency values into a new array.
 * 3. Sort values ascending without mutating the caller's input array.
 * 4. Calculate the ordinal rank index:
 *      index = Math.ceil(0.95 * n) - 1
 *    where n is the number of valid latency observations.
 * 5. Return the value at that 0-based index.
 *
 * Returns null if there are no valid latency observations.
 */
export function calculateP95Latency(
  checksList: readonly MetricCheckInput[]
): number | null {
  const validLatencies: number[] = [];

  for (const check of checksList) {
    const isSuccessful = check.status === 'up' || check.status === 'degraded';
    if (
      isSuccessful &&
      check.latencyMs !== null &&
      typeof check.latencyMs === 'number' &&
      !Number.isNaN(check.latencyMs)
    ) {
      validLatencies.push(check.latencyMs);
    }
  }

  const n = validLatencies.length;
  if (n === 0) {
    return null;
  }

  // Create a sorted copy to prevent mutating the original array
  const sorted = [...validLatencies].sort((a, b) => a - b);

  // Nearest-rank formula: index = ceil(0.95 * n) - 1
  const index = Math.ceil(0.95 * n) - 1;

  return sorted[index];
}

// ============================================================================
// PART 2: DATABASE READ SERVICE
// ============================================================================

/**
 * Retrieves check history for an endpoint within a given time window.
 *
 * Defaults to the last 24 hours (now - 24h to now).
 * Results are ordered by checkedAt descending (newest first).
 */
export async function getChecksForEndpoint(
  endpointId: number,
  startTimeOrOptions?: Date | TimeWindowOptions,
  endTime?: Date,
  options?: { db?: typeof db }
): Promise<Check[]> {
  let resolvedStartTime: Date | undefined;
  let resolvedEndTime: Date | undefined;
  let database: typeof db = db;

  if (startTimeOrOptions instanceof Date) {
    resolvedStartTime = startTimeOrOptions;
    resolvedEndTime = endTime;
    if (options?.db) {
      database = options.db;
    }
  } else if (startTimeOrOptions && typeof startTimeOrOptions === 'object') {
    resolvedStartTime = startTimeOrOptions.startTime;
    resolvedEndTime = startTimeOrOptions.endTime;
    if (startTimeOrOptions.db) {
      database = startTimeOrOptions.db;
    }
  }

  const finalEndTime = resolvedEndTime ?? new Date();
  const finalStartTime =
    resolvedStartTime ??
    new Date(finalEndTime.getTime() - 24 * 60 * 60 * 1000);

  return database
    .select()
    .from(checks)
    .where(
      and(
        eq(checks.endpointId, endpointId),
        gte(checks.checkedAt, finalStartTime),
        lte(checks.checkedAt, finalEndTime)
      )
    )
    .orderBy(desc(checks.checkedAt));
}

// ============================================================================
// PART 3: ENDPOINT METRICS
// ============================================================================

/**
 * Computes availability and performance metrics for an endpoint over a time window.
 * Defaults to the last 24 hours.
 */
export async function getEndpointMetrics(
  endpointId: number,
  startTimeOrOptions?: Date | TimeWindowOptions,
  endTime?: Date,
  options?: { db?: typeof db }
): Promise<EndpointMetrics> {
  const checksList = await getChecksForEndpoint(
    endpointId,
    startTimeOrOptions,
    endTime,
    options
  );

  return {
    uptime: calculateUptime(checksList),
    errorRate: calculateErrorRate(checksList),
    averageLatencyMs: calculateAverageLatency(checksList),
    p95LatencyMs: calculateP95Latency(checksList),
    totalChecks: checksList.length,
  };
}

// ============================================================================
// PART 4: RECENT CHECK HISTORY
// ============================================================================

/**
 * Retrieves the most recent checks for an endpoint.
 *
 * Ordered by checkedAt descending (newest first).
 * Supports configurable limit with a sensible default of 50.
 */
export async function getRecentChecks(
  endpointId: number,
  limitOrOptions?: number | GetRecentChecksOptions,
  options?: GetRecentChecksOptions
): Promise<Check[]> {
  const limit =
    typeof limitOrOptions === 'number'
      ? limitOrOptions
      : (limitOrOptions?.limit ?? DEFAULT_RECENT_CHECKS_LIMIT);

  const database =
    typeof limitOrOptions === 'object' && limitOrOptions?.db
      ? limitOrOptions.db
      : (options?.db ?? db);

  return database
    .select()
    .from(checks)
    .where(eq(checks.endpointId, endpointId))
    .orderBy(desc(checks.checkedAt))
    .limit(limit);
}
