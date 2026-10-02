# Phase 7B: Scheduling Implementation Specification

This specification defines the exact implementation contracts for Phase 7C.
It is derived from the approved [SCHEDULING_DESIGN.md](file:///d:/Pulse_Health/docs/SCHEDULING_DESIGN.md) and verified against the existing codebase.

---

## 1. Scope

### In Scope

- New file: `services/scheduler.ts` — orchestration service.
- New file: `services/scheduler.test.ts` — unit tests for the scheduler.
- New file: `app/api/cron/check/route.ts` — authenticated cron API route.
- New file: `app/api/cron/check/route.test.ts` — unit tests for the cron route.

### Out of Scope

- No modifications to `services/checker.ts`.
- No modifications to `services/monitor.ts`.
- No modifications to `services/endpoints.ts`.
- No modifications to `services/metrics.ts`.
- No modifications to `db/schema.ts`.
- No Drizzle migrations.
- No new database tables or columns.
- No new npm dependencies.
- No UI or component changes.
- No `setInterval()` scheduling mechanism.
- No Redis, BullMQ, Kafka, or external queue infrastructure.
- No per-endpoint interval configuration.
- No alerting or notification channels.
- No distributed locking mechanism.

---

## 2. File Changes

### New Files

| File | Purpose |
| :--- | :--- |
| `services/scheduler.ts` | Scheduler orchestration service. Loads all endpoints, executes bounded-concurrency checks via `runCheck()`, aggregates results. Owns the process-local execution guard. |
| `services/scheduler.test.ts` | Unit tests for the scheduler service. |
| `app/api/cron/check/route.ts` | Next.js API route handler. Authenticates `CRON_SECRET`, invokes the scheduler, returns JSON summary. |
| `app/api/cron/check/route.test.ts` | Unit tests for the cron API route. |

### Modified Files

None. Zero existing files are modified.

---

## 3. Scheduler API

### Exported Constant

```typescript
export const MAX_CONCURRENCY = 5;
```

### Primary Function

```typescript
export async function runScheduledChecks(): Promise<SchedulerRunSummary>
```

**Behavior**:

1. Record `startedAt` timestamp via `Date.now()`.
2. Call `listEndpoints()` from `services/endpoints.ts`. If this throws, let the exception propagate to the caller (the route handler catches it and returns HTTP 500).
3. If the returned array is empty, return a summary immediately with `totalEndpoints: 0`, `attempted: 0`, `succeeded: 0`, `failed: 0`, `durationMs` computed from elapsed time.
4. Execute `runCheck(endpoint.id)` for each endpoint using a bounded concurrency pool (max 5 concurrent).
5. For each endpoint, wrap the `runCheck()` call in a try/catch:
   - If `runCheck()` resolves with `{ ok: true }`: record a `succeeded` result with the endpoint's `status` (`up`, `degraded`, or `down`).
   - If `runCheck()` resolves with `{ ok: false, error: 'ENDPOINT_NOT_FOUND' }`: record a `failed` result. This case should be rare (endpoint deleted between list and check) but must not crash the run.
   - If `runCheck()` throws an exception: record a `failed` result with the error message. This represents an infrastructure failure (e.g. database write failed). Continue processing remaining endpoints.
6. After all endpoints have been processed, compute final `durationMs` and return the `SchedulerRunSummary`.

**Parameters**: None. The scheduler always operates on all registered endpoints.

**Return type**: `Promise<SchedulerRunSummary>` (defined in Section 4).

**Imports from existing services**:
- `listEndpoints` from `services/endpoints.ts` ([L63](file:///d:/Pulse_Health/services/endpoints.ts#L63))
- `runCheck` from `services/monitor.ts` ([L84](file:///d:/Pulse_Health/services/monitor.ts#L84))
- `type RunCheckResult` from `services/monitor.ts` ([L43](file:///d:/Pulse_Health/services/monitor.ts#L43))

**Must NOT import**:
- `checkEndpoint` from `services/checker.ts`
- `persistCheckResult` from `services/monitor.ts`
- `db` from `db/index.ts`
- `checks` or `endpoints` from `db/schema.ts`

### Execution Guard Functions

```typescript
export function acquireExecutionGuard(): boolean
```

Returns `true` if the guard was successfully acquired (no run active).
Returns `false` if another run is already active.

```typescript
export function releaseExecutionGuard(): void
```

Releases the guard. Safe to call even if not currently acquired.

```typescript
export function isExecutionActive(): boolean
```

Returns the current state of the execution guard. Intended for testability and overlap detection.

These three functions operate on module-scoped state (see Section 12). They are exported for testability but are also used internally by the cron route handler.

---

## 4. SchedulerRunSummary

```typescript
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
```

### Field Definitions

| Field | Type | Meaning |
| :--- | :--- | :--- |
| `success` | `boolean` | `true` if the scheduler completed its run (regardless of individual target health). `false` only if the run itself could not execute (should not occur since `listEndpoints()` failures propagate as exceptions). |
| `totalEndpoints` | `number` | Number of endpoints returned by `listEndpoints()`. |
| `attempted` | `number` | Number of endpoints for which `runCheck()` was invoked. Always equals `totalEndpoints`. |
| `succeeded` | `number` | Number of endpoints where `runCheck()` resolved with `{ ok: true }`. This counts completed monitoring operations. A target returning HTTP 503 is a succeeded check (the probe ran and was persisted). |
| `failed` | `number` | Number of endpoints where `runCheck()` threw an exception or returned `{ ok: false }`. These are infrastructure/execution failures, NOT target health failures. |
| `durationMs` | `number` | Wall-clock duration of the entire scheduler run in milliseconds. |
| `results` | `EndpointCheckOutcome[]` | Per-endpoint outcome array. One entry per endpoint. |

### EndpointCheckOutcome Field Definitions

| Field | Type | Meaning |
| :--- | :--- | :--- |
| `endpointId` | `number` | The endpoint's database ID. |
| `endpointName` | `string` | The endpoint's registered name. |
| `outcome` | `'completed' \| 'error'` | `'completed'` when `runCheck()` resolved with `{ ok: true }`. `'error'` when `runCheck()` threw or returned `{ ok: false }`. |
| `status` | `'up' \| 'degraded' \| 'down' \| null` | The target health status from `checker.ts`. `null` when `outcome` is `'error'`. |
| `error` | `string \| null` | Error message when `outcome` is `'error'`. `null` when `outcome` is `'completed'`. |

### Key Distinction: succeeded vs. target health

A check where the target API returned HTTP 500 and was classified as `down`:
- `outcome`: `'completed'` (the monitoring operation succeeded)
- `status`: `'down'` (the target is unhealthy)
- Counted in `succeeded` (not `failed`)

A check where the database threw during `persistCheckResult()`:
- `outcome`: `'error'` (the monitoring operation failed)
- `status`: `null` (no health status could be determined)
- Counted in `failed` (not `succeeded`)

---

## 5. Endpoint Selection

### Source

The scheduler obtains the endpoint list by calling:

```typescript
import { listEndpoints } from './endpoints';
```

This is the existing function at [endpoints.ts:L63](file:///d:/Pulse_Health/services/endpoints.ts#L63):

```typescript
export async function listEndpoints(database = db): Promise<Endpoint[]> {
  return database.select().from(endpoints).orderBy(endpoints.createdAt);
}
```

### Behavior

- Returns all rows from the `endpoints` table, ordered by `created_at ASC`.
- Returns `Endpoint[]` where `Endpoint` has shape `{ id, name, url, latencyThresholdMs, createdAt }`.
- The scheduler does NOT duplicate this query. It does NOT write its own `SELECT` statement.

### Zero Endpoints

- `listEndpoints()` returns `[]`.
- The scheduler skips worker pool dispatch.
- Returns a summary with `totalEndpoints: 0`, `attempted: 0`, `succeeded: 0`, `failed: 0`.
- This is a normal, valid operational state. No error is logged.

### Database Failure During Endpoint Retrieval

- If `listEndpoints()` throws (e.g. database connection refused), the exception propagates out of `runScheduledChecks()`.
- The route handler catches this and returns HTTP 500.
- This is the only scenario where the entire scheduler run is aborted.

---

## 6. Concurrency

### Constant

```typescript
export const MAX_CONCURRENCY = 5;
```

### Behavior

The scheduler must execute `runCheck()` calls with at most `MAX_CONCURRENCY` (5) operations in flight simultaneously.

### Mechanism: Worker Pool

Implementation uses a worker-pull pattern:

1. An in-memory queue is initialized with all endpoint objects.
2. Up to `MAX_CONCURRENCY` (5) worker async loops are started concurrently.
3. Each worker loop:
   a. Pulls the next endpoint from the queue.
   b. Calls `runCheck(endpoint.id)` inside a try/catch.
   c. Records the outcome in a shared results array.
   d. Immediately pulls the next endpoint (if any remain).
   e. Exits when the queue is empty.
4. The scheduler awaits all worker loops via `Promise.all()` on the worker promises (not on the endpoint promises).

### Guarantees

- At no point are more than 5 `runCheck()` calls executing concurrently.
- When one `runCheck()` settles, the freed worker immediately pulls the next endpoint. No artificial delay.
- A failed `runCheck()` on one endpoint does NOT block or delay other workers.
- For ≤5 endpoints, all execute concurrently in a single wave.
- For >5 endpoints, execution proceeds in a sliding window pattern.

### What This Is NOT

- NOT `Promise.all(endpoints.map(e => runCheck(e.id)))` — this is unbounded concurrency.
- NOT sequential `for...of` — this has unnecessarily high total latency.

---

## 7. Monitoring Pipeline

### Call Chain

```
scheduler.ts: runScheduledChecks()
    │
    │  for each endpoint (bounded concurrency = 5):
    │
    ├──► monitor.ts: runCheck(endpoint.id)
    │        │
    │        ├──► checker.ts: checkEndpoint(endpoint.url, endpoint.latencyThresholdMs)
    │        │        │
    │        │        └──► HTTP GET target → classify UP / DEGRADED / DOWN
    │        │
    │        └──► monitor.ts: persistCheckResult(endpoint.id, checkResult)
    │                 │
    │                 └──► INSERT INTO checks (...)
    │
    └──► collect RunCheckResult into results array
```

### Scheduler Constraints

`scheduler.ts` must NOT:

| Prohibited Action | Reason |
| :--- | :--- |
| Call `fetch()` directly | HTTP probing is `checker.ts` responsibility |
| Import `checkEndpoint` from `checker.ts` | The scheduler does not probe; it orchestrates |
| Evaluate HTTP status codes (200, 404, 500, etc.) | Status classification is `checker.ts` responsibility |
| Calculate latency via `performance.now()` | Latency measurement is `checker.ts` responsibility |
| Call `db.insert()` or import `checks` from schema | Database writes are `monitor.ts` responsibility via `persistCheckResult()` |
| Import `persistCheckResult` from `monitor.ts` | The scheduler calls `runCheck()`, which internally persists |
| Import `db` from `db/index.ts` | No direct database access needed |

### What scheduler.ts DOES

- Import `listEndpoints` from `services/endpoints.ts`.
- Import `runCheck` and `type RunCheckResult` from `services/monitor.ts`.
- Import `isRunCheckSuccess` from `services/monitor.ts` (to distinguish `{ ok: true }` vs `{ ok: false }`).
- Call `runCheck(endpoint.id)` and inspect the returned `RunCheckResult`.
- Read `result.status` from `RunCheckSuccess` to populate `EndpointCheckOutcome.status`.

---

## 8. Failure Handling

### Classification Table

| Event | Handled By | runCheck() Behavior | Scheduler Outcome | Counted As |
| :--- | :--- | :--- | :--- | :--- |
| **HTTP 200 (fast)** | `checker.ts` | Resolves `{ ok: true, status: 'up' }` | `completed`, status `up` | `succeeded` |
| **HTTP 200 (slow)** | `checker.ts` | Resolves `{ ok: true, status: 'degraded' }` | `completed`, status `degraded` | `succeeded` |
| **HTTP 4xx** | `checker.ts` | Resolves `{ ok: true, status: 'down', errorType: 'http' }` | `completed`, status `down` | `succeeded` |
| **HTTP 5xx** | `checker.ts` | Resolves `{ ok: true, status: 'down', errorType: 'http' }` | `completed`, status `down` | `succeeded` |
| **Timeout (5000ms)** | `checker.ts` | Resolves `{ ok: true, status: 'down', errorType: 'timeout' }` | `completed`, status `down` | `succeeded` |
| **DNS failure** | `checker.ts` | Resolves `{ ok: true, status: 'down', errorType: 'dns' }` | `completed`, status `down` | `succeeded` |
| **Network error** | `checker.ts` | Resolves `{ ok: true, status: 'down', errorType: 'network' }` | `completed`, status `down` | `succeeded` |
| **Invalid URL** | `checker.ts` | Resolves `{ ok: true, status: 'down', errorType: 'invalid_url' }` | `completed`, status `down` | `succeeded` |
| **Endpoint deleted between list and check** | `monitor.ts` | Resolves `{ ok: false, error: 'ENDPOINT_NOT_FOUND' }` | `error` | `failed` |
| **Database write failure** | `monitor.ts` throws | `runCheck()` throws exception | `error` | `failed` |
| **Unexpected exception** | `scheduler.ts` catch | `runCheck()` throws exception | `error` | `failed` |

### Critical Invariant

All target API failures (HTTP 4xx, HTTP 5xx, timeout, DNS, network, invalid_url) result in `runCheck()` resolving successfully with `{ ok: true }`. The check row is persisted to the database. The scheduler counts these as `succeeded`.

Only infrastructure failures (database errors, unhandled exceptions) cause `runCheck()` to throw or return `{ ok: false }`. The scheduler counts these as `failed`.

---

## 9. Partial Failure

### Scenario

Given 5 endpoints:

| Endpoint | Target Behavior | runCheck() Result | Outcome |
| :--- | :--- | :--- | :--- |
| **A** — Production API | HTTP 200 (120ms) | `{ ok: true, status: 'up' }` | `completed` |
| **B** — Staging API | Timeout after 5000ms | `{ ok: true, status: 'down', errorType: 'timeout' }` | `completed` |
| **C** — Partner API | HTTP 200 (300ms) | `{ ok: true, status: 'up' }` | `completed` |
| **D** — Internal API | Database write fails | `runCheck()` throws `Error('connection refused')` | `error` |
| **E** — Health Check | HTTP 200 (80ms) | `{ ok: true, status: 'up' }` | `completed` |

### Expected Summary

```json
{
  "success": true,
  "totalEndpoints": 5,
  "attempted": 5,
  "succeeded": 4,
  "failed": 1,
  "durationMs": 5023,
  "results": [
    { "endpointId": 1, "endpointName": "Production API", "outcome": "completed", "status": "up", "error": null },
    { "endpointId": 2, "endpointName": "Staging API", "outcome": "completed", "status": "down", "error": null },
    { "endpointId": 3, "endpointName": "Partner API", "outcome": "completed", "status": "up", "error": null },
    { "endpointId": 4, "endpointName": "Internal API", "outcome": "error", "status": null, "error": "connection refused" },
    { "endpointId": 5, "endpointName": "Health Check", "outcome": "completed", "status": "up", "error": null }
  ]
}
```

### Invariants

- Endpoint D's database failure does NOT prevent Endpoints A, B, C, E from being checked.
- Endpoint B's target timeout is a successful monitoring operation. It is NOT a scheduler failure.
- `succeeded` (4) + `failed` (1) = `attempted` (5) = `totalEndpoints` (5).
- `success` is `true` because the scheduler itself completed its orchestration.

---

## 10. Cron API Contract

### Endpoint

```
POST /api/cron/check
```

### Request

| Property | Value |
| :--- | :--- |
| Method | `POST` |
| Path | `/api/cron/check` |
| Headers | `Authorization: Bearer <CRON_SECRET>` (required) |
| Body | None required. Any body content is ignored. |

### Responses

#### 200 OK — Successful Run

Returned when the scheduler completes its run (even if some individual checks failed).

```json
{
  "success": true,
  "totalEndpoints": 5,
  "attempted": 5,
  "succeeded": 4,
  "failed": 1,
  "durationMs": 5023,
  "results": [
    { "endpointId": 1, "endpointName": "Production API", "outcome": "completed", "status": "up", "error": null },
    { "endpointId": 4, "endpointName": "Internal API", "outcome": "error", "status": null, "error": "Database write failed" }
  ]
}
```

#### 200 OK — Zero Endpoints

```json
{
  "success": true,
  "totalEndpoints": 0,
  "attempted": 0,
  "succeeded": 0,
  "failed": 0,
  "durationMs": 2,
  "results": []
}
```

#### 200 OK — Skipped (Overlap)

Returned when a previous run is still active on this process instance.

```json
{
  "success": true,
  "skipped": true,
  "reason": "Previous scheduled check run is still active"
}
```

> **Design Decision**: The overlap response uses HTTP 200 (not 409) to avoid triggering false alerts in external cron monitoring systems that treat non-2xx as failures. The `skipped: true` field allows callers to detect the skip programmatically.

#### 401 Unauthorized

Returned when the `Authorization` header is missing, malformed, or contains an invalid secret.

```json
{
  "error": "Unauthorized"
}
```

No detail about what specifically was wrong. No hint about expected format or token length.

#### 500 Internal Server Error — Missing CRON_SECRET Configuration

Returned when `process.env.CRON_SECRET` is not configured on the server.

```json
{
  "error": "Internal server error"
}
```

The server logs `"CRON_SECRET environment variable is not configured"` but the response body does not disclose the cause.

#### 500 Internal Server Error — Infrastructure Failure

Returned when the scheduler itself fails (e.g. database unreachable during `listEndpoints()`).

```json
{
  "error": "Internal server error"
}
```

The server logs the error object for operational debugging but the response body does not expose stack traces, SQL errors, or connection strings.

---

## 11. Authentication

### Environment Variable

```
CRON_SECRET
```

This already exists in [`.env.example`](file:///d:/Pulse_Health/.env.example#L4-L5). No new environment variable is introduced.

### Validation Procedure

The route handler executes the following steps in order:

**Step 1: Verify server-side configuration**

Read `process.env.CRON_SECRET`. If it is `undefined`, `null`, or an empty string `""`:
- Log: `console.error('CRON_SECRET environment variable is not configured')`
- Return `Response.json({ error: 'Internal server error' }, { status: 500 })`
- Do NOT proceed to token extraction.

**Step 2: Extract the token from the request**

Read the `Authorization` header from the incoming request.

If the header is missing or does not start with `Bearer ` (case-sensitive, with trailing space):
- Return `Response.json({ error: 'Unauthorized' }, { status: 401 })`

Extract the token as the substring after `Bearer `.

**Step 3: Constant-time comparison**

```typescript
import { timingSafeEqual } from 'crypto';

const expected = Buffer.from(cronSecret, 'utf-8');
const received = Buffer.from(token, 'utf-8');

if (expected.length !== received.length) {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

if (!timingSafeEqual(expected, received)) {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}
```

The length check is required because `timingSafeEqual` throws if buffer lengths differ.

**Step 4: Proceed**

If all checks pass, invoke the scheduler.

### Behavior Matrix

| Scenario | HTTP Status | Response Body |
| :--- | :--- | :--- |
| `CRON_SECRET` not set on server | 500 | `{ "error": "Internal server error" }` |
| No `Authorization` header | 401 | `{ "error": "Unauthorized" }` |
| `Authorization: InvalidFormat` (no `Bearer `) | 401 | `{ "error": "Unauthorized" }` |
| `Authorization: Bearer wrong-token` | 401 | `{ "error": "Unauthorized" }` |
| `Authorization: Bearer <correct-token>` | 200 | Scheduler summary |

### What Must NEVER Appear in Logs or Responses

- The value of `CRON_SECRET`
- The value of the received token
- The value of `DATABASE_URL`
- The length of the expected or received token
- Any partial token match information

---

## 12. Overlap Protection

### Module-Scoped State

The execution guard uses module-scoped variables in `services/scheduler.ts`:

```typescript
let isRunActive = false;
let activeRunStartedAt: number | null = null;
```

These are NOT exported directly. They are managed via the exported functions `acquireExecutionGuard()`, `releaseExecutionGuard()`, and `isExecutionActive()`.

### Guard Lifecycle

**Acquisition** (in the route handler, BEFORE calling `runScheduledChecks()`):

```
if (!acquireExecutionGuard()) {
  return Response.json({
    success: true,
    skipped: true,
    reason: 'Previous scheduled check run is still active'
  }, { status: 200 });
}
```

`acquireExecutionGuard()` internally:
1. If `isRunActive === true`: return `false`.
2. Otherwise: set `isRunActive = true`, set `activeRunStartedAt = Date.now()`, return `true`.

**Release** (in the route handler, in a `finally` block):

```
try {
  const summary = await runScheduledChecks();
  return Response.json(summary, { status: 200 });
} finally {
  releaseExecutionGuard();
}
```

`releaseExecutionGuard()` internally:
1. Set `isRunActive = false`.
2. Set `activeRunStartedAt = null`.

### Ownership

The route handler owns the guard lifecycle (acquire before calling the scheduler, release in `finally`). The `runScheduledChecks()` function itself does NOT manage the guard — this keeps the scheduler function pure and testable without guard side effects.

### Explicit Limitation: NOT a Distributed Lock

This guard is a process-local in-memory flag. It protects against concurrent invocations within the same Node.js process only. In multi-instance deployments (multiple Vercel function instances, multiple Docker containers, multiple Kubernetes pods), each instance has its own isolated memory. Concurrent requests hitting different instances will each see `isRunActive === false` and proceed independently.

For Phase 7, this is acceptable because:
- A single external cron caller serializes requests naturally.
- Vercel serverless functions typically route sequential cron invocations to the same warm instance.

Multi-instance coordination (e.g. PostgreSQL advisory locks) is documented as a future consideration in the design document and is explicitly out of scope.

### Test Reset

For unit tests, a reset function is provided:

```typescript
export function resetExecutionGuard(): void
```

This resets `isRunActive = false` and `activeRunStartedAt = null`. It is intended for use in test `beforeEach()` blocks only.

---

## 13. Logging

### Permitted Log Output

| Event | Log Level | Example Message |
| :--- | :--- | :--- |
| CRON_SECRET not configured | `console.error` | `"CRON_SECRET environment variable is not configured"` |
| Scheduler run started | `console.log` | `"Scheduled check run started: 10 endpoints"` |
| Scheduler run completed | `console.log` | `"Scheduled check run completed: 10 endpoints, 9 succeeded, 1 failed, 5023ms"` |
| Individual endpoint error | `console.error` | `"Scheduled check failed for endpoint 4: connection refused"` |
| Overlap detected | `console.warn` | `"Scheduled check run skipped: previous run still active"` |

### Prohibited Log Content

- `CRON_SECRET` value
- `DATABASE_URL` value
- Authorization header content
- Received token values
- SQL query text containing credentials
- Full stack traces in production JSON responses (stack traces MAY appear in `console.error` for server-side debugging but MUST NOT appear in HTTP response bodies)

---

## 14. Testing Specification

All tests use Vitest. Tests mock `services/endpoints.ts`, `services/monitor.ts`, and `process.env.CRON_SECRET` following the existing patterns in [endpoints.test.ts](file:///d:/Pulse_Health/app/api/endpoints/endpoints.test.ts) and [monitor.test.ts](file:///d:/Pulse_Health/services/monitor.test.ts).

### 14.1 Scheduler Unit Tests (`services/scheduler.test.ts`)

Mock: `services/endpoints.ts` (`listEndpoints`) and `services/monitor.ts` (`runCheck`).

#### Zero Endpoints

| Test | Setup | Expected |
| :--- | :--- | :--- |
| Returns empty summary | `listEndpoints` → `[]` | `{ success: true, totalEndpoints: 0, attempted: 0, succeeded: 0, failed: 0, results: [] }` |
| `runCheck` is never called | `listEndpoints` → `[]` | `runCheck` called 0 times |

#### Single Endpoint

| Test | Setup | Expected |
| :--- | :--- | :--- |
| Succeeds with UP target | `listEndpoints` → `[endpoint1]`, `runCheck` → `{ ok: true, status: 'up' }` | `succeeded: 1, failed: 0`, result has `outcome: 'completed', status: 'up'` |
| Succeeds with DOWN target | `listEndpoints` → `[endpoint1]`, `runCheck` → `{ ok: true, status: 'down' }` | `succeeded: 1, failed: 0`, result has `outcome: 'completed', status: 'down'` |
| Records error when runCheck throws | `listEndpoints` → `[endpoint1]`, `runCheck` → throws `Error('DB failure')` | `succeeded: 0, failed: 1`, result has `outcome: 'error', error: 'DB failure'` |

#### Multiple Endpoints

| Test | Setup | Expected |
| :--- | :--- | :--- |
| All succeed | `listEndpoints` → 3 endpoints, all `runCheck` → `{ ok: true }` | `succeeded: 3, failed: 0` |
| Mixed success/failure | `listEndpoints` → 3 endpoints, 2 succeed, 1 throws | `succeeded: 2, failed: 1` |
| Partial failure does not halt execution | `listEndpoints` → 5 endpoints, endpoint 2 throws | `runCheck` called 5 times, `attempted: 5` |

#### Concurrency Limit

| Test | Setup | Expected |
| :--- | :--- | :--- |
| Never exceeds MAX_CONCURRENCY | `listEndpoints` → 10 endpoints with delayed `runCheck` | Track concurrent invocations; peak must be ≤ 5 |
| Processes all despite concurrency limit | `listEndpoints` → 10 endpoints | `attempted: 10, runCheck` called 10 times |

#### Target Failures Counted as Success

| Test | Setup | Expected |
| :--- | :--- | :--- |
| HTTP 500 target is succeeded | `runCheck` → `{ ok: true, status: 'down', errorType: 'http' }` | `succeeded: 1, failed: 0` |
| Timeout target is succeeded | `runCheck` → `{ ok: true, status: 'down', errorType: 'timeout' }` | `succeeded: 1, failed: 0` |
| DNS failure is succeeded | `runCheck` → `{ ok: true, status: 'down', errorType: 'dns' }` | `succeeded: 1, failed: 0` |

#### Endpoint Retrieval Failure

| Test | Setup | Expected |
| :--- | :--- | :--- |
| listEndpoints throws → exception propagates | `listEndpoints` → throws `Error('DB down')` | `runScheduledChecks()` rejects with `Error('DB down')` |

#### Duration Tracking

| Test | Setup | Expected |
| :--- | :--- | :--- |
| durationMs is a positive number | Any valid run | `summary.durationMs` is `>= 0` and is a number |

### 14.2 Execution Guard Tests (`services/scheduler.test.ts`)

| Test | Setup | Expected |
| :--- | :--- | :--- |
| acquireExecutionGuard returns true when inactive | Fresh state | Returns `true`, `isExecutionActive()` returns `true` |
| acquireExecutionGuard returns false when active | After successful acquire | Returns `false` |
| releaseExecutionGuard resets state | After acquire then release | `isExecutionActive()` returns `false` |
| releaseExecutionGuard is safe to call when not active | Fresh state | Does not throw |

### 14.3 Route Handler Tests (`app/api/cron/check/route.test.ts`)

Mock: `services/scheduler.ts` (`runScheduledChecks`, `acquireExecutionGuard`, `releaseExecutionGuard`), `process.env.CRON_SECRET`.

#### Authentication Tests

| Test | Request | Expected |
| :--- | :--- | :--- |
| Missing Authorization header | No header | 401 `{ error: 'Unauthorized' }` |
| Malformed Authorization (no Bearer prefix) | `Authorization: Token abc` | 401 `{ error: 'Unauthorized' }` |
| Wrong secret | `Authorization: Bearer wrong` | 401 `{ error: 'Unauthorized' }` |
| Correct secret | `Authorization: Bearer <valid>` | 200, scheduler invoked |
| CRON_SECRET not configured | `process.env.CRON_SECRET` undefined | 500 `{ error: 'Internal server error' }` |
| CRON_SECRET is empty string | `process.env.CRON_SECRET = ''` | 500 `{ error: 'Internal server error' }` |

#### Successful Execution Tests

| Test | Setup | Expected |
| :--- | :--- | :--- |
| Returns scheduler summary | Valid auth, scheduler returns summary | 200 with summary JSON |
| Zero endpoints | Valid auth, scheduler returns empty summary | 200 with `totalEndpoints: 0` |

#### Overlap Tests

| Test | Setup | Expected |
| :--- | :--- | :--- |
| Returns skipped when guard not acquired | `acquireExecutionGuard` → `false` | 200 `{ success: true, skipped: true }` |

#### Error Tests

| Test | Setup | Expected |
| :--- | :--- | :--- |
| Scheduler throws → 500 | `runScheduledChecks` throws | 500 `{ error: 'Internal server error' }` |
| Guard is released after error | `runScheduledChecks` throws | `releaseExecutionGuard` still called |
| Guard is released after success | Normal run | `releaseExecutionGuard` called |

---

## 15. Backward Compatibility

### Existing Services — Zero Modifications

| File | Status | Verification |
| :--- | :--- | :--- |
| [`services/checker.ts`](file:///d:/Pulse_Health/services/checker.ts) | **Unchanged** | No new imports, no new exports, no modified logic. `checkEndpoint()` signature unchanged: `(url: string, latencyThresholdMs: number, options?: CheckOptions) => Promise<CheckResult>`. |
| [`services/monitor.ts`](file:///d:/Pulse_Health/services/monitor.ts) | **Unchanged** | No new imports, no new exports, no modified logic. `runCheck()` signature unchanged: `(endpointId: number, options?: RunCheckOptions) => Promise<RunCheckResult>`. |
| [`services/endpoints.ts`](file:///d:/Pulse_Health/services/endpoints.ts) | **Unchanged** | No new imports, no new exports, no modified logic. `listEndpoints()` signature unchanged: `(database?: typeof db) => Promise<Endpoint[]>`. |
| [`services/metrics.ts`](file:///d:/Pulse_Health/services/metrics.ts) | **Unchanged** | No new imports, no new exports, no modified logic. |
| [`db/schema.ts`](file:///d:/Pulse_Health/db/schema.ts) | **Unchanged** | No new tables, no new columns, no modified constraints, no migrations. |
| [`db/index.ts`](file:///d:/Pulse_Health/db/index.ts) | **Unchanged** | No connection pool modifications. |

### Manual "Check Now" — Unaffected

The existing manual check flow:

```
Dashboard → POST /api/endpoints/[id]/check → runCheck(id) → checker → persist
```

This route ([route.ts](file:///d:/Pulse_Health/app/api/endpoints/%5Bid%5D/check/route.ts)) is not modified. It continues to call `runCheck(id)` directly. Both manual and scheduled checks produce identical `checks` table rows through the same `monitor.ts` → `checker.ts` → `persistCheckResult()` pipeline.

### Existing Tests — Unaffected

All existing test files remain unchanged:
- `services/checker.test.ts`
- `services/monitor.test.ts`
- `services/endpoints.test.ts`
- `services/metrics.test.ts`
- `app/api/endpoints/endpoints.test.ts`

The new test files test only the new modules.

---

## 16. Deployment Contract

### What the External Cron Provider Must Do

1. Send an HTTP `POST` request to `https://<your-domain>/api/cron/check`.
2. Include the header `Authorization: Bearer <CRON_SECRET>` where `<CRON_SECRET>` matches the value in the application's server environment.
3. Send the request at the desired interval (e.g. every 1 minute, every 5 minutes).
4. Allow sufficient timeout for the request to complete (at least 30 seconds; up to 60 seconds for larger endpoint registries).

### What the Application Provides

1. A single authenticated `POST` endpoint at `/api/cron/check`.
2. A JSON response indicating success, skip (overlap), or failure.
3. No request body is required.
4. The application handles all orchestration, concurrency, and persistence internally.

### Example curl Invocation

```bash
curl -X POST https://pulsecheck.example.com/api/cron/check \
  -H "Authorization: Bearer your-secret-here" \
  -H "Content-Type: application/json"
```

### Provider Independence

The specification does NOT select a specific cron provider. The endpoint is compatible with:
- Vercel Cron Jobs
- GitHub Actions scheduled workflows
- Cloudflare Workers Cron Triggers
- AWS EventBridge / CloudWatch Events
- Standard Linux crontab with `curl`
- Any HTTP scheduler capable of sending authenticated POST requests

---

## 17. Acceptance Criteria

Phase 7C implementation is complete when ALL of the following are satisfied:

### Authentication
- [ ] `POST /api/cron/check` with valid `Authorization: Bearer <CRON_SECRET>` returns 200.
- [ ] Missing `Authorization` header returns 401 with `{ error: 'Unauthorized' }`.
- [ ] Malformed `Authorization` header (no `Bearer ` prefix) returns 401.
- [ ] Wrong secret returns 401.
- [ ] Token comparison uses `crypto.timingSafeEqual`.
- [ ] `CRON_SECRET` unset on server returns 500 with `{ error: 'Internal server error' }`.
- [ ] Neither logs nor responses expose `CRON_SECRET` value.

### Orchestration
- [ ] `scheduler.ts` imports `listEndpoints` from `endpoints.ts` and `runCheck` from `monitor.ts`.
- [ ] `scheduler.ts` does NOT import `checkEndpoint`, `persistCheckResult`, `db`, `checks`, or `endpoints` schema.
- [ ] `scheduler.ts` does NOT call `fetch()`.
- [ ] `runScheduledChecks()` returns a valid `SchedulerRunSummary`.

### Concurrency
- [ ] At most 5 `runCheck()` calls are in flight simultaneously.
- [ ] All endpoints are processed regardless of concurrency limit.
- [ ] Workers pull next endpoint immediately upon completion.

### Failure Isolation
- [ ] Target API failure (HTTP 500, timeout, DNS, network, invalid URL) is counted as `succeeded`.
- [ ] Infrastructure failure (database error, unexpected throw) is counted as `failed`.
- [ ] One endpoint's failure does not prevent others from being checked.
- [ ] `listEndpoints()` failure causes HTTP 500 response.

### Edge Cases
- [ ] Zero endpoints returns 200 with `totalEndpoints: 0, attempted: 0`.
- [ ] Overlap returns 200 with `{ skipped: true }`.
- [ ] Guard is released in `finally` block (even on error).

### Backward Compatibility
- [ ] `checker.ts` is not modified.
- [ ] `monitor.ts` is not modified.
- [ ] `endpoints.ts` is not modified.
- [ ] `metrics.ts` is not modified.
- [ ] `db/schema.ts` is not modified.
- [ ] Existing tests pass without modification.
- [ ] Manual `POST /api/endpoints/[id]/check` continues to work identically.

### Quality
- [ ] All new tests pass (`npm test`).
- [ ] TypeScript compiles without errors (`npx tsc --noEmit`).
- [ ] Linting passes (`npm run lint`).
- [ ] Build succeeds (`npm run build`).

---

## 18. Phase 7C Implementation Order

The recommended implementation sequence:

### Step 1: Scheduler Types

Define in `services/scheduler.ts`:
- `MAX_CONCURRENCY` constant
- `EndpointCheckOutcome` interface
- `SchedulerRunSummary` interface

### Step 2: Execution Guard

Implement in `services/scheduler.ts`:
- Module-scoped `isRunActive` and `activeRunStartedAt` variables
- `acquireExecutionGuard()` function
- `releaseExecutionGuard()` function
- `isExecutionActive()` function
- `resetExecutionGuard()` function (test utility)

### Step 3: Scheduler Core Logic

Implement in `services/scheduler.ts`:
- `runScheduledChecks()` function
- Bounded concurrency worker pool
- Result aggregation

### Step 4: Scheduler Tests

Create `services/scheduler.test.ts`:
- All tests from Section 14.1 (zero endpoints, single, multiple, concurrency, failure, duration)
- All tests from Section 14.2 (execution guard)
- Run: `npm test -- services/scheduler.test.ts`

### Step 5: Cron Route Handler

Create `app/api/cron/check/route.ts`:
- `POST` handler with auth validation
- Guard acquire/release lifecycle
- Scheduler invocation
- Error handling

### Step 6: Cron Route Tests

Create `app/api/cron/check/route.test.ts`:
- All tests from Section 14.3 (auth, execution, overlap, errors)
- Run: `npm test -- app/api/cron/check/route.test.ts`

### Step 7: Full Verification

```bash
npm test                    # All tests pass
npx tsc --noEmit            # TypeScript compiles
npm run lint                # No lint errors
npm run build               # Production build succeeds
```

### Step 8: Manual Verification

1. Start dev server: `npm run dev`
2. Test unauthorized: `curl -X POST http://localhost:3000/api/cron/check` → 401
3. Test authorized (zero endpoints): `curl -X POST http://localhost:3000/api/cron/check -H "Authorization: Bearer <secret>"` → 200 with empty summary
4. Add an endpoint via dashboard, then repeat step 3 → 200 with check results
5. Verify manual "Check Now" still works via dashboard
