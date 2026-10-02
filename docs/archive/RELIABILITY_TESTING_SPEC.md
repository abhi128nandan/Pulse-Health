# PulseCheck Reliability Test Specification

**Document Status**: Specification Only (Implementation-Ready)  
**Author**: Senior Backend & SRE Engineer  
**Phase**: Phase 7D — Reliability Testing Specification  
**Derived From**: [RELIABILITY_TESTING_DESIGN.md](file:///d:/Pulse_Health/docs/RELIABILITY_TESTING_DESIGN.md), [SCHEDULING_SPEC.md](file:///d:/Pulse_Health/docs/SCHEDULING_SPEC.md), [SCHEDULING_DESIGN.md](file:///d:/Pulse_Health/docs/SCHEDULING_DESIGN.md)  
**Target Codebase**: `services/scheduler.ts`, `app/api/cron/check/route.ts`, `services/monitor.ts`, `services/checker.ts`, `services/endpoints.ts`, `db/schema.ts`  

---

## 1. Purpose & Scope

This specification translates the architectural principles and test scenarios of [RELIABILITY_TESTING_DESIGN.md](file:///d:/Pulse_Health/docs/RELIABILITY_TESTING_DESIGN.md) into concrete, executable test specifications.

Every requirement from `REL-001` through `REL-023` is specified with exact inputs, execution steps, mocking boundaries, database expectations, summary assertions, and cleanup procedures.

### Scope Boundaries
- **Specification only**: No tests are implemented in this step.
- **Zero changes to production code**: `services/scheduler.ts`, `app/api/cron/check/route.ts`, `services/monitor.ts`, `services/checker.ts`, and `services/endpoints.ts` are strictly frozen.
- **Zero database changes**: No schema changes, no migration scripts, and no test-only columns.
- **Zero dependency changes**: No npm packages, external queues, or test libraries added.
- **Strict adherence to current contracts**: Tests must validate against the exact existing interfaces (`SchedulerRunSummary`, `EndpointCheckOutcome`, `RunCheckResult`, `CheckResult`, `Endpoint`, `Check`).

---

## 2. Test Levels & Explicit Boundaries

Reliability testing spans four explicit levels. A test may only claim a given level if its dependencies match the requirements below:

| Level | Definition | Scope | Mock Boundaries | Real Components |
| :--- | :--- | :--- | :--- | :--- |
| **UNIT** | Isolated scheduler/service verification | `services/scheduler.ts` | `listEndpoints()` and `runCheck()` are mocked. | Worker pool, queue logic, execution guard, and results aggregation. |
| **ROUTE / BOUNDARY** | HTTP route authentication and guard verification | `app/api/cron/check/route.ts` | `runScheduledChecks()` is mocked. | Header extraction, `crypto.timingSafeEqual`, HTTP responses, and execution guard lifecycle. |
| **INTEGRATION** | Multi-service orchestration with persistence | `services/scheduler.ts` + `services/monitor.ts` + `services/checker.ts` + `db` | Target HTTP endpoints are served by a local loopback HTTP server or deterministic fetch stubs. | Scheduler, monitor, checker, Drizzle ORM, and PostgreSQL connection. |
| **END-TO-END (E2E)** | Full stack pipeline verification | Route -> Scheduler -> Monitor -> Checker -> Loopback Server -> PostgreSQL | Nothing mocked; executed against running local dev/test server and PostgreSQL. | Full application stack and real database. |

### Clear Architectural Separation

- **Scheduler Unit Tests (`services/scheduler.reliability.test.ts`)**:
  - Mock `listEndpoints()` and `runCheck()`.
  - Validate concurrency limits ($\le 5$), sliding-window queue pull, error aggregation, and partial failure counters.
  - **Does NOT claim to verify checker classification**: When `runCheck()` is mocked, it simulates outcomes to verify scheduler handling.
- **Checker Tests (`services/checker.test.ts`)**:
  - Existing suite already provides authoritative coverage of HTTP status classification, timeout aborts, and error mapping.
- **Integration Reliability Tests (`services/scheduler.integration.reliability.test.ts`)**:
  - `scheduler.ts`, `monitor.ts`, `checker.ts`, and PostgreSQL remain **100% real**.
  - Targets are hosted on a deterministic local loopback HTTP test server (e.g. `http://127.0.0.1:<port>`).
  - Proves the entire orchestration and database persistence pipeline end-to-end.

---

## 3. Mocking Strategy & Seam Rules

Mocks are applied strictly at designated architectural seams:

```
[ POST /api/cron/check ] ──(Seam A)──> [ scheduler.ts ] ──(Seam B)──> [ monitor.ts ] ──(Seam C)──> [ Target HTTP / DB ]
```

### Seam Rules

1. **Seam A (Route -> Scheduler)**:
   - *Applied in*: Route/Boundary tests (`REL-011`, `REL-014` through `REL-020`, `REL-023`).
   - *What is mocked*: `runScheduledChecks()`.
   - *What remains real*: Header extraction, bearer token parsing, `crypto.timingSafeEqual`, `acquireExecutionGuard()`, `releaseExecutionGuard()`, response serialization.

2. **Seam B (Scheduler -> Monitor / Endpoints)**:
   - *Applied in*: Scheduler Unit tests (`REL-001`, `REL-006`, `REL-007`, `REL-012`, `REL-013`, `REL-022`).
   - *What is mocked*: `listEndpoints()`, `runCheck()`.
   - *What remains real*: Worker queue index, bounded loop, `Math.min(MAX_CONCURRENCY, n)`, `Promise.all` worker coordination, try/catch error wrapping, summary calculation.

3. **Seam C (Checker / Monitor -> Target HTTP Probes)**:
   - *Applied in*: Integration tests (`REL-002` through `REL-005`, `REL-008` through `REL-010`, `REL-021`).
   - *What is used*: A dedicated local loopback HTTP test server (`127.0.0.1`) with deterministic response paths, or deterministic fetch error injection.
   - *What remains real*: `runScheduledChecks()`, `runCheck()`, `checkEndpoint()`, `persistCheckResult()`, Drizzle ORM, and real PostgreSQL database.

### Forbidden Mocks
- **Never mock the scheduler loop inside scheduler tests**: The worker pool must genuinely execute.
- **Never mock `timingSafeEqual` in route tests**: Real constant-time comparison must run.
- **Never mock the execution guard inside scheduler unit tests**: State transitions of `isRunActive` must be verified.
- **Never mock Drizzle ORM in Integration/E2E tests**: Database side effects must hit real tables.

---

## 4. Test Isolation & Environment Lifecycle

To prevent test crosstalk, leaking state, or database pollution:

1. **Execution Guard Reset**:
   - `resetExecutionGuard()` must be called in `beforeEach()` of every test suite interacting with scheduler or route modules.
   - `resetExecutionGuard()` is an existing test utility exported from `services/scheduler.ts` specifically for test setup.
2. **Environment Variable Restoration**:
   - Save `const originalEnv = { ...process.env };` before tests.
   - In `afterEach()`, restore `process.env = { ...originalEnv };` and clean up `vi.unstubAllGlobals()`, `vi.clearAllMocks()`.
3. **Database Test Isolation**:
   - Integration tests that insert real rows into PostgreSQL must use dedicated test endpoints created within the test.
   - Any test endpoint created for integration tests must be cleaned up in `afterEach()` or `afterAll()` via `db.delete(endpoints).where(eq(endpoints.id, testEndpointId))`. Because `checks.endpointId` has `ON DELETE CASCADE`, deleting the test endpoint cleanly removes associated test check rows.
4. **Local HTTP Server Lifecycle**:
   - A Node.js `http.Server` running on `127.0.0.1` must be started in `beforeAll()` on an ephemeral port (`port = 0`) and closed in `afterAll()`.
5. **Console Output Muting**:
   - During negative tests expecting errors (e.g. `console.error`, `console.warn`), spy on `console.error` and `console.warn` via `vi.spyOn(console, 'error').mockImplementation(() => {})` to prevent log noise while verifying that error logging occurred.

---

## 5. Timing Rules & Non-Flaky Concurrency

1. **Classification-Based Threshold Assertions (No Exact Milliseconds)**:
   - `checker.ts` measures real elapsed time using `performance.now()`. Wall-clock time varies across machines and CI environments.
   - **Do NOT assert exact elapsed latency values** such as `latency_ms === 750` or `latency === 80ms`.
   - **Assert classification and threshold relationships**:
     - *Healthy (UP)*: `latency_ms <= latencyThresholdMs`, `status === 'up'`, `success === true`.
     - *Degraded*: `latency_ms > latencyThresholdMs`, `status === 'degraded'`, `success === true`.
     - *Target Down / HTTP failure*: `status === 'down'`, `success === false`, `status_code === expected HTTP status`.
     - *Network / Timeout failure*: `status === 'down'`, `success === false`, `latency_ms >= 0` or `null`.
2. **Concurrency Invariant Measurement**:
   - Track concurrency via an atomic in-memory counter rather than thread inspection:
     ```typescript
     let activeChecks = 0;
     let maxObservedConcurrency = 0;

     const monitoredRunCheck = async (id: number) => {
       activeChecks++;
       maxObservedConcurrency = Math.max(maxObservedConcurrency, activeChecks);
       try {
         await new Promise((resolve) => setTimeout(resolve, 25));
         return makeSuccessResult('up');
       } finally {
         activeChecks--;
       }
     };
     ```
   - Assert `expect(maxObservedConcurrency).toBeLessThanOrEqual(5)`.
3. **Sliding Worker Queue Evidence**:
   - To verify that workers pull immediately upon completion (sliding window), assign staggered delays (e.g., Endpoint 1 finishes in 10ms, while others take 100ms).
   - Record the `startedAt` timestamp of Endpoint 6.
   - Assert that Endpoint 6 started before Endpoint 2 finished, proving the queue did not wait for the entire initial batch of 5 to complete.

---

## 6. Test Data & Deterministic Endpoints

### Local Loopback Test Server (`http://127.0.0.1:<port>`)
For all integration tests (`REL-002` through `REL-005`, `REL-008` through `REL-010`, `REL-021`), test endpoints point to a local loopback HTTP server with deterministic endpoints:

| Route Path | Behavior | Intended Test Case |
| :--- | :--- | :--- |
| `/up` | Returns HTTP 200 immediately (< 30ms) | Healthy target (`status: 'up'`) |
| `/degraded` | Delays for 200ms before returning HTTP 200 (configured threshold 100ms) | Degraded target (`status: 'degraded'`) |
| `/down` | Returns HTTP 500 immediately | Unhealthy target (`status: 'down'`) |
| `/timeout` | Does not respond for 4000ms (configured probe timeout 500ms) | Target timeout (`errorType: 'timeout'`) |
| `/status-400` | Returns HTTP 400 Bad Request | Target client error (`errorType: 'http'`) |
| `/status-404` | Returns HTTP 404 Not Found | Target missing error (`errorType: 'http'`) |
| `/status-502` | Returns HTTP 502 Bad Gateway | Target gateway error (`errorType: 'http'`) |

### Strict Prohibition of Public Internet Targets
Reliability tests must **NEVER** depend on:
- `google.com`, `github.com`, `linkedin.com`, `jsonplaceholder`
- Random third-party public web APIs
- Real nonexistent public Internet domains (e.g., `this-domain-does-not-exist.org`)
- All network interaction is strictly confined to `127.0.0.1` or deterministic in-process fetch stubs.

---

## 7. Database Verification & Schema Fidelity

### Schema Mapping (Strictly per `db/schema.ts`)
| Field Name | Type | Constraints / Allowed Values | Verification Rule |
| :--- | :--- | :--- | :--- |
| `id` | `serial` | Primary Key, positive integer | Auto-incremented, strictly > 0 |
| `endpoint_id` | `integer` | Foreign Key -> `endpoints.id` (ON DELETE CASCADE) | Must match target `endpoint.id` |
| `checked_at` | `timestamp` | Defaults to `now()` | Valid Date object; within test execution timeframe |
| `status_code` | `integer` | Nullable | Integer HTTP code (e.g. 200, 500) or null on network drop |
| `latency_ms` | `integer` | Nullable | **Integer $\ge 0$** (or null on pre-connect abort). Threshold check: $\le \text{threshold}$ for UP; $> \text{threshold}$ for DEGRADED. **No exact millisecond assertions**. |
| `success` | `boolean` | Not Null | `true` for HTTP 2xx/3xx; `false` for 4xx/5xx/network/timeout |
| `status` | `check_status` | Enum: `'up'`, `'degraded'`, `'down'` | Matches evaluated health classification |
| `error_type` | `text` | Nullable: `'invalid_url'`, `'timeout'`, `'dns'`, `'network'`, `'http'` | Null on healthy; string on failure |
| `error_message` | `text` | Nullable | Null on healthy; error description on failure |

### Row-Count Assertion Invariant
```
beforeCount = count(checks)
execute scheduler
afterCount = count(checks)
delta = afterCount - beforeCount
```
- **Rule**: `delta === summary.succeeded` is valid **if and only if** all completed monitoring operations persist a row (which `monitor.ts:runCheck` does).
- Infrastructure errors that throw before or during `persistCheckResult()` do not create rows; they increment `summary.failed`, ensuring `delta === summary.succeeded` remains true.

---

## 8. Detailed Test Specifications

### Test Group 1: Empty System

#### REL-001: Zero Endpoints Handling
- **Level**: UNIT
- **Component**: `services/scheduler.ts` (`runScheduledChecks`)
- **Required Setup**: `listEndpoints` returns empty array `[]`.
- **Test Doubles**: `listEndpoints = vi.fn().mockResolvedValue([])`; `runCheck = vi.fn()`.
- **What Must Remain Real**: Scheduler empty-check branch, duration calculation, summary structure.
- **Input**: None (`runScheduledChecks()`).
- **Execution Steps**:
  1. Set up mock returning `[]`.
  2. Invoke `const summary = await runScheduledChecks();`.
- **Expected Result**:
  - `summary.success === true`
  - `summary.totalEndpoints === 0`
  - `summary.attempted === 0`
  - `summary.succeeded === 0`
  - `summary.failed === 0`
  - `summary.durationMs >= 0`
  - `summary.results.length === 0`
  - `runCheck` was called **0 times**.
- **Database Side Effects**: Zero rows inserted.
- **Summary Counters**: All counts 0; `success: true`.
- **Evidence**: `SchedulerRunSummary` JSON object.
- **Cleanup**: `vi.clearAllMocks()`.

---

### Test Group 2: Single Endpoint Tri-State

#### REL-002: Single Healthy Target (UP)
- **Level**: INTEGRATION
- **Component**: `services/scheduler.ts` + `services/monitor.ts` + `services/checker.ts` + PostgreSQL
- **Required Setup**: 1 registered endpoint pointing to loopback server `/up` (latency threshold 500ms).
- **Test Doubles**: None. Local HTTP server returns HTTP 200 immediately (< 30ms).
- **What Must Remain Real**: Scheduler worker execution, monitor runCheck, checker fetch, PostgreSQL persistence.
- **Input**: Endpoint `{ name: 'Target UP', url: 'http://127.0.0.1:<port>/up', latencyThresholdMs: 500 }`.
- **Execution Steps**:
  1. Insert endpoint into PostgreSQL.
  2. Invoke `runScheduledChecks()`.
- **Expected Result**:
  - `summary.totalEndpoints === 1`, `summary.attempted === 1`, `summary.succeeded === 1`, `summary.failed === 0`.
  - `summary.results[0].outcome === 'completed'`
  - `summary.results[0].status === 'up'`
  - `summary.results[0].error === null`
- **Database Side Effects**: 1 row inserted in `checks`:
  - `status === 'up'`
  - `success === true`
  - `status_code === 200`
  - `latency_ms <= 500` and `latency_ms >= 0` (classification threshold verified, not exact ms)
  - `error_type === null`
- **Evidence**: Summary JSON + query of inserted check row.
- **Cleanup**: Delete test endpoint (cascades checks).

#### REL-003: Single Degraded Target (DEGRADED)
- **Level**: INTEGRATION
- **Component**: `services/scheduler.ts` + `services/monitor.ts` + `services/checker.ts` + PostgreSQL
- **Required Setup**: 1 registered endpoint pointing to loopback server `/degraded` (configured threshold 100ms; loopback delays 200ms).
- **Test Doubles**: None. Local HTTP server delays 200ms before returning HTTP 200.
- **What Must Remain Real**: Scheduler worker execution, monitor runCheck, checker fetch, PostgreSQL persistence.
- **Input**: Endpoint `{ name: 'Target DEGRADED', url: 'http://127.0.0.1:<port>/degraded', latencyThresholdMs: 100 }`.
- **Execution Steps**:
  1. Insert endpoint into PostgreSQL.
  2. Invoke `runScheduledChecks()`.
- **Expected Result**:
  - `summary.succeeded === 1`, `summary.failed === 0`.
  - `summary.results[0].outcome === 'completed'`
  - `summary.results[0].status === 'degraded'`
  - `summary.results[0].error === null`
- **Database Side Effects**: 1 row inserted in `checks`:
  - `status === 'degraded'`
  - `success === true`
  - `status_code === 200`
  - `latency_ms > 100` and `latency_ms >= 0` (strictly exceeds latencyThresholdMs)
- **Evidence**: Summary JSON + query of inserted check row.
- **Cleanup**: Delete test endpoint (cascades checks).

#### REL-004: Single Down Target (DOWN)
- **Level**: INTEGRATION
- **Component**: `services/scheduler.ts` + `services/monitor.ts` + `services/checker.ts` + PostgreSQL
- **Required Setup**: 1 registered endpoint pointing to loopback server `/down`.
- **Test Doubles**: None. Local HTTP server returns HTTP 500 immediately.
- **What Must Remain Real**: Scheduler worker execution, monitor runCheck, checker fetch, PostgreSQL persistence.
- **Input**: Endpoint `{ name: 'Target DOWN', url: 'http://127.0.0.1:<port>/down', latencyThresholdMs: 500 }`.
- **Execution Steps**:
  1. Insert endpoint into PostgreSQL.
  2. Invoke `runScheduledChecks()`.
- **Expected Result**:
  - `summary.succeeded === 1`, `summary.failed === 0` (monitoring completed successfully!).
  - `summary.results[0].outcome === 'completed'`
  - `summary.results[0].status === 'down'`
  - `summary.results[0].error === null`
- **Database Side Effects**: 1 row inserted in `checks`:
  - `status === 'down'`
  - `success === false`
  - `status_code === 500`
  - `latency_ms >= 0`
  - `error_type === 'http'`
- **Evidence**: Summary JSON + query of inserted check row.
- **Cleanup**: Delete test endpoint (cascades checks).

---

### Test Group 3: Multiple Endpoints

#### REL-005: Mixed Workload (UP, DEGRADED, DOWN)
- **Level**: INTEGRATION
- **Component**: `services/scheduler.ts` + `services/monitor.ts` + `services/checker.ts` + PostgreSQL
- **Required Setup**: 3 registered endpoints in PostgreSQL pointing to loopback `/up`, `/degraded`, and `/down`.
- **Test Doubles**: None.
- **What Must Remain Real**: Multi-worker dispatch, sequential outcome aggregation, real DB writes.
- **Execution Steps**:
  1. Register 3 test endpoints.
  2. Invoke `runScheduledChecks()`.
- **Expected Result**:
  - `summary.totalEndpoints === 3`
  - `summary.attempted === 3`
  - `summary.succeeded === 3`
  - `summary.failed === 0`
  - `summary.results` has 3 elements, all with `outcome: 'completed'`.
  - Target DOWN on Endpoint 3 did not prevent Endpoints 1 and 2 from completing.
- **Database Side Effects**: 3 distinct check rows persisted:
  - Row 1: `status === 'up'`, `latency_ms <= latencyThresholdMs`
  - Row 2: `status === 'degraded'`, `latency_ms > latencyThresholdMs`
  - Row 3: `status === 'down'`, `status_code === 500`
- **Evidence**: Summary results array matching endpoint IDs + 3 persisted rows.
- **Cleanup**: Delete test endpoints (cascades checks).

---

### Test Group 4: Concurrency & Queue Dynamics

#### REL-006: Maximum Concurrency Ceiling ($\le 5$)
- **Level**: UNIT
- **Component**: `services/scheduler.ts`
- **Required Setup**: 12 registered endpoints.
- **Test Doubles**:
  - `listEndpoints` returns 12 mock endpoints.
  - `runCheck` wrapped with an active concurrency counter and a 30ms artificial delay.
- **What Must Remain Real**: Scheduler worker pool sizing (`Math.min(5, 12)`), worker while loop, queue index incrementing.
- **Execution Steps**:
  1. Define `activeCount = 0`, `maxObserved = 0`, `processedIds = new Set<number>()`.
  2. In `runCheck`:
     ```typescript
     activeCount++;
     maxObserved = Math.max(maxObserved, activeCount);
     processedIds.add(id);
     await new Promise((r) => setTimeout(r, 30));
     activeCount--;
     return makeSuccessResult('up', id);
     ```
  3. Invoke `await runScheduledChecks()`.
- **Expected Result**:
  - `maxObserved <= 5` (strictly never exceeds `MAX_CONCURRENCY`).
  - `processedIds.size === 12` (every endpoint processed).
  - No ID visited more than once.
  - `summary.succeeded === 12`.
- **Database Side Effects**: N/A (unit level).
- **Evidence**: `maxObserved` integer logged and asserted.
- **Cleanup**: None.

#### REL-007: Sliding Worker Queue Behavior
- **Level**: UNIT
- **Component**: `services/scheduler.ts`
- **Required Setup**: 7 registered endpoints:
  - Endpoints 1 to 4: Slow (100ms).
  - Endpoint 5: Ultra-fast (10ms).
  - Endpoint 6 & 7: Normal (50ms).
- **Test Doubles**: Staggered delays in `runCheck`.
- **What Must Remain Real**: Worker-pull loop logic (`while (queueIndex < length)`).
- **Execution Steps**:
  1. Record timestamp when Endpoint 5 completes ($t_{5\text{done}}$).
  2. Record timestamp when Endpoint 6 starts ($t_{6\text{start}}$).
  3. Record timestamp when Endpoint 1 completes ($t_{1\text{done}}$).
  4. Invoke `runScheduledChecks()`.
- **Expected Result**:
  - $t_{6\text{start}} < t_{1\text{done}}$: Endpoint 6 began processing immediately when Worker 5 became free, without waiting for Workers 1–4 to finish.
  - Total endpoints attempted = 7.
- **Evidence**: Timing logs proving out-of-order completion and dynamic worker consumption.
- **Cleanup**: None.

---

### Test Group 5: Target Failure Isolation

#### REL-008: Target HTTP Timeout Isolation
- **Level**: INTEGRATION
- **Component**: `services/scheduler.ts` + `services/monitor.ts` + `services/checker.ts` + PostgreSQL
- **Required Setup**: 2 registered endpoints: Endpoint 1 points to loopback `/up`; Endpoint 2 points to loopback `/timeout` (configured probe timeout 300ms; loopback delays 3000ms).
- **Test Doubles**: None. Real AbortController enforces probe timeout.
- **What Must Remain Real**: Full scheduler orchestration, `checker.ts` timeout classification, database write.
- **Execution Steps**:
  1. Trigger `runScheduledChecks()`.
- **Expected Result**:
  - Endpoint 2 returns `status: 'down'`, `errorType: 'timeout'`, `outcome: 'completed'`.
  - Endpoint 1 completes with `status: 'up'`.
  - `summary.succeeded === 2`, `summary.failed === 0`.
- **Database Side Effects**: 2 rows in `checks`:
  - Endpoint 1 row: `status === 'up'`, `success === true`.
  - Endpoint 2 row: `status === 'down'`, `success === false`, `error_type === 'timeout'`.
- **Evidence**: Summary + persisted check rows.
- **Cleanup**: Delete test endpoints.

#### REL-009: Target DNS Failure Isolation (Deterministic In-Process Injection)
- **Level**: INTEGRATION
- **Component**: `services/scheduler.ts` + `services/monitor.ts` + `services/checker.ts` + PostgreSQL
- **Required Setup**: 2 registered endpoints: Endpoint 1 points to loopback `/up`; Endpoint 2 points to `http://127.0.0.1:<port>/dns-failure`.
- **Test Doubles / Failure Injection**:
  - **Zero public Internet dependency**. Does not use an external domain.
  - Intercept fetch for the designated test URL to reject with a Node.js `FetchError` / `TypeError`: `{ code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND mock.internal' }`.
- **Context & Verification Goal**:
  - Note: Authoritative DNS parsing/mapping is already verified in `services/checker.test.ts`.
  - The purpose of `REL-009` is strictly to verify that when `checker.ts` encounters a DNS error, the scheduler isolates it, records `status: 'down'`, persists the row with `error_type: 'dns'`, and continues uninterrupted.
- **Expected Result**:
  - Endpoint 2 returns `status: 'down'`, `errorType: 'dns'`, `outcome: 'completed'`.
  - Endpoint 1 completes with `status: 'up'`.
  - `summary.succeeded === 2`, `summary.failed === 0`.
- **Database Side Effects**: 2 rows in `checks`:
  - Endpoint 1 row: `status === 'up'`, `success === true`.
  - Endpoint 2 row: `status === 'down'`, `success === false`, `error_type === 'dns'`.
- **Evidence**: Check rows showing `error_type = 'dns'`.
- **Cleanup**: Delete test endpoints.

#### REL-010: Target HTTP 4xx & 5xx Isolation
- **Level**: INTEGRATION
- **Component**: `services/scheduler.ts` + `services/monitor.ts` + `services/checker.ts` + PostgreSQL
- **Required Setup**: 4 endpoints pointing to loopback: `/up`, `/status-400`, `/status-404`, `/status-502`.
- **Test Doubles**: None. Local HTTP server returns 200, 400, 404, 502.
- **Execution Steps**:
  1. Trigger `runScheduledChecks()`.
- **Expected Result**:
  - Endpoint `/up` -> `status: 'up'`, `success: true`.
  - Endpoints 400, 404, 502 -> `status: 'down'`, `success: false`, `errorType: 'http'`.
  - All 4 outcomes are `'completed'`.
  - `summary.succeeded === 4`, `summary.failed === 0`.
- **Database Side Effects**: 4 rows persisted with respective `status_code` values (200, 400, 404, 502).
- **Evidence**: Summary results array + 4 check rows.
- **Cleanup**: Delete test endpoints.

---

### Test Group 6: Infrastructure Failure & Error Boundaries

#### REL-011: Endpoint List / Database Query Crash
- **Level**: ROUTE / BOUNDARY
- **Component**: `app/api/cron/check/route.ts` -> `services/scheduler.ts`
- **Required Setup**: `listEndpoints()` throws `new Error('DB Connection Terminated')`.
- **Test Doubles**: Mock `listEndpoints` to reject.
- **What Must Remain Real**: Route handler try/catch, error logging, `finally` execution guard release.
- **Input**: `POST /api/cron/check` with valid bearer secret.
- **Execution Steps**:
  1. Call route handler.
- **Expected Result**:
  - Route catches error and returns HTTP 500.
  - Response body: `{ error: 'Internal server error' }` (no stack trace leaked).
  - `isExecutionActive()` is `false` (guard was released in `finally`).
  - Next immediate request can acquire guard.
- **Database Side Effects**: Zero rows inserted.
- **Evidence**: HTTP 500 status + `isExecutionActive() === false`.
- **Cleanup**: `resetExecutionGuard()`.

#### REL-012: Persistence Crash on Single Endpoint
- **Level**: UNIT
- **Component**: `services/scheduler.ts`
- **Required Setup**: 3 endpoints. For Endpoint 2, `runCheck()` throws `new Error('PostgreSQL write failed: disk full')`.
- **Test Doubles**: `runCheck` rejects on ID 2, resolves normally on IDs 1 and 3.
- **What Must Remain Real**: Scheduler try/catch wrapping `runCheck`, `results.push` of error outcome, continuation of remaining workers.
- **Execution Steps**:
  1. Execute `await runScheduledChecks()`.
- **Expected Result**:
  - Scheduler does NOT crash; it catches the error for Endpoint 2.
  - Endpoint 1: `outcome: 'completed'`, `status: 'up'`.
  - Endpoint 2: `outcome: 'error'`, `status: null`, `error: 'PostgreSQL write failed: disk full'`.
  - Endpoint 3: `outcome: 'completed'`, `status: 'up'`.
  - `summary.totalEndpoints === 3`
  - `summary.attempted === 3`
  - `summary.succeeded === 2`
  - `summary.failed === 1`
- **Database Side Effects**: N/A (unit level).
- **Evidence**: Summary showing `succeeded: 2, failed: 1` and error message captured in `results[1]`.
- **Cleanup**: None.

#### REL-013: Endpoint Deleted Mid-Run (ENDPOINT_NOT_FOUND)
- **Level**: UNIT
- **Component**: `services/scheduler.ts`
- **Required Setup**: 2 endpoints. Endpoint 2 was deleted from DB between `listEndpoints()` and worker execution.
- **Test Doubles**: `runCheck(2)` resolves with `{ ok: false, success: false, error: 'ENDPOINT_NOT_FOUND', message: 'Endpoint with ID 2 not found' }`.
- **What Must Remain Real**: Scheduler `processEndpointResult` handling of `RunCheckNotFound`.
- **Execution Steps**:
  1. Execute `await runScheduledChecks()`.
- **Expected Result**:
  - Endpoint 2 recorded with `outcome: 'error'`, `status: null`, `error: 'Endpoint with ID 2 not found'`.
  - `summary.succeeded === 1`, `summary.failed === 1`.
  - Run completes cleanly.
- **Evidence**: Summary results array.
- **Cleanup**: None.

---

### Test Group 7: Authentication & Gatekeeping

#### REL-014: Missing Authorization Header
- **Level**: ROUTE / BOUNDARY
- **Component**: `app/api/cron/check/route.ts`
- **Required Setup**: `process.env.CRON_SECRET = 'valid-secret'`.
- **Input**: Request with NO `Authorization` header.
- **Execution Steps**:
  1. Dispatch `POST(new Request('http://localhost:3000/api/cron/check', { method: 'POST' }))`.
- **Expected Result**:
  - HTTP Status: `401 Unauthorized`.
  - Body: `{ error: 'Unauthorized' }`.
  - `runScheduledChecks` was **NOT** called.
  - Execution guard was **NOT** acquired.
- **Evidence**: HTTP 401 response.
- **Cleanup**: None.

#### REL-015: Malformed Authorization Header
- **Level**: ROUTE / BOUNDARY
- **Component**: `app/api/cron/check/route.ts`
- **Required Setup**: `process.env.CRON_SECRET = 'valid-secret'`.
- **Input**: Variants:
  - `Authorization: Basic dXNlcjpwYXNz`
  - `Authorization: Bearer` (no token)
  - `Authorization: Bearer ` (trailing whitespace only)
- **Execution Steps**:
  1. Dispatch `POST` with each header variant.
- **Expected Result**:
  - All variants return HTTP `401 Unauthorized`.
  - Scheduler never called.
- **Evidence**: HTTP 401 responses.
- **Cleanup**: None.

#### REL-016: Incorrect Secret (Length Match & Mismatch)
- **Level**: ROUTE / BOUNDARY
- **Component**: `app/api/cron/check/route.ts`
- **Required Setup**: `process.env.CRON_SECRET = 'correct-token-secret'`.
- **Input**:
  - Variant A: Token with different byte length (`'short'`).
  - Variant B: Token with exact byte length but wrong characters (`'wrong-token-secreX'`).
- **What Must Remain Real**: `crypto.timingSafeEqual` constant-time buffer comparison.
- **Execution Steps**:
  1. Dispatch `POST` with Variant A.
  2. Dispatch `POST` with Variant B.
- **Expected Result**:
  - Both return HTTP `401 Unauthorized` without crashing or throwing length mismatch exceptions.
  - Scheduler never called.
- **Evidence**: HTTP 401 responses.
- **Cleanup**: None.

#### REL-017: Correct Secret Execution
- **Level**: ROUTE / BOUNDARY
- **Component**: `app/api/cron/check/route.ts`
- **Required Setup**: `process.env.CRON_SECRET = 'my-super-secret'`.
- **Input**: `Authorization: Bearer my-super-secret`.
- **Test Doubles**: `runScheduledChecks` resolves mock summary.
- **Execution Steps**:
  1. Dispatch `POST`.
- **Expected Result**:
  - HTTP Status: `200 OK`.
  - Response body contains the scheduler summary.
  - `runScheduledChecks` was called exactly once.
- **Evidence**: HTTP 200 response with summary JSON.
- **Cleanup**: None.

#### REL-018: Unconfigured Server Secret
- **Level**: ROUTE / BOUNDARY
- **Component**: `app/api/cron/check/route.ts`
- **Required Setup**: `delete process.env.CRON_SECRET`.
- **Input**: `POST` with any token.
- **Execution Steps**:
  1. Dispatch `POST`.
- **Expected Result**:
  - HTTP Status: `500 Internal Server Error`.
  - Body: `{ error: 'Internal server error' }` (generic, safe message; does not leak that CRON_SECRET is unconfigured).
  - Scheduler not called.
- **Evidence**: HTTP 500 response.
- **Cleanup**: Restore `process.env.CRON_SECRET`.

---

### Test Group 8: Execution Guard Lifecycle & Overlap

#### REL-019: Overlapping Execution Prevention
- **Level**: ROUTE / BOUNDARY
- **Component**: `app/api/cron/check/route.ts` + `services/scheduler.ts`
- **Required Setup**:
  - `process.env.CRON_SECRET` configured.
  - Real execution guard logic.
  - Mock `runScheduledChecks` configured to delay for 200ms on first run.
- **Execution Steps**:
  1. Send Request 1 (starts execution, acquires guard).
  2. While Request 1 is still in flight, send Request 2 with valid credentials.
  3. Await Request 2 response.
  4. Await Request 1 response.
  5. After both finish, send Request 3.
- **Expected Result**:
  - Request 1 returns HTTP 200 with normal summary.
  - Request 2 returns HTTP 200 with `{ success: true, skipped: true, reason: 'Previous scheduled check run is still active' }`.
  - Request 2 does NOT invoke `runScheduledChecks`.
  - Request 2 does NOT release Request 1's guard prematurely.
  - Request 3 returns HTTP 200 and executes normally (guard was properly released when Request 1 finished).
- **Evidence**: HTTP 200 `skipped: true` JSON payload + subsequent execution success.
- **Cleanup**: `resetExecutionGuard()`.

#### REL-020: Guard Release Guarantee on Fatal Crash
- **Level**: ROUTE / BOUNDARY
- **Component**: `app/api/cron/check/route.ts` + `services/scheduler.ts`
- **Required Setup**:
  - Real execution guard.
  - Mock `runScheduledChecks` set to reject with `new Error('Catastrophic failure')`.
- **Execution Steps**:
  1. Send Request 1 -> throws error.
  2. Verify Request 1 returns HTTP 500.
  3. Verify `isExecutionActive()` is immediately `false`.
  4. Send Request 2 (with `runScheduledChecks` restored to succeed).
- **Expected Result**:
  - Request 2 successfully acquires the guard and returns HTTP 200.
  - The guard is never left permanently locked after an error.
- **Evidence**: Guard state `false` after crash + Request 2 HTTP 200.
- **Cleanup**: `resetExecutionGuard()`.

---

### Test Group 9: Repeated Execution & History Integrity

#### REL-021: Multi-Cycle Sequential Runs (5 Cycles × 3 Endpoints)
- **Level**: INTEGRATION
- **Component**: `services/scheduler.ts` + `services/monitor.ts` + PostgreSQL DB
- **Required Setup**: 3 registered endpoints in test database pointing to loopback server `/up`.
- **Test Doubles**: None. Local HTTP server returns HTTP 200.
- **What Must Remain Real**: Full scheduler orchestration, monitor execution, SQL insertions into `checks`.
- **Execution Steps**:
  1. Record initial check count: $C_0 = \text{count(checks)}$.
  2. Execute Cycle 1: `await runScheduledChecks()`. Assert `succeeded === 3`.
  3. Execute Cycle 2: `await runScheduledChecks()`. Assert `succeeded === 3`.
  4. Execute Cycle 3: `await runScheduledChecks()`. Assert `succeeded === 3`.
  5. Execute Cycle 4: `await runScheduledChecks()`. Assert `succeeded === 3`.
  6. Execute Cycle 5: `await runScheduledChecks()`. Assert `succeeded === 3`.
  7. Query ending check count: $C_5 = \text{count(checks)}$.
- **Expected Result**:
  - $C_5 - C_0 === 15$ ($5 \times 3$ new rows).
  - Each endpoint has exactly 5 new records.
  - Timestamps for each endpoint are monotonically increasing.
  - No check records were updated or overwritten in place.
- **Database Side Effects**: Exactly 15 new rows in `checks`.
- **Evidence**: Database row count query + group by `endpoint_id`.
- **Cleanup**: Clean up test endpoints and cascaded checks.

---

### Test Group 10: Partial Failure Scenarios

#### REL-022: Partial Failure Benchmark Workload
- **Level**: UNIT
- **Component**: `services/scheduler.ts`
- **Required Setup**: 5 registered endpoints:
  - Endpoint 1: Fast HTTP 200 -> Resolves `RunCheckSuccess` (`up`).
  - Endpoint 2: Slow HTTP 200 -> Resolves `RunCheckSuccess` (`degraded`).
  - Endpoint 3: HTTP 500 -> Resolves `RunCheckSuccess` (`down`).
  - Endpoint 4: Database crash -> Throws `new Error('DB Timeout')`.
  - Endpoint 5: Missing target -> Resolves `RunCheckNotFound`.
- **Execution Steps**:
  1. Invoke `const summary = await runScheduledChecks()`.
- **Expected Result**:
  - `summary.totalEndpoints === 5`
  - `summary.attempted === 5`
  - `summary.succeeded === 3` (Endpoints 1, 2, 3 completed monitoring)
  - `summary.failed === 2` (Endpoints 4, 5 suffered operational errors)
  - `summary.results.length === 5`
  - `summary.results[0]`: `{ outcome: 'completed', status: 'up', error: null }`
  - `summary.results[1]`: `{ outcome: 'completed', status: 'degraded', error: null }`
  - `summary.results[2]`: `{ outcome: 'completed', status: 'down', error: null }`
  - `summary.results[3]`: `{ outcome: 'error', status: null, error: 'DB Timeout' }`
  - `summary.results[4]`: `{ outcome: 'error', status: null, error: 'Endpoint with ID 5 not found' }`
- **Evidence**: Full JSON dump of `summary` matching every field.
- **Cleanup**: None.

---

### Test Group 11: Secret & Credential Sanitization

#### REL-023: Zero Secret Leakage in Logs, Errors & Responses
- **Level**: ROUTE / BOUNDARY & UNIT
- **Component**: `app/api/cron/check/route.ts` & `services/scheduler.ts`
- **Required Setup**:
  - Use distinct sentinel secret values:
    - Sentinel Secret: `CRON_SECRET_SENTINEL_xyz789`
    - Sentinel DB URL: `postgresql://sentinel_user:sentinel_pass@db.example.com/testdb`
  - Configure `process.env.CRON_SECRET = 'CRON_SECRET_SENTINEL_xyz789'`.
  - Capture all output streams: `console.log`, `console.error`, `console.warn`, HTTP response text.
- **Execution Steps**:
  1. Dispatch invalid auth requests (missing, bad token, wrong header).
  2. Dispatch request that forces internal 500 error.
  3. Dispatch successful request.
  4. Aggregate all captured log text and response bodies into a single string.
- **Expected Result**:
  - Regex search confirms:
    - `sentinel_pass` does NOT appear anywhere.
    - `CRON_SECRET_SENTINEL_xyz789` does NOT appear in response bodies or client errors.
    - Token values are never echoed back in unauthorized responses.
- **Evidence**: Sanitization assertion result log.
- **Cleanup**: Restore environment and console spies.

---

## 9. Complete Reliability Test Matrix

| Test ID | Name | Level | Component | Setup | Mocks | Real Dependencies | Action | Assertions | DB Assertions | Evidence | Cleanup | Priority |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **REL-001** | Zero Endpoints Handling | UNIT | `scheduler.ts` | 0 endpoints | `listEndpoints`, `runCheck` | Scheduler loop, duration, summary | `runScheduledChecks()` | `total: 0, attempted: 0, succ: 0, fail: 0`, results empty | Delta = 0 | Summary JSON | Reset mocks | Critical |
| **REL-002** | Single Target (UP) | INTEGRATION | `scheduler.ts` + `monitor.ts` + `checker.ts` | 1 endpoint, threshold 500ms | None (Loopback `/up`) | Scheduler, monitor, checker, PostgreSQL | `runScheduledChecks()` | `succ: 1, fail: 0, outcome: 'completed', status: 'up'` | 1 row: `status='up', success=true, code=200, latency_ms <= 500` | Summary + DB row | Delete test endpoint | High |
| **REL-003** | Single Target (DEGRADED) | INTEGRATION | `scheduler.ts` + `monitor.ts` + `checker.ts` | 1 endpoint, threshold 100ms | None (Loopback `/degraded`) | Scheduler, monitor, checker, PostgreSQL | `runScheduledChecks()` | `succ: 1, fail: 0, outcome: 'completed', status: 'degraded'` | 1 row: `status='degraded', success=true, latency_ms > 100` | Summary + DB row | Delete test endpoint | High |
| **REL-004** | Single Target (DOWN) | INTEGRATION | `scheduler.ts` + `monitor.ts` + `checker.ts` | 1 endpoint | None (Loopback `/down`) | Scheduler, monitor, checker, PostgreSQL | `runScheduledChecks()` | `succ: 1, fail: 0, outcome: 'completed', status: 'down'` | 1 row: `status='down', success=false, code=500` | Summary + DB row | Delete test endpoint | High |
| **REL-005** | Multiple Endpoints Mix | INTEGRATION | `scheduler.ts` + `monitor.ts` + `checker.ts` | 3 endpoints (UP, DEG, DOWN) | None (Loopback `/up`, `/degraded`, `/down`) | Scheduler, monitor, checker, PostgreSQL | `runScheduledChecks()` | `total: 3, succ: 3, fail: 0`, all 3 outcomes 'completed' | 3 rows matching respective threshold/status classifications | Summary + 3 DB rows | Delete test endpoints | Critical |
| **REL-006** | Concurrency Ceiling $\le 5$ | UNIT | `scheduler.ts` | 12 endpoints | `listEndpoints`, `runCheck` with 30ms delay & counter | Scheduler worker pool, concurrency limiter | `runScheduledChecks()` | `maxObservedConcurrency <= 5`, all 12 processed once | N/A | Max concurrency value | Reset mocks | Critical |
| **REL-007** | Sliding Worker Queue | UNIT | `scheduler.ts` | 7 endpoints (1 fast, 4 slow, 2 normal) | `runCheck` with staggered delay | Worker-pull while loop | `runScheduledChecks()` | Worker 5 finishes early; next endpoint starts before slow ones finish | N/A | Start/end timestamp log | Reset mocks | High |
| **REL-008** | Target Timeout Isolation | INTEGRATION | `scheduler.ts` + `monitor.ts` + `checker.ts` | 2 endpoints (1 points to loopback `/timeout`) | None (Real AbortController abort) | Scheduler, monitor, checker, PostgreSQL | `runScheduledChecks()` | `succ: 2, fail: 0`, target 2 is `status: 'down'`, target 1 is `status: 'up'` | 1 row with `error_type='timeout'`, 1 row `status='up'` | Summary + DB checks | Delete test endpoints | Critical |
| **REL-009** | Target DNS Failure Isolation | INTEGRATION | `scheduler.ts` + `monitor.ts` + `checker.ts` | 2 endpoints (1 mock DNS reject) | In-process fetch error injection for test URL | Scheduler, monitor, checker, PostgreSQL | `runScheduledChecks()` | `succ: 2, fail: 0`, target 2 is `status: 'down'`, target 1 is `status: 'up'` | 1 row with `error_type='dns'`, 1 row `status='up'` | Summary + DB checks | Delete test endpoints | High |
| **REL-010** | Target HTTP 4xx/5xx Isolation | INTEGRATION | `scheduler.ts` + `monitor.ts` + `checker.ts` | 4 endpoints | None (Loopback `/up`, `/status-400`, `/status-404`, `/status-502`) | Scheduler, monitor, checker, PostgreSQL | `runScheduledChecks()` | `succ: 4, fail: 0`, 4xx/5xx classified `down` | 4 rows with respective `status_code` | Summary + DB checks | Delete test endpoints | High |
| **REL-011** | Endpoint List DB Crash | ROUTE | `route.ts` | Server configured with secret | `listEndpoints` rejects with DB error | Route handler try/catch, guard release | `POST /api/cron/check` | HTTP 500 `{ error: 'Internal server error' }`, guard is released | Delta = 0 | HTTP status + guard check | Reset guard | Critical |
| **REL-012** | Persist Crash Single Target | UNIT | `scheduler.ts` | 3 endpoints | `runCheck` throws DB error for ID 2 | Scheduler try/catch & result push | `runScheduledChecks()` | `total: 3, succ: 2, fail: 1`, ID 2 outcome 'error', others completed | N/A | Summary showing `succ: 2, fail: 1` | Reset mocks | Critical |
| **REL-013** | Endpoint Deleted Mid-Run | UNIT | `scheduler.ts` | 2 endpoints | `runCheck` returns `RunCheckNotFound` for ID 2 | Scheduler outcome evaluation | `runScheduledChecks()` | `succ: 1, fail: 1`, ID 2 outcome 'error', ID 1 completed | N/A | Summary results array | Reset mocks | Medium |
| **REL-014** | Missing Auth Header | ROUTE | `route.ts` | Route with `CRON_SECRET` | None | Route header parsing, 401 response | `POST` without headers | HTTP 401 `{ error: 'Unauthorized' }`, scheduler not called | Delta = 0 | HTTP 401 response | None | Critical |
| **REL-015** | Malformed Auth Header | ROUTE | `route.ts` | Route with `CRON_SECRET` | None | Route header parsing, 401 response | `POST` with `Bearer` (empty token) | HTTP 401 `{ error: 'Unauthorized' }`, scheduler not called | Delta = 0 | HTTP 401 response | None | High |
| **REL-016** | Incorrect Secret | ROUTE | `route.ts` | Route with `CRON_SECRET` | None | `crypto.timingSafeEqual`, 401 response | `POST` with wrong secret (same & diff len) | HTTP 401 `{ error: 'Unauthorized' }`, scheduler not called | Delta = 0 | HTTP 401 response | None | Critical |
| **REL-017** | Correct Secret Execution | ROUTE | `route.ts` | Route with `CRON_SECRET` | `runScheduledChecks` | Route token check, scheduler dispatch | `POST` with `Bearer <CRON_SECRET>` | HTTP 200 OK with summary, scheduler called once | N/A | HTTP 200 response | None | Critical |
| **REL-018** | Unconfigured Server Secret | ROUTE | `route.ts` | Unset `process.env.CRON_SECRET` | None | Route secret validation | `POST` with valid token format | HTTP 500 `{ error: 'Internal server error' }`, no leak | Delta = 0 | HTTP 500 response | Restore env | High |
| **REL-019** | Execution Overlap Guard | ROUTE | `route.ts` + `scheduler.ts` | Route with `CRON_SECRET` | `runScheduledChecks` delayed 200ms | Real execution guard lifecycle | Send Request 2 while Request 1 active | Request 2 returns HTTP 200 `{ skipped: true }`, Request 1 completes | N/A | HTTP 200 skipped JSON | Reset guard | Critical |
| **REL-020** | Guard Release on Crash | ROUTE | `route.ts` + `scheduler.ts` | Route with `CRON_SECRET` | `runScheduledChecks` throws fatal error | Route try/finally guard release | Request 1 throws -> HTTP 500; Send Request 2 | Request 2 acquires guard successfully, returns HTTP 200 | N/A | Subsequent HTTP 200 | Reset guard | Critical |
| **REL-021** | Repeated Execution (5x) | INTEGRATION | `scheduler.ts` + `monitor.ts` + `checker.ts` | 3 registered endpoints | None (Loopback `/up`) | Scheduler, monitor, checker, PostgreSQL | Execute 5 sequential scheduler runs | Each run: `succ: 3, fail: 0`. Monotonic timestamps | Delta = 15 rows ($5 \times 3$) | Row count delta query | Delete test endpoints | Critical |
| **REL-022** | Partial Failure Benchmark | UNIT | `scheduler.ts` | 5 endpoints (UP, DEG, DOWN, INFRA, NOT_FOUND) | `runCheck` mocks for 5 distinct failure types | Scheduler worker aggregation | `runScheduledChecks()` | `total: 5, attempted: 5, succ: 3, fail: 2, results.len: 5` | N/A | Full summary JSON | Reset mocks | Critical |
| **REL-023** | Secret Sanitization | ROUTE / UNIT | `route.ts` & `scheduler.ts` | Sentinel secret values configured | None | All logging and error handlers | Trigger auth failure, 500 error, success | Zero occurrences of sentinel secrets in logs or responses | N/A | Output audit regex log | Restore env | Critical |

---

## 10. Implementation File Plan

The reliability tests will be implemented across exactly three dedicated files, keeping existing test files untouched:

```
services/
├── scheduler.reliability.test.ts             <-- NEW: Unit Reliability (REL-001, 006, 007, 012, 013, 022)
├── scheduler.integration.reliability.test.ts <-- NEW: Integration Reliability (REL-002, 003, 004, 005, 008, 009, 010, 021)
app/
└── api/
    └── cron/
        └── check/
            └── route.reliability.test.ts     <-- NEW: Route/Boundary Reliability (REL-011, 014-020, 023)
```

Existing test files that remain unchanged:
- `services/scheduler.test.ts`
- `app/api/cron/check/route.test.ts`
- `services/monitor.test.ts`
- `services/checker.test.ts`
- `services/endpoints.test.ts`
- `app/api/endpoints/endpoints.test.ts`

---

## 11. Phase 7D Implementation Acceptance Criteria

The implementation phase will be considered complete when all of the following conditions are verified:

1. **Test Execution**:
   - All 23 reliability tests (`REL-001` through `REL-023`) are implemented and passing cleanly.
   - The command `npm test` executes all existing 130 unit tests plus all new reliability tests with **100% pass rate**.
2. **Concurrency Compliance**:
   - Concurrency invariant `activeChecks <= 5` is empirically asserted and passes in test runs.
3. **Fault Isolation**:
   - Target HTTP errors (timeout, DNS, 4xx, 5xx) produce `status: 'down'`, increment `succeeded`, and never crash the scheduler loop.
   - Infrastructure database write failures produce `outcome: 'error'`, increment `failed`, and do not halt remaining endpoints.
4. **Security Verification**:
   - Constant-time secret comparison and rejection of unauthorized requests confirmed.
   - Audit verifies zero occurrences of `CRON_SECRET` or `DATABASE_URL` in test logs or response bodies.
5. **Persistence Integrity**:
   - Database checks show $\Delta \text{count} == \text{succeeded}$ with accurate schema fields (`latency_ms`, `status_code`, `status`, `error_type`).
6. **Codebase Zero-Mutation**:
   - Zero changes to production application code (`services/`, `app/`, `components/`).
   - Zero changes to database schema or migrations (`db/schema.ts`, `drizzle/`).
   - Zero changes to dependencies (`package.json`, `package-lock.json`).
   - Clean production build: `npm run build` exits with code 0.
