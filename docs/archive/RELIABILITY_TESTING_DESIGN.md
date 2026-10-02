# PulseCheck Reliability Testing Design

**Document Status**: Draft / Design Only  
**Author**: Senior Backend & SRE Engineer  
**Phase**: Phase 7D — Reliability Testing Design  
**Target Architecture**: Phase 7C Scheduled Monitoring  

---

## 1. Purpose

This document defines the formal reliability testing strategy for PulseCheck's scheduled API monitoring system implemented in Phase 7C.

Phase 7C established:
- External cron trigger via `POST /api/cron/check`
- Constant-time `CRON_SECRET` authentication
- Process-local execution guard (`acquireExecutionGuard`, `releaseExecutionGuard`)
- Worker-pull bounded concurrency (`MAX_CONCURRENCY = 5`)
- Delegation to existing monitoring services (`monitor.ts:runCheck` -> `checker.ts:checkEndpoint` -> PostgreSQL `checks` table)

The goal of Phase 7D is to prove, through systematic test design, that the scheduling pipeline maintains operational integrity, fault isolation, resource bounds, and data consistency under normal operation, heavy concurrency, target failures, infrastructure faults, and edge conditions.

This is **design only**. No application code, database schema, or configuration files are modified.

---

## 2. Current System Under Test

The scheduling system is composed of two primary modules that orchestrate existing core services without altering their contracts:

```
[ External Cron Scheduler ]
             │
             ▼  (HTTP POST + Bearer CRON_SECRET)
┌────────────────────────────────────────────────────────┐
│ app/api/cron/check/route.ts                            │
│  - Secret validation (crypto.timingSafeEqual)          │
│  - Execution Guard (acquireExecutionGuard)             │
└──────────────────────────┬─────────────────────────────┘
                           │ invokes
                           ▼
┌────────────────────────────────────────────────────────┐
│ services/scheduler.ts (runScheduledChecks)             │
│  - Loads endpoints (services/endpoints.ts)             │
│  - Bounded concurrency pool (MAX_CONCURRENCY = 5)      │
│  - Worker-pull sliding queue                           │
│  - Results aggregation & duration tracking             │
└──────────────┬──────────────────────────┬──────────────┘
               │ Worker 1 .. 5            │ Worker 1 .. 5
               ▼                          ▼
┌────────────────────────────────────────────────────────┐
│ services/monitor.ts (runCheck)                         │
│  - Endpoint loading                                    │
│  - Probe dispatch (services/checker.ts)                │
│  - Database persistence (db.insert into checks)        │
└──────────────────────────┬─────────────────────────────┘
                           │ writes
                           ▼
┌────────────────────────────────────────────────────────┐
│ PostgreSQL (checks table)                              │
│  - id, endpointId, checkedAt, statusCode,              │
│    latencyMs, success, status, errorType, errorMessage │
└────────────────────────────────────────────────────────┘
```

### Exact Contracts Under Test

1. **`services/scheduler.ts`**:
   - `MAX_CONCURRENCY`: `5` (exported constant).
   - `runScheduledChecks()`: Fetches endpoints via `listEndpoints()`. If empty, returns summary with 0s. If populated, spawns up to `min(5, endpoints.length)` worker promises pulling sequentially from a shared index.
   - Outcome classification:
     - `RunCheckSuccess` -> `{ outcome: 'completed', status: 'up' | 'degraded' | 'down', error: null }` (counted in `succeeded`).
     - `RunCheckNotFound` -> `{ outcome: 'error', status: null, error: message }` (counted in `failed`).
     - Exception thrown by `runCheck` -> `{ outcome: 'error', status: null, error: message }` (caught, logged, counted in `failed`).
   - Summary structure (`SchedulerRunSummary`):
     ```typescript
     {
       success: boolean;
       totalEndpoints: number;
       attempted: number;
       succeeded: number;
       failed: number;
       durationMs: number;
       results: EndpointCheckOutcome[];
     }
     ```
   - Execution Guard: Module-scoped boolean flag `isRunActive` operated by `acquireExecutionGuard()`, `releaseExecutionGuard()`, `isExecutionActive()`, and `resetExecutionGuard()`.

2. **`app/api/cron/check/route.ts`**:
   - `CRON_SECRET` check: If unset, returns HTTP 500 (`{ error: 'Internal server error' }`).
   - Auth Header: Requires `Authorization: Bearer <token>`. Compares token buffers using `crypto.timingSafeEqual`. Mismatches or missing headers return HTTP 401 (`{ error: 'Unauthorized' }`).
   - Execution Guard: Calls `acquireExecutionGuard()`. If returns `false`, returns HTTP 200 (`{ success: true, skipped: true, reason: 'Previous scheduled check run is still active' }`).
   - Execution: Executes `runScheduledChecks()`, returns HTTP 200 with summary, ensures `releaseExecutionGuard()` is always executed in `finally`.
   - Unexpected scheduler exception (e.g., `listEndpoints()` DB failure): Caught, returns HTTP 500 (`{ error: 'Internal server error' }`), releases guard.

3. **`services/monitor.ts` & `services/checker.ts`**:
   - Target HTTP probe errors (DNS failure, connection refusal, HTTP 4xx/5xx, timeouts) are classified as monitoring results (`status: 'down'`, `success: false`) and persisted to PostgreSQL.
   - Database connection/write errors inside `runCheck()` or `listEndpoints()` throw exceptions, which represent infrastructure failures.

---

## 3. Reliability Testing Principles

The reliability strategy enforces 14 foundational principles:

1. **Test behavior, not implementation details**: Verify inputs, outputs, concurrency invariants, side effects, and error classifications rather than private internals.
2. **No fake success data**: Tests must never assert false positives or mock away the very invariant under test.
3. **Target failures are expected monitoring outcomes**: An unreachable target endpoint is a successful monitoring run resulting in a `down` check record, not a scheduler failure.
4. **Distinguish infrastructure from target failures**: A down target results in `outcome: 'completed'` with `status: 'down'` and a saved check row. A database crash results in `outcome: 'error'` or an HTTP 500 error.
5. **Fault isolation**: One failing, hanging, or slow target must never abort the scheduler run or block other endpoints from being checked.
6. **Strict concurrency ceiling**: Active concurrent checks must never exceed 5 under any workload.
7. **Safe empty state**: An empty endpoint repository must return a valid zeroed summary without error or check creation.
8. **Deterministic repeated execution**: Running the scheduler $N$ times creates exactly $N$ checks per endpoint; each run creates at most 1 check per endpoint.
9. **Process-local overlap guard compliance**: A secondary run attempting to start while a primary run is executing in the same process must be skipped safely with HTTP 200.
10. **Authentication as a gatekeeper**: Any invalid or missing credentials must halt the request before the scheduler or database is touched.
11. **Zero credential leakage**: Neither `CRON_SECRET` nor `DATABASE_URL` may ever appear in response payloads, error messages, logs, or test reports.
12. **Zero infrastructure bloat**: Reliability tests must run cleanly in the standard environment without requiring Docker, Redis, Kafka, or Kubernetes.
13. **No per-endpoint interval scheduling**: All registered endpoints are checked collectively in accordance with the single-schedule contract.
14. **No test-driven schema mutation**: The database schema is fixed; tests must validate behavior against existing tables.

---

## 4. Test Categories

Reliability tests are organized into 11 distinct operational categories:

| Category | Identifier | Focus |
| :--- | :--- | :--- |
| **Empty System** | Category A | Zero endpoints edge case, internal summary consistency. |
| **Single Endpoint** | Category B | Baseline transitions for UP, DEGRADED, and DOWN states. |
| **Multiple Endpoints** | Category C | Multi-target processing, non-interference between targets. |
| **Concurrency & Queuing** | Category D | Bounded concurrency ceiling ($\le 5$), worker pull dynamics. |
| **Target Failure Isolation** | Category E | Target HTTP failures (DNS, timeout, 4xx, 5xx) handled as data. |
| **Infrastructure Failure** | Category F | Database write failures, query errors, unexpected exceptions. |
| **Authentication & Security** | Category G | Secret enforcement, constant-time validation, header sanitization. |
| **Overlap & Execution Guard**| Category H | Single-flight execution, overlap skipping, lifecycle cleanup. |
| **Repeated Execution** | Category I | Multi-cycle consistency, history preservation, idempotency bounds. |
| **Partial Failure Scenarios** | Category J | Mixed workloads (some healthy, some degraded, some failing, some infra errors). |
| **Database Persistence** | Category K | Verification of actual PostgreSQL check row fields and counts. |

---

## 5. Reliability Scenarios

### Scenario A: Empty System
- **State**: The `endpoints` table contains 0 records.
- **Trigger**: `runScheduledChecks()` or `POST /api/cron/check`.
- **Expected Behavior**:
  - `listEndpoints()` returns `[]`.
  - Scheduler returns immediately without launching workers.
  - Summary: `{ success: true, totalEndpoints: 0, attempted: 0, succeeded: 0, failed: 0, results: [] }`.
  - Zero rows inserted into `checks`.

### Scenario B: Single Endpoint Tri-State
- **State**: Exactly 1 endpoint registered.
- **Variants**:
  1. *Healthy*: Target returns HTTP 200 in 50ms (threshold 500ms) -> `status: 'up'`, `outcome: 'completed'`.
  2. *Degraded*: Target returns HTTP 200 in 650ms (threshold 500ms) -> `status: 'degraded'`, `outcome: 'completed'`.
  3. *Unhealthy*: Target returns HTTP 500 -> `status: 'down'`, `outcome: 'completed'`.
- **Expected Behavior**: Exactly 1 check row persisted with corresponding status, latency, and status code. Succeeded count is 1; failed count is 0.

### Scenario C: Multiple Endpoints Mixed Workload
- **State**: 3 registered endpoints:
  - Endpoint 1 (UP): HTTP 200, 40ms.
  - Endpoint 2 (DEGRADED): HTTP 200, 700ms (threshold 500ms).
  - Endpoint 3 (DOWN): HTTP 503 Service Unavailable.
- **Expected Behavior**:
  - All 3 endpoints are processed.
  - Endpoint 3 failing does not abort or interrupt Endpoints 1 and 2.
  - Summary: `totalEndpoints: 3`, `attempted: 3`, `succeeded: 3`, `failed: 0`.
  - All 3 outcomes marked `'completed'` with their respective health status.

### Scenario D: Bounded Concurrency & Worker Queue
- **State**: 12 registered endpoints.
- **Trigger**: Scheduler triggered with all targets active.
- **Expected Behavior**:
  - At any moment $t$, active running `runCheck()` promises $\le 5$.
  - Exactly 5 workers pull sequentially from the work queue.
  - As soon as one worker completes an endpoint, it immediately pulls the next available endpoint (sliding window).
  - Every endpoint from ID 1 to 12 is checked exactly once.
  - No endpoint is skipped; no endpoint is executed twice.
  - Summary: `totalEndpoints: 12`, `attempted: 12`, `succeeded: 12`.

### Scenario E: Target Failure Isolation
- **State**: 4 registered endpoints:
  - Endpoint 1: Valid URL, fast response (UP).
  - Endpoint 2: DNS failure (`ENOTFOUND` / `getaddrinfo`).
  - Endpoint 3: Request timeout (`AbortController` abort after timeout).
  - Endpoint 4: HTTP 404 Not Found.
- **Expected Behavior**:
  - `checkEndpoint()` catches network/timeout errors, returns structured `CheckResult` with `status: 'down'`.
  - `monitor.ts:runCheck` writes down records to `checks` with `errorType: 'dns'`, `'timeout'`, `'http'`.
  - `scheduler.ts` treats all 4 as `outcome: 'completed'` because the monitoring operation succeeded.
  - Scheduler summary: `totalEndpoints: 4`, `attempted: 4`, `succeeded: 4`, `failed: 0`.

### Scenario F: Infrastructure Failure Distinguishability
- **State**: 3 registered endpoints.
- **Variants**:
  1. *Database write fails for Endpoint 2*: `persistCheckResult()` throws `PostgreSQL connection terminated`.
     - Endpoint 1 succeeds (`outcome: 'completed'`).
     - Endpoint 2 catches the exception -> `outcome: 'error'`, `status: null`, `error: 'PostgreSQL connection terminated'`.
     - Endpoint 3 continues and succeeds (`outcome: 'completed'`).
     - Summary: `totalEndpoints: 3`, `attempted: 3`, `succeeded: 2`, `failed: 1`.
  2. *Endpoint listing fails*: `listEndpoints()` throws database exception.
     - Exception propagates to route handler.
     - Handler logs error, releases execution guard in `finally`, returns HTTP 500 `{ error: 'Internal server error' }`.
     - Execution guard is NOT left locked.

### Scenario G: Authentication Gatekeeping & Timing Resistance
- **State**: Route `POST /api/cron/check` with configured `CRON_SECRET`.
- **Variants**:
  1. No `Authorization` header -> HTTP 401. Scheduler NOT called.
  2. Header is `Basic ...` or `Bearer` (missing token) -> HTTP 401.
  3. Header has token of unequal byte length -> HTTP 401.
  4. Header has token of equal byte length but incorrect characters -> evaluated via `timingSafeEqual`, returns HTTP 401.
  5. Correct Bearer token -> HTTP 200, scheduler executes.
  6. Server has no `CRON_SECRET` in environment -> returns HTTP 500 without leaking config.

### Scenario H: Process-Local Execution Guard & Overlap Handling
- **State**: Long-running scheduled run active (e.g. 5 endpoints taking 3 seconds).
- **Trigger**: Second `POST /api/cron/check` arrives at $t = 1\text{s}$.
- **Expected Behavior**:
  - Second request attempts `acquireExecutionGuard()`, which returns `false`.
  - Second request returns HTTP 200 `{ success: true, skipped: true, reason: 'Previous scheduled check run is still active' }`.
  - Second request does NOT invoke `runScheduledChecks()`.
  - Second request does NOT release the guard owned by the first request.
  - When the first request finishes, it releases the guard in `finally`.
  - Subsequent third request at $t = 4\text{s}$ acquires guard normally and executes.

### Scenario I: Repeated Sequential Execution
- **State**: 3 endpoints registered.
- **Action**: Trigger scheduler 5 times sequentially (Cycle 1 through 5).
- **Expected Behavior**:
  - Each run completes with `succeeded: 3, failed: 0`.
  - Check row count increases by exactly 3 per cycle ($3 \times 5 = 15$ new rows).
  - Each endpoint has exactly 5 new check records in chronological sequence.
  - No check records are overwritten or corrupted.

### Scenario J: Partial Failure Benchmark Scenario
- **State**: 5 endpoints registered:
  - Endpoint 1: Fast HTTP 200 (UP)
  - Endpoint 2: Slow HTTP 200 (DEGRADED)
  - Endpoint 3: HTTP 500 (DOWN)
  - Endpoint 4: Database crash during persist (Infrastructure Error)
  - Endpoint 5: Deleted endpoint / missing ID (Endpoint Not Found Error)
- **Expected Behavior**:
  - `totalEndpoints`: 5
  - `attempted`: 5
  - `succeeded`: 3 (Endpoints 1, 2, 3)
  - `failed`: 2 (Endpoints 4, 5)
  - `results` contains 5 items: 3 with `outcome: 'completed'` and health status, 2 with `outcome: 'error'` and `status: null`.

### Scenario K: Database Persistence Invariant
- **Action**: Execute run with $M$ endpoints.
- **Verification**:
  - Query DB `SELECT count(*) FROM checks`.
  - Verify $\Delta \text{count} == \text{number of completed outcomes}$.
  - Verify every new row has valid non-null `checkedAt`, `success`, `status`, matching `endpointId`.
  - Verify latency matches the probe elapsed time.

---

## 6. Failure Injection Strategy

To test resilience without modifying production code, failure injection must be applied at clear architectural seams:

```
┌────────────────────────────────────────────────────────┐
│ Seam 1: Network Layer (global fetch / AbortController) │  <-- Inject HTTP 5xx, timeouts, DNS errors
└──────────────────────────┬─────────────────────────────┘
                           │
┌────────────────────────────────────────────────────────┐
│ Seam 2: Service Layer (monitor.ts / endpoints.ts)      │  <-- Inject slow checks, deleted IDs, worker delays
└──────────────────────────┬─────────────────────────────┘
                           │
┌────────────────────────────────────────────────────────┐
│ Seam 3: Database Layer (drizzle-orm / pg Client)       │  <-- Inject query rejections, connection drops
└────────────────────────────────────────────────────────┘
```

### Seam Guidelines: What to Mock vs. What Remains Real

| Level | Component Under Test | What is Mocked / Injected | What Remains Real | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **Unit / Service** | `scheduler.ts` | `runCheck()`, `listEndpoints()` | The scheduler loop, queue, concurrency limiter, results aggregation, execution guard. | Test queuing, concurrency bounds, error boundary handling in isolation. |
| **Unit / Route** | `app/api/cron/check/route.ts` | `runScheduledChecks()`, `process.env` | Timing-safe auth comparison, request header parsing, guard acquisition. | Test HTTP auth permutations and overlap skipping. |
| **Integration** | `scheduler.ts` + `monitor.ts` | Target HTTP `fetch` (via mock HTTP server or stubbed fetch) | Scheduler, monitor, Drizzle ORM queries, real PostgreSQL database. | Test that scheduled checks write real rows to the database. |
| **End-to-End** | Full HTTP API Pipeline | None (real dev server, real Neon DB, real endpoints) | Everything: HTTP route -> Scheduler -> Monitor -> Target -> PostgreSQL. | Final sanity verification. |

### Forbidden Mocking Practices
- **Do not mock the scheduler within scheduler tests**: The worker pool and queue logic must run genuinely.
- **Do not mock the execution guard in scheduler tests**: The state variable transitions must be real.
- **Do not mock `crypto.timingSafeEqual` in route tests**: Real buffer comparison must be executed.
- **Do not invent mock fields not in the TypeScript contracts**: Adhere strictly to `SchedulerRunSummary` and `RunCheckResult`.

---

## 7. Reliability Invariants

The following invariants must hold true under all conditions:

| Invariant ID | Invariant Statement | What is Being Protected | How It Is Tested | What Failure Indicates |
| :--- | :--- | :--- | :--- | :--- |
| **INV-01** | $\text{Active Concurrent Checks} \le 5$ at all times | Database connection pool, network socket pool, event loop | Measure active worker promises during execution with 10+ delayed endpoints. | Concurrency leak; workers spawned unboundedly; potential connection starvation. |
| **INV-02** | Every endpoint is processed at most once per run | Idempotency within a scheduled tick; prevent duplicate work | Check that endpoint ID frequencies in `summary.results` are strictly 1. | Queue index corruption or race condition in worker loop. |
| **INV-03** | Target failures never abort the scheduler run | Service availability; partial outage containment | Inject HTTP 500, DNS error, and timeout on subset of endpoints; verify all endpoints complete. | Unhandled rejection crashing worker pool; cascading outage. |
| **INV-04** | Infrastructure failures are never reported as target failures | Telemetry correctness; operational trust | Force database error in `runCheck`; verify `outcome === 'error'` and `status === null`. | Misleading health metrics; silent data loss masked as target downtime. |
| **INV-05** | Unauthorized cron calls never execute checks | Security perimeter; denial-of-service prevention | Call `POST /api/cron/check` without auth or with invalid token; assert `runScheduledChecks` not called. | Broken access control; unauthorized external trigger of heavy workloads. |
| **INV-06** | A completed check run produces exactly 1 check row per successful endpoint | Data integrity; historical metrics accuracy | Compare `SELECT count(*) FROM checks` delta with `summary.succeeded`. | Double-write bug or uncommitted transaction. |
| **INV-07** | Empty endpoint list produces zero check rows and returns cleanly | System initialization; zero-state stability | Run scheduler with 0 endpoints; assert duration $\ge 0$, attempted 0, DB row delta 0. | Edge-case crash on unpopulated database. |
| **INV-08** | Summary counts are mathematically consistent | Reporting integrity | Invariant: $\text{totalEndpoints} == \text{attempted} == \text{succeeded} + \text{failed} == \text{results.length}$. | Counter drift; race condition in result array pushing. |
| **INV-09** | Zero secret leakage in all outputs | Security hygiene; credential safety | Regex scan HTTP responses, console logs, error messages for `CRON_SECRET` and `DATABASE_URL`. | Secret exposure in logs or API responses. |
| **INV-10** | Execution guard is released on failure | Service liveness; deadlock prevention | Trigger scheduler with an error that throws out of `runScheduledChecks`; verify guard is released. | Permanent deadlock; all future cron runs skipped forever. |

---

## 8. Test Matrix

| Test ID | Category | Setup | Action | Expected Result | Evidence | Priority |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **REL-001** | Empty System | DB has 0 endpoints | Trigger `runScheduledChecks()` | Returns `success: true`, all counts 0, results empty, duration $\ge 0$. | Summary JSON | Critical |
| **REL-002** | Single Endpoint (UP) | 1 endpoint, target fast HTTP 200 | Trigger `runScheduledChecks()` | Succeeded: 1, failed: 0, outcome: 'completed', status: 'up'. 1 DB row. | Summary + DB check row | High |
| **REL-003** | Single Endpoint (DEGRADED) | 1 endpoint, target slow HTTP 200 | Trigger `runScheduledChecks()` | Succeeded: 1, failed: 0, outcome: 'completed', status: 'degraded'. 1 DB row. | Summary + DB check row | High |
| **REL-004** | Single Endpoint (DOWN) | 1 endpoint, target HTTP 500 | Trigger `runScheduledChecks()` | Succeeded: 1, failed: 0, outcome: 'completed', status: 'down'. 1 DB row. | Summary + DB check row | High |
| **REL-005** | Multiple Endpoints | 3 endpoints (UP, DEGRADED, DOWN) | Trigger `runScheduledChecks()` | Total: 3, Succeeded: 3, Failed: 0. All 3 outcomes completed. 3 DB rows. | Summary + DB check rows | Critical |
| **REL-006** | Concurrency Cap | 15 endpoints, 50ms delay each | Trigger `runScheduledChecks()` | Active count never exceeds 5. All 15 complete. Duration $\approx 150\text{ms}$. | Concurrency tracker log | Critical |
| **REL-007** | Sliding Window | 7 endpoints, varied latencies | Trigger `runScheduledChecks()` | Fast endpoints release workers immediately to pull remaining. | Worker pull timestamps | High |
| **REL-008** | Target Timeout | Endpoint target hangs $> 5000\text{ms}$ | Trigger `runScheduledChecks()` | Probe times out, classified `down`, `errorType: 'timeout'`, scheduler finishes. | Check row + summary | Critical |
| **REL-009** | Target DNS Failure | Endpoint URL host does not exist | Trigger `runScheduledChecks()` | Classified `down`, `errorType: 'dns'`, scheduler finishes. | Check row + summary | High |
| **REL-010** | Target HTTP 4xx/5xx | Endpoints returning 400, 404, 502 | Trigger `runScheduledChecks()` | Classified `down`, `errorType: 'http'`, scheduler finishes. | Check rows + summary | High |
| **REL-011** | DB Query Failure on List | `listEndpoints()` throws DB Error | Trigger `POST /api/cron/check` | Route catches error, returns HTTP 500, guard released. | HTTP 500 response | Critical |
| **REL-012** | DB Persist Error on 1 Target | `runCheck` throws DB Error for 1 target | Trigger `runScheduledChecks()` with 4 targets | 3 targets succeeded ('completed'), 1 target failed ('error'). Run completes. | Summary counts (3 succ, 1 fail) | Critical |
| **REL-013** | Endpoint Deleted Mid-Run | `runCheck` returns `ENDPOINT_NOT_FOUND` | Trigger `runScheduledChecks()` | Recorded as outcome: 'error', failed incremented, remaining endpoints run. | Summary results array | Medium |
| **REL-014** | Missing Auth Header | Route called with no headers | `POST /api/cron/check` | HTTP 401 Unauthorized. Scheduler not called. | HTTP 401 response | Critical |
| **REL-015** | Malformed Auth Header | Header: `Bearer` (empty token) | `POST /api/cron/check` | HTTP 401 Unauthorized. Scheduler not called. | HTTP 401 response | High |
| **REL-016** | Incorrect Secret (Same Len) | Header: `Bearer wrong_length_match` | `POST /api/cron/check` | HTTP 401 via `timingSafeEqual`. Scheduler not called. | HTTP 401 response | Critical |
| **REL-017** | Correct Secret | Valid `Bearer <CRON_SECRET>` | `POST /api/cron/check` | HTTP 200 OK with full `SchedulerRunSummary`. | HTTP 200 JSON | Critical |
| **REL-018** | Missing Server Secret | `process.env.CRON_SECRET` undefined | `POST /api/cron/check` | HTTP 500 Internal Server Error. No stack trace or secret in body. | HTTP 500 JSON | High |
| **REL-019** | Execution Overlap Guard | Trigger run 2 while run 1 is active | Second `POST /api/cron/check` | Second returns HTTP 200 `skipped: true`. First completes unaffected. | HTTP 200 skipped JSON | Critical |
| **REL-020** | Guard Release on Crash | `runScheduledChecks` throws exception | `POST /api/cron/check` | HTTP 500. Immediate subsequent request acquires guard successfully. | Guard state check | Critical |
| **REL-021** | Repeated Runs (5x) | 3 endpoints | Trigger 5 sequential runs | 15 total checks created (3 per run). No duplicate checks per run. | DB check count query | Critical |
| **REL-022** | Partial Failure Mix | 5 endpoints (2 UP, 1 DEG, 1 DOWN, 1 INFRA) | Trigger `runScheduledChecks()` | Total: 5, Succeeded: 4, Failed: 1. 4 rows persisted. Duration tracked. | Summary + DB checks | Critical |
| **REL-023** | Secret Sanitization | Intentionally inject invalid auth & errors | Inspect all response bodies & logs | String matching confirms zero occurrences of secrets or DB credentials. | Log audit output | Critical |

---

## 9. Automated Testing Strategy

Automated reliability tests will be executed via Vitest, following existing repo patterns:

1. **Test Location**:
   - Unit & Boundary Reliability Tests: `services/scheduler.reliability.test.ts`
   - API & Auth Reliability Tests: `app/api/cron/check/route.reliability.test.ts`
2. **Concurrency Invariant Harness**:
   - A concurrency tracking wrapper wrapping `runCheck`:
     ```typescript
     let activeChecks = 0;
     let maxObservedConcurrency = 0;

     const monitoredRunCheck = async (id: number) => {
       activeChecks++;
       maxObservedConcurrency = Math.max(maxObservedConcurrency, activeChecks);
       try {
         await new Promise((resolve) => setTimeout(resolve, 30));
         return mockSuccessResult(id);
       } finally {
         activeChecks--;
       }
     };
     ```
   - Assert `maxObservedConcurrency <= MAX_CONCURRENCY` after draining.
3. **Execution Guard Reset**:
   - Enforce `resetExecutionGuard()` in `beforeEach` to guarantee test isolation.

---

## 10. Local Integration Verification

Local integration testing validates the entire stack running locally with the real database:

1. **Pre-Conditions**:
   - Local `.env.local` contains valid `DATABASE_URL` and `CRON_SECRET`.
   - PostgreSQL database is reachable.
2. **Verification Script Workflow**:
   - Query starting check row count: $C_0 = \text{count(checks)}$.
   - Trigger `POST /api/cron/check` with invalid credentials -> assert HTTP 401.
   - Assert check row count is unchanged: $C_1 == C_0$.
   - Trigger `POST /api/cron/check` with valid credentials -> assert HTTP 200.
   - Query ending check row count: $C_2 = \text{count(checks)}$.
   - Assert $C_2 - C_0 == N$ (where $N$ is count of registered endpoints).
3. **Safety & Zero Disruption**:
   - The script only triggers checks for existing registered endpoints.
   - No endpoints are deleted or modified.
   - Existing check history remains completely intact.

---

## 11. Database Persistence Verification

To verify that the database layer operates without corruption or missing fields:

1. **Row Count Verification**:
   $$\Delta \text{checks} = \text{succeeded in summary}$$
2. **Field Completeness Assertion**:
   For every new row in `checks`:
   - `id`: Positive integer (auto-incremented).
   - `endpoint_id`: Valid foreign key referencing `endpoints.id`.
   - `checked_at`: Valid ISO timestamp within run window $[t_\text{start}, t_\text{end}]$.
   - `status`: One of `'up'`, `'degraded'`, `'down'` matching summary outcome.
   - `latency_ms`: Non-negative integer or null (if network dropped before connection).
   - `status_code`: HTTP status code integer or null (if connection failed).
   - `success`: Boolean (`true` for HTTP 2xx/3xx, `false` for 4xx/5xx/network errors).
   - `error_type` & `error_message`: Set appropriately for failing targets; null for healthy targets.

---

## 12. Authentication Verification

Authentication reliability focuses on two facets:

1. **Security & Timing Safety**:
   - The route handler uses Node's native `crypto.timingSafeEqual`.
   - Buffer lengths are compared first to avoid throwing exceptions on length mismatch, returning 401 cleanly.
   - Valid secret match must allow invocation; any single bit difference must reject.
2. **Zero Information Disclosure**:
   - Missing secret in `.env`: Returns HTTP 500 `{ "error": "Internal server error" }`. Does not state "CRON_SECRET is missing" to the client.
   - Invalid token: Returns HTTP 401 `{ "error": "Unauthorized" }`. Does not echo back received token or expected format.

---

## 13. Overlap Guard Verification

### Process-Local Contract & Explicit Limitations

> [!IMPORTANT]
> **Process-Local Scope**: The execution guard (`isRunActive`) is stored in module memory within a single Node.js process. It prevents overlapping runs within that process (e.g., if a 1-minute cron triggers while the previous 1-minute run is still executing).
>
> It does **NOT** provide distributed locking. If the application is scaled horizontally across multiple server instances or serverless containers, two instances could trigger concurrently. Distributed locking (via Postgres advisory locks or Redis) is explicitly **out of scope** for Phase 7.

### Guard Lifecycle Invariant
```
            acquireExecutionGuard()
                   │
         ┌─────────┴─────────┐
         ▼ (true)            ▼ (false)
    Execute Run         Return HTTP 200
         │              (skipped: true)
         ▼
     finally {
       releaseExecutionGuard()
     }
```

The guard must **always** be released in the `finally` block, ensuring that even if `runScheduledChecks()` throws an unhandled exception, future cron triggers will not be locked out.

---

## 14. Evidence Collection

During Phase 7D testing, every verification step must produce auditable evidence:

1. **Automated Test Report**: Vitest suite output detailing test suite count, test count, durations, and pass status.
2. **Execution Telemetry**:
   - `totalEndpoints`
   - `attempted`
   - `succeeded`
   - `failed`
   - `durationMs`
   - `results` array breakdown
3. **Concurrency Metrics**: Peak observed active worker count.
4. **Database Snapshots**:
   - Row counts before and after runs.
   - SQL query result sample of inserted records (IDs, endpoints, status, latency).
5. **HTTP Auditing**:
   - HTTP status codes (200, 401, 500).
   - JSON response payloads.
   - Verification that no secrets appear in standard output or logs.

---

## 15. Pass / Fail Criteria

### Objective PASS Criteria
A test run is considered **PASS** if and only if all of the following hold:
- [ ] 100% of automated reliability tests pass (`vitest run`).
- [ ] Observed concurrency never exceeds `MAX_CONCURRENCY = 5`.
- [ ] Target API failures (DNS, timeout, 4xx/5xx) are recorded as valid monitoring results and do not crash the scheduler.
- [ ] Infrastructure failures (DB crash) are flagged as `outcome: 'error'` and are distinguishable from target health.
- [ ] Unauthorized cron requests consistently return HTTP 401 and trigger 0 checks.
- [ ] Overlapping runs within the same process are skipped with HTTP 200 `{ skipped: true }`.
- [ ] Check row count delta in PostgreSQL matches `succeeded` count exactly.
- [ ] Zero secrets (`CRON_SECRET`, `DATABASE_URL`) appear in any test output, response, or log.
- [ ] All existing 130 unit tests across the repository continue to pass without regression.

### Objective FAIL Criteria
A test run is considered **FAIL** if any of the following occur:
- Any concurrent execution exceeds 5 simultaneous checks.
- A single target failure causes the scheduler to abort remaining checks.
- An unauthenticated request triggers a check run.
- The execution guard remains locked after a failed run.
- Duplicate check rows are inserted for the same endpoint within a single run.
- An infrastructure failure is recorded as `status: 'down'` instead of an error outcome.
- Any regression in existing test suites.

---

## 16. Out of Scope

The following items are intentionally excluded from Phase 7D reliability testing:

- **Production Deployment**: Cloud hosting, Vercel/AWS deployment.
- **Provider-Specific Cron Setups**: Vercel Cron, GitHub Actions, or cron daemon configurations.
- **Distributed Locking**: Redis, Postgres advisory locks, Redlock across multiple servers.
- **Queue Infrastructure**: BullMQ, Kafka, RabbitMQ, SQS.
- **Alerting & Notifications**: Email, SMS, Slack, Webhook incident alerts.
- **Per-Endpoint Scheduling**: Independent cron intervals per endpoint.
- **Database Schema Redesign**: Adding tables, indexes, or migrations.
- **Internet-Scale Load Testing**: Stress testing beyond normal expected endpoint loads.
- **Security Penetration Testing**: Fuzzing, DDoS simulation.

---

## 17. Phase 7D Exit Criteria

Phase 7D is formally complete and ready for sign-off when:

1. This **Reliability Testing Design document** is approved.
2. The reliability test suite is implemented according to this design and passes with 100% success.
3. Local integration verification confirms end-to-end execution and PostgreSQL persistence.
4. Concurrency invariant $\le 5$ is empirically proven under load.
5. All 130 baseline unit tests remain green.
6. Clean Git status is maintained with zero unauthorized modifications to existing code or schema.
