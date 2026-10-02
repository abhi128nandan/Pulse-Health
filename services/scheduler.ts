import { listEndpoints } from './endpoints';
import { runCheck, isRunCheckSuccess, type RunCheckResult } from './monitor';
import type { Endpoint } from '../db/schema';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EndpointCheckOutcome {
  endpointId: number;
  endpointName: string;
  outcome: 'completed' | 'error';
  status: 'up' | 'degraded' | 'down' | null;
  error: string | null;
}

export interface SchedulerRunSummary {
  success: boolean;
  totalEndpoints: number;
  attempted: number;
  succeeded: number;
  failed: number;
  durationMs: number;
  results: EndpointCheckOutcome[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MAX_CONCURRENCY = 5;

// ---------------------------------------------------------------------------
// Execution Guard (process-local, NOT a distributed lock)
// ---------------------------------------------------------------------------

let isRunActive = false;

/**
 * Attempts to acquire the process-local execution guard.
 * Returns true if acquired, false if another run is already active.
 */
export function acquireExecutionGuard(): boolean {
  if (isRunActive) {
    return false;
  }
  isRunActive = true;
  return true;
}

/**
 * Releases the process-local execution guard.
 * Safe to call even if not currently acquired.
 */
export function releaseExecutionGuard(): void {
  isRunActive = false;
}

/**
 * Returns whether a scheduled run is currently active.
 */
export function isExecutionActive(): boolean {
  return isRunActive;
}

/**
 * Resets execution guard state. Intended for test beforeEach() blocks only.
 */
export function resetExecutionGuard(): void {
  isRunActive = false;
}

// ---------------------------------------------------------------------------
// Core Scheduler
// ---------------------------------------------------------------------------

/**
 * Processes a single endpoint check within a worker, recording the outcome.
 */
function processEndpointResult(
  endpoint: Endpoint,
  result: RunCheckResult
): EndpointCheckOutcome {
  if (isRunCheckSuccess(result)) {
    return {
      endpointId: endpoint.id,
      endpointName: endpoint.name,
      outcome: 'completed',
      status: result.status,
      error: null,
    };
  }

  // RunCheckNotFound — endpoint was deleted between list and check
  return {
    endpointId: endpoint.id,
    endpointName: endpoint.name,
    outcome: 'error',
    status: null,
    error: result.message,
  };
}

/**
 * Executes scheduled health checks across all registered endpoints.
 *
 * Uses a bounded-concurrency worker pool (MAX_CONCURRENCY = 5).
 * Delegates each endpoint check to monitor.ts:runCheck().
 * Does NOT acquire or release the execution guard — the route handler owns
 * that lifecycle.
 *
 * If listEndpoints() throws, the exception propagates to the caller.
 */
export async function runScheduledChecks(): Promise<SchedulerRunSummary> {
  const startedAt = Date.now();

  // 1. Load all endpoints via existing service
  const endpointList = await listEndpoints();

  // 2. Empty endpoints — valid state, return immediately
  if (endpointList.length === 0) {
    return {
      success: true,
      totalEndpoints: 0,
      attempted: 0,
      succeeded: 0,
      failed: 0,
      durationMs: Date.now() - startedAt,
      results: [],
    };
  }

  console.log(`Scheduled check run started: ${endpointList.length} endpoints`);

  // 3. Bounded concurrency worker pool
  const results: EndpointCheckOutcome[] = [];
  let queueIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      // Pull next endpoint from queue
      const index = queueIndex;
      if (index >= endpointList.length) {
        return;
      }
      queueIndex++;

      const endpoint = endpointList[index];

      try {
        const checkResult: RunCheckResult = await runCheck(endpoint.id);
        results.push(processEndpointResult(endpoint, checkResult));
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `Scheduled check failed for endpoint ${endpoint.id}: ${errorMessage}`
        );
        results.push({
          endpointId: endpoint.id,
          endpointName: endpoint.name,
          outcome: 'error',
          status: null,
          error: errorMessage,
        });
      }
    }
  }

  // Launch up to MAX_CONCURRENCY workers
  const workerCount = Math.min(MAX_CONCURRENCY, endpointList.length);
  const workers: Promise<void>[] = [];
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }

  // Wait for all workers to drain the queue
  await Promise.all(workers);

  // 4. Aggregate results
  const durationMs = Date.now() - startedAt;
  const succeeded = results.filter((r) => r.outcome === 'completed').length;
  const failed = results.filter((r) => r.outcome === 'error').length;

  console.log(
    `Scheduled check run completed: ${endpointList.length} endpoints, ${succeeded} succeeded, ${failed} failed, ${durationMs}ms`
  );

  return {
    success: true,
    totalEndpoints: endpointList.length,
    attempted: endpointList.length,
    succeeded,
    failed,
    durationMs,
    results,
  };
}
