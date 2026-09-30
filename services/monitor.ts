import { eq } from 'drizzle-orm';
import { db } from '../db';
import {
  checks,
  endpoints,
  type Check,
  type CheckStatus,
  type Endpoint,
} from '../db/schema';
import {
  checkEndpoint,
  type CheckOptions,
  type CheckResult,
} from './checker';

export interface RunCheckOptions extends CheckOptions {
  db?: typeof db;
}

export interface RunCheckSuccess {
  ok: true;
  endpoint: Endpoint;
  check: Check;
  result: CheckResult;
  id: number;
  endpointId: number;
  checkedAt: Date;
  statusCode: number | null;
  latencyMs: number | null;
  success: boolean;
  status: CheckStatus;
  errorType: string | null;
  errorMessage: string | null;
}

export interface RunCheckNotFound {
  ok: false;
  success: false;
  error: 'ENDPOINT_NOT_FOUND';
  message: string;
}

export type RunCheckResult = RunCheckSuccess | RunCheckNotFound;

export function isRunCheckSuccess(
  result: RunCheckResult
): result is RunCheckSuccess {
  return result.ok === true;
}

/**
 * Persists an evaluated health check result into the checks table.
 */
export async function persistCheckResult(
  endpointId: number,
  result: CheckResult,
  database: typeof db = db
): Promise<Check> {
  const [insertedCheck] = await database
    .insert(checks)
    .values({
      endpointId,
      statusCode: result.statusCode,
      latencyMs: result.latencyMs,
      success: result.success,
      status: result.status,
      errorType: result.errorType,
      errorMessage: result.errorMessage,
    })
    .returning();

  return insertedCheck;
}

/**
 * Coordinates an active health check for a given endpoint ID:
 * 1. Loads the endpoint configuration by ID.
 * 2. If missing, returns a typed not-found result without dispatching HTTP requests.
 * 3. Dispatches HTTP health probe via checkEndpoint with URL and latency threshold.
 * 4. Receives the CheckResult.
 * 5. Persists exactly one row into the checks table.
 * 6. Returns the structured and persisted check result to the caller.
 */
export async function runCheck(
  endpointId: number,
  options?: RunCheckOptions
): Promise<RunCheckResult> {
  const database = options?.db ?? db;

  // 1. Load endpoint configuration by ID
  const [endpoint] = await database
    .select()
    .from(endpoints)
    .where(eq(endpoints.id, endpointId))
    .limit(1);

  // 2. If endpoint does not exist, return a clear typed result without HTTP probe
  if (!endpoint) {
    return {
      ok: false,
      success: false,
      error: 'ENDPOINT_NOT_FOUND',
      message: `Endpoint with ID ${endpointId} not found`,
    };
  }

  // 3. Dispatch HTTP request via checker.ts
  const checkOptions: CheckOptions | undefined =
    options?.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : undefined;

  const result = await checkEndpoint(
    endpoint.url,
    endpoint.latencyThresholdMs,
    checkOptions
  );

  // 4 & 5. Persist check result into PostgreSQL checks table
  const insertedCheck = await persistCheckResult(endpoint.id, result, database);

  const savedCheck: Check = insertedCheck ?? {
    id: 0,
    endpointId: endpoint.id,
    checkedAt: new Date(),
    statusCode: result.statusCode,
    latencyMs: result.latencyMs,
    success: result.success,
    status: result.status,
    errorType: result.errorType,
    errorMessage: result.errorMessage,
  };

  // 6. Return persisted and structured check result
  return {
    ok: true,
    endpoint,
    check: savedCheck,
    result,
    id: savedCheck.id,
    endpointId: savedCheck.endpointId,
    checkedAt: savedCheck.checkedAt,
    statusCode: savedCheck.statusCode,
    latencyMs: savedCheck.latencyMs,
    success: savedCheck.success,
    status: savedCheck.status,
    errorType: savedCheck.errorType,
    errorMessage: savedCheck.errorMessage,
  };
}
