# PulseCheck Deployment-Compatible Verification Specification

## 1. Document Status

- **Phase**: 7E-D-B
- **Status**: Specification Only
- **Role**: Authoritative Implementation Specification for Deployment-Compatible Verification
- **Author**: Senior Staff Software Engineer & Reliability Test Architect
- **Predecessor Document**: [`docs/DEPLOYMENT_VERIFICATION_DESIGN.md`](file:///d:/Pulse_Health/docs/DEPLOYMENT_VERIFICATION_DESIGN.md)
- **Successor Phases**:
  - Phase 7E-D-C — Verification Implementation
  - Phase 7E-D-D — Final Verification & Evidence Audit

---

## 2. Purpose

This document translates the approved verification design into an exact, unambiguous implementation specification. It specifies test file ownership, mocking boundaries, empirical concurrency measurement methods, database assertions, security checks, and pass/fail rules so that another engineer can implement the verification suite in Phase 7E-D-C without making architectural decisions independently.

---

## 3. Relationship to Phase 7E-D-A

```
Phase 7E-D-A (Design): docs/DEPLOYMENT_VERIFICATION_DESIGN.md
       ↓ (Formalized into concrete test cases, matrices, and assertions)
Phase 7E-D-B (Specification): docs/DEPLOYMENT_VERIFICATION_SPEC.md [THIS DOCUMENT]
       ↓ (Implements the specified test files without touching production code)
Phase 7E-D-C (Implementation): Test creation & test execution
       ↓ (Audits results, full suite, build, and Git hygiene)
Phase 7E-D-D (Final Verification): Evidence sign-off
```

---

## 4. Scope

This specification strictly governs:
1. Creation of three new deployment verification test files.
2. Ingress HTTP route verification (`POST /api/cron/check`) over Web API Request/Response models.
3. Cryptographic authentication testing (`CRON_SECRET`, `crypto.timingSafeEqual`, byte-length guards, fail-closed handling).
4. Process-local execution guard verification across all lifecycle states (`acquire`, `release`, `finally`).
5. Empirical measurement of the `MAX_CONCURRENCY = 5` ceiling and sliding worker queue behavior under queue overload.
6. Target failure classification (`status: down`, `errorType: http/timeout/dns`) vs. infrastructure failure handling.
7. Database persistence verification against real PostgreSQL, enforcing the row delta invariant ($\Delta \text{checks} === \text{summary.succeeded}$).
8. Multi-cycle sequential runs validating monotonic timestamp accumulation and zero state mutation.
9. Credential scrubbing and information leakage prevention.
10. Static configuration and production build verification.

---

## 5. Non-Goals

The following actions are **strictly forbidden** in Phase 7E-D-C:
- Modifying production application code (`services/`, `app/`, `components/`).
- Modifying database schema (`db/schema.ts`) or generating migrations.
- Adding dependencies to `package.json` (no Redis, Kafka, BullMQ, Redlock, or logging libraries).
- Rewriting or weakening existing Phase 7D reliability tests.
- Implementing in-process timers (`setInterval`, `node-cron`).
- Implementing distributed locks or PostgreSQL advisory locks.
- Adding cloud provider deployment configurations (Vercel, AWS, GCP).

---

## 6. Existing Baseline

The existing system baseline must remain completely green and unaffected:
- **Baseline Test Count**: **156 tests** passing across **10 test files**.
  - `services/scheduler.test.ts` (14 tests)
  - `services/scheduler.reliability.test.ts` (6 tests: REL-001, REL-006, REL-007, REL-012, REL-013, REL-022)
  - `services/scheduler.integration.reliability.test.ts` (8 tests: REL-002–REL-005, REL-008–REL-010, REL-021)
  - `app/api/cron/check/route.test.ts` (7 tests)
  - `app/api/cron/check/route.reliability.test.ts` (12 tests: REL-011, REL-014–REL-020, REL-023)
  - Domain suites: `checker.test.ts` (9 tests), `monitor.test.ts` (22 tests), `endpoints.test.ts` (36 tests), `metrics.test.ts` (42 tests).
- **TypeScript**: `npx tsc --noEmit` exits 0 (0 errors).
- **Linter**: `npm run lint` exits 0 (0 errors, 0 warnings).
- **Production Build**: `npm run build` exits 0, confirming `ƒ /api/cron/check`.

*Rule: Phase 7E-D-C tests are purely additive. All 156 existing tests must remain passing.*

---

## 7. Verification Levels

| Level | Name | Scope | Execution Method |
| :---: | :--- | :--- | :--- |
| **1** | Static Verification | Source code, config, environment contracts | AST/file inspection in `services/deployment.static.test.ts` |
| **2** | Route & Ingress Verification | HTTP status, headers, auth, guard, payload schemas | Route test suite in `app/api/cron/check/route.deployment.test.ts` |
| **3** | Integration Verification | Real PostgreSQL, worker pool, concurrency, persistence | Integration suite in `services/scheduler.deployment.integration.test.ts` |
| **4** | Build & Packaging Verification | Next.js App Router dynamic route compilation | CLI command: `npm run build` |

---

## 8. Test Files & Test Ownership

Phase 7E-D-C shall create **exactly three** new test files:

### File 1: `services/deployment.static.test.ts`
- **Ownership**: Level 1 Static Invariants.
- **Coverage**: Verification of route exports, environment configuration, absence of in-process timers, absence of unapproved queue/lock packages, and `MAX_CONCURRENCY = 5`.

### File 2: `app/api/cron/check/route.deployment.test.ts`
- **Ownership**: Level 2 Route & Ingress Contracts.
- **Coverage**: Authentication test matrix (AUTH-001 through AUTH-008), HTTP transport matrix (HTTP-001 through HTTP-008), execution guard lifecycle (GUARD-001 through GUARD-005), and credential scrubbing.

### File 3: `services/scheduler.deployment.integration.test.ts`
- **Ownership**: Level 3 End-to-End Pipeline & Database Invariants.
- **Coverage**: Empirical concurrency saturation (CONC-001), target vs. infrastructure failure isolation (TARGET-001 through TARGET-005, INFRA-001 through INFRA-003), PostgreSQL row delta tracking ($\Delta \text{checks} === \text{succeeded}$), and multi-cycle sequential persistence (CYCLE-001).

---

## 9. Mocking Boundaries

To maximize realism while maintaining deterministic CI execution, the mocking boundaries are strictly delineated:

### What Must Remain REAL (Unmocked)
- Next.js route handler logic in `app/api/cron/check/route.ts`.
- Orchestrator worker pool, sliding queue, and summary aggregation in `services/scheduler.ts`.
- In-process execution guard (`acquireExecutionGuard`, `releaseExecutionGuard`, `isExecutionActive`).
- Endpoint validation and check insertion in `services/monitor.ts`.
- HTTP probe dispatcher, latency stopwatch, and status classifier in `services/checker.ts`.
- Drizzle ORM query compilation and PostgreSQL connection pool in integration tests.
- Real PostgreSQL `endpoints` and `checks` tables.

### Permitted Mocks
- **In Route Tests (`route.deployment.test.ts`)**: `runScheduledChecks()` may be mocked or controlled to evaluate route-level auth, skip responses, and fatal error handling without hitting downstream databases.
- **In Integration Tests (`scheduler.deployment.integration.test.ts`)**: External target URLs point to a deterministic in-process local Node.js HTTP server (`127.0.0.1:0`). No public Internet calls (`google.com`, `github.com`, etc.) are permitted.
- **Controlled Error Injection**: Ephemeral fetch overrides or mock rejections simulating DNS failure (`ENOTFOUND`) or database write disk-full errors.

---

## 10. Environment Requirements

Deployment verification requires the following environment configuration:
- `DATABASE_URL`: Valid PostgreSQL connection string pointing to the active test database (Neon or local PostgreSQL).
- `CRON_SECRET`: Minimum 32-character high-entropy secret string injected per test suite.
- **Isolation Rule**: Tests modifying `process.env.CRON_SECRET` must snapshot `const originalEnv = { ...process.env };` and restore it in `afterEach()`.
- **Zero Secrets Tracked**: No live connection strings or secrets may be committed to Git.

---

## 11. Test Data & Fixtures

### Local HTTP Target Server (`127.0.0.1:0`)
Integration tests must spawn an ephemeral Node.js `http.Server` bound to `127.0.0.1` on port `0` (system-allocated ephemeral port):

| Route Path | Server Behavior | Intended Test Purpose |
| :--- | :--- | :--- |
| `/up` | Returns HTTP 200 immediately ($< 10\text{ms}$) | Healthy target within latency threshold |
| `/degraded` | Delays $\approx 200\text{ms}$, returns HTTP 200 | Latency exceeds threshold ($100\text{ms}$), classified as `degraded` |
| `/down` | Returns HTTP 500 immediately | Target server error classified as `down` (`errorType: 'http'`) |
| `/status-400` | Returns HTTP 400 immediately | Target client error classified as `down` (`errorType: 'http'`) |
| `/status-404` | Returns HTTP 404 immediately | Target not found classified as `down` (`errorType: 'http'`) |
| `/status-502` | Returns HTTP 502 immediately | Bad gateway classified as `down` (`errorType: 'http'`) |
| `/timeout` | Deliberately keeps socket open, never sends response | Triggers 5s `AbortController` timeout (`errorType: 'timeout'`) |

---

## 12. HTTP Transport Verification Matrix

Implemented in `app/api/cron/check/route.deployment.test.ts`:

| Test ID | Scenario | Request Configuration | Expected HTTP Status | Expected Response Body | Database Expectation | Guard Expectation |
| :--- | :--- | :--- | :---: | :--- | :--- | :--- |
| **HTTP-001** | Valid POST execution | `Authorization: Bearer <valid_secret>` | `200 OK` | `SchedulerRunSummary` with `success: true` | Persists check rows | Acquired and released |
| **HTTP-002** | Unauthorized POST | No `Authorization` header | `401 Unauthorized` | `{ "error": "Unauthorized" }` | 0 rows written | Never acquired |
| **HTTP-003** | Malformed header | `Authorization: Bearer ` (empty) | `401 Unauthorized` | `{ "error": "Unauthorized" }` | 0 rows written | Never acquired |
| **HTTP-004** | Empty endpoint database | `Authorization: Bearer <valid_secret>`, DB has 0 endpoints | `200 OK` | `SchedulerRunSummary` with `totalEndpoints: 0` | 0 rows written | Acquired and released |
| **HTTP-005** | Monitored target HTTP 500 | Valid request, target returns 500 | `200 OK` | Summary with `succeeded: 1`, `failed: 0` | 1 row written (`status: down`) | Acquired and released |
| **HTTP-006** | Monitored target timeout | Valid request, target hangs > 5s | `200 OK` | Summary with `succeeded: 1`, `failed: 0` | 1 row written (`errorType: timeout`)| Acquired and released |
| **HTTP-007** | Overlapping request | Request 2 arrives while Request 1 runs | `200 OK` | `{ "success": true, "skipped": true, "reason": "..." }` | 0 rows from Req 2 | Req 1 guard unreleased |
| **HTTP-008** | Fatal infrastructure failure | `listEndpoints()` throws DB Error | `500 Internal Error` | `{ "error": "Internal server error" }` | 0 rows written | Released in `finally` |

---

## 13. Authentication Verification Matrix

Implemented in `app/api/cron/check/route.deployment.test.ts`:

| Test ID | Condition | Header Sent | Server CRON_SECRET | Expected Status | Guard / Scheduler Invocation |
| :--- | :--- | :--- | :--- | :---: | :---: |
| **AUTH-001** | Missing header | (None) | `secret-token-32-chars-long-12345` | `401` | Not invoked |
| **AUTH-002** | Basic auth scheme | `Basic dXNlcjpwYXNz` | `secret-token-32-chars-long-12345` | `401` | Not invoked |
| **AUTH-003** | Empty Bearer token | `Bearer ` | `secret-token-32-chars-long-12345` | `401` | Not invoked |
| **AUTH-004** | Whitespace Bearer | `Bearer    ` | `secret-token-32-chars-long-12345` | `401` | Not invoked |
| **AUTH-005** | Length mismatch | `Bearer short-token` | `secret-token-32-chars-long-12345` | `401` | Not invoked |
| **AUTH-006** | Equal length, wrong value| `Bearer secret-token-32-chars-long-1234X` | `secret-token-32-chars-long-12345` | `401` | Not invoked |
| **AUTH-007** | Valid token matching | `Bearer secret-token-32-chars-long-12345` | `secret-token-32-chars-long-12345` | `200` | Invoked normally |
| **AUTH-008** | Missing server secret | `Bearer any-token` | `undefined` (deleted from env) | `500` | Not invoked (Fails closed) |

*Assertion Rule: The test must assert that `crypto.timingSafeEqual` is executed without buffer length mismatch exceptions.*

---

## 14. Execution Guard Verification

Implemented in `app/api/cron/check/route.deployment.test.ts`:

### Test Cases
- **GUARD-001 (Acquisition)**: Assert `acquireExecutionGuard()` returns `true` when no run is active; `isExecutionActive()` becomes `true`.
- **GUARD-002 (Overlap Skip)**: When guard is active, second `acquireExecutionGuard()` returns `false`. Route returns HTTP 200 `{ "success": true, "skipped": true, "reason": "Previous scheduled check run is still active" }`.
- **GUARD-003 (Guard Ownership Protection)**: A skipped request does **not** call `releaseExecutionGuard()`. `isExecutionActive()` remains `true` for the in-flight run.
- **GUARD-004 (Release on Completion)**: When the active run finishes, `releaseExecutionGuard()` runs in `finally`. `isExecutionActive()` returns `false`.
- **GUARD-005 (Release on Fatal Rejection)**: When `runScheduledChecks()` throws an unhandled `new Error('Catastrophic failure')`, route catches error, returns HTTP 500, and executes `finally { releaseExecutionGuard(); }`. Subsequent request succeeds.

---

## 15. Scheduler Execution Verification

Implemented in `services/scheduler.deployment.integration.test.ts`:
- **SCHED-001**: Validates `runScheduledChecks()` aggregates:
  - `totalEndpoints`: Exactly matches array count.
  - `attempted`: Exactly matches array count.
  - `succeeded`: Matches count of completed monitoring probes (including target failures).
  - `failed`: Matches count of operational infrastructure failures.
  - `durationMs`: Integer $> 0$.
  - `results`: Complete list of `EndpointCheckOutcome` objects with `endpointId`, `endpointName`, `outcome`, `status`, `error`.

---

## 16. Concurrency Verification (CONC-001)

Implemented in `services/scheduler.deployment.integration.test.ts`:

### Scenario Definition
- Register **12 distinct endpoints** in PostgreSQL or mock list.
- Configured with `MAX_CONCURRENCY = 5`.
- Instrumented with:
  ```typescript
  let activeWorkers = 0;
  let maxObservedConcurrency = 0;
  const processedEndpoints = new Set<number>();
  ```
- Workers execute with asynchronous delay ($\approx 30\text{ms}$).
- Asymmetric delays assigned to demonstrate sliding queue behavior:
  - Endpoints 1–4: 100ms
  - Endpoint 5: 10ms
  - Endpoint 6: 50ms

### Exact Invariant Assertions
1. `maxObservedConcurrency <= 5` at all times during the run.
2. `processedEndpoints.size === 12` (all endpoints evaluated).
3. Every endpoint ID is claimed and processed exactly once.
4. `summary.succeeded === 12`, `summary.failed === 0`.
5. Worker 5 finishes early ($10\text{ms}$) and immediately starts Endpoint 6 ($t_{\text{6,start}} < t_{\text{1,done}}$).

---

## 17. Target Failure Verification

Implemented in `services/scheduler.deployment.integration.test.ts`:

| Test ID | Target Behavior | Expected Status | Expected Error Type | Expected HTTP Status Code | Scheduler Impact | PostgreSQL Check Record |
| :--- | :--- | :---: | :---: | :---: | :--- | :--- |
| **TARGET-001** | Local `/down` returns 500 | `down` | `http` | `500` | `succeeded += 1`, `failed: 0` | Row inserted: `success: false`, `status: down`, `code: 500` |
| **TARGET-002** | Local `/status-404` returns 404 | `down` | `http` | `404` | `succeeded += 1`, `failed: 0` | Row inserted: `success: false`, `status: down`, `code: 404` |
| **TARGET-003** | Local `/timeout` hangs > 5s | `down` | `timeout` | `null` | `succeeded += 1`, `failed: 0` | Row inserted: `success: false`, `status: down`, `code: null` |
| **TARGET-004** | Local `/degraded` delays 200ms | `degraded`| `null` | `200` | `succeeded += 1`, `failed: 0` | Row inserted: `success: true`, `latencyMs > threshold` |
| **TARGET-005** | DNS failure (`ENOTFOUND`) | `down` | `dns` | `null` | `succeeded += 1`, `failed: 0` | Row inserted: `success: false`, `status: down`, `code: null` |

*Contract Invariant: All 5 scenarios count as successful monitoring operations. None of them increments `summary.failed`.*

---

## 18. Infrastructure Failure Verification

Implemented in `services/scheduler.deployment.integration.test.ts` & `app/api/cron/check/route.deployment.test.ts`:

### Test Cases
- **INFRA-001 (Listing Failure)**: Mock `listEndpoints()` to reject with `new Error('PostgreSQL connection terminated')`.
  - Route returns `500 Internal Server Error`.
  - Body: `{ "error": "Internal server error" }`.
  - Guard is released in `finally`.
  - Zero rows inserted in database.
- **INFRA-002 (Persistence Failure on 1 of 3 Targets)**:
  - Target 1: Healthy `/up` $\rightarrow$ succeeds.
  - Target 2: Mock `persistCheckResult` to throw `new Error('Disk full')`.
  - Target 3: Healthy `/up` $\rightarrow$ succeeds.
  - Assert summary: `totalEndpoints: 3`, `attempted: 3`, `succeeded: 2`, `failed: 1`.
  - Target 1 and 3 rows exist in PostgreSQL; Target 2 has no row.
  - Scheduler run completes cleanly without aborting.
- **INFRA-003 (Endpoint Deleted Mid-Run)**:
  - Mock `runCheck(2)` to return `{ ok: false, error: 'ENDPOINT_NOT_FOUND', message: 'Endpoint with ID 2 not found' }`.
  - Target 1 completes normally (`outcome: 'completed'`).
  - Target 2 recorded as `outcome: 'error'`, `error: 'Endpoint with ID 2 not found'`.
  - Summary: `succeeded: 1`, `failed: 1`.

---

## 19. Database Persistence Verification

Implemented in `services/scheduler.deployment.integration.test.ts`:

### Row Delta Integrity
```typescript
const countBefore = await getChecksCount();
const summary = await runScheduledChecks();
const countAfter = await getChecksCount();

expect(countAfter - countBefore).toBe(summary.succeeded);
```

### Exact Column Invariants
For each inserted check row:
- `endpointId`: Valid foreign key referencing `endpoints.id`.
- `checkedAt`: Valid `Date` timestamp.
- `statusCode`: Integer for HTTP responses; `null` for timeouts and network drops.
- `latencyMs`: Measured milliseconds $\ge 0$.
- `success`: Boolean (`true` only for 2xx/3xx within threshold).
- `status`: String enum matching `'up' | 'degraded' | 'down'`.
- `errorType`: String matching `null | 'http' | 'timeout' | 'dns' | 'network'`.
- `errorMessage`: String or `null`.

---

## 20. Repeated-Cycle Verification (CYCLE-001)

Implemented in `services/scheduler.deployment.integration.test.ts`:

### Protocol
1. Register 3 distinct test endpoints pointing to `/up` with URL disambiguation (`/up?c=1`, `/up?c=2`, `/up?c=3`).
2. Record initial row count: $C_0$.
3. Execute `runScheduledChecks()` sequentially for **5 consecutive runs**.
4. Record final row count: $C_5$.

### Required Assertions
1. $C_5 - C_0 === 15$ exactly ($3 \times 5 = 15$).
2. Exactly 5 check rows exist for each endpoint.
3. All 15 check rows have unique primary key `id` values (no overwriting).
4. For each endpoint, `checked_at` timestamps are strictly monotonically increasing ($t_1 < t_2 < t_3 < t_4 < t_5$).
5. Endpoint records in `endpoints` table remain completely unmutated.

---

## 21. Timeout & Execution Budget Verification

Implemented in `services/scheduler.deployment.integration.test.ts`:

### Verification Scenario
- Register 5 endpoints:
  - 4 endpoints pointing to fast `/up` ($< 20\text{ms}$).
  - 1 endpoint pointing to `/timeout` (hangs indefinitely).
- Test runs with Vitest test timeout set to $15,000\text{ms}$.
- Real `AbortController` fires after `DEFAULT_TIMEOUT_MS = 5000ms`.

### Required Assertions
1. Total scheduler duration $\approx 5100\text{ms} - 6000\text{ms}$ (comfortably within the 15s test budget).
2. Succeeded count: 5 (`summary.succeeded === 5`, `summary.failed === 0`).
3. Database contains 4 rows with `status: 'up'` and 1 row with `status: 'down'`, `errorType: 'timeout'`, `statusCode: null`.
4. Fast endpoints finish without waiting for the timed-out endpoint.

---

## 22. Security & Secret Sanitization Verification

Implemented in `app/api/cron/check/route.deployment.test.ts`:

### Sentinel Token Strategy
```typescript
const SENTINEL_SECRET = 'CRON_SECRET_SENTINEL_xyz987_deployment_test';
const SENTINEL_DB_URL = 'postgresql://sentinel_usr:sentinel_pwd@db.example.com/testdb';
```

### Verification Assertions
1. Spies attached to `console.log`, `console.warn`, and `console.error`.
2. Exercise all route endpoints:
   - Valid execution (200)
   - Invalid auth (401)
   - Malformed header (401)
   - Missing secret (500)
   - Internal exception (500)
3. String search across all intercepted console logs:
   - Assert `SENTINEL_SECRET` is never present.
   - Assert `sentinel_pwd` is never present.
4. String search across all HTTP response JSON bodies:
   - Assert `SENTINEL_SECRET` is never present.
   - Assert `sentinel_pwd` is never present.
   - Assert no SQL syntax or database table names are leaked.
5. Invariant: Test assertion code itself must not print secrets to stdout on failure.

---

## 23. Static Invariants Verification

Implemented in `services/deployment.static.test.ts`:

### Assertions
- `app/api/cron/check/route.ts` exports an asynchronous `POST` function and does **not** export `GET`, `PUT`, `DELETE`, or `PATCH`.
- `services/scheduler.ts` exports `const MAX_CONCURRENCY = 5`.
- AST / string inspection confirms zero occurrences of `setInterval` or `node-cron` in `services/` and `app/`.
- `package.json` contains zero dependencies matching `redis`, `bullmq`, `kafka`, `amqp`, `redlock`.
- `.env.example` contains `DATABASE_URL` and `CRON_SECRET` with empty or placeholder values only.
- `.gitignore` contains `.env*.local`.

---

## 24. Cleanup & Test Isolation Requirements

Every integration test file must implement strict isolation hooks:

```typescript
const createdEndpointIds: number[] = [];

beforeEach(() => {
  resetExecutionGuard();
  vi.clearAllMocks();
});

afterEach(async () => {
  resetExecutionGuard();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  
  // Clean up test endpoints in PostgreSQL
  while (createdEndpointIds.length > 0) {
    const id = createdEndpointIds.pop();
    if (id) await deleteEndpoint(id);
  }
});

afterAll(async () => {
  if (localServer) {
    await new Promise<void>((resolve) => localServer.close(() => resolve()));
  }
});
```

---

## 25. Evidence Collection Protocol

During verification execution in Phase 7E-D-C, the test runner must capture and structure evidence into the following schema:

```typescript
interface VerificationEvidence {
  testSuite: string;
  testCaseId: string;
  httpStatus: number | null;
  schedulerSummary: {
    totalEndpoints: number;
    attempted: number;
    succeeded: number;
    failed: number;
    durationMs: number;
  } | null;
  databaseDelta: number;
  maxObservedConcurrency: number;
  guardStateAfter: boolean;
  secretsLeaked: boolean;
  cleanupSuccessful: boolean;
}
```

---

## 26. Traceability Matrix

| Requirement ID | Verification Specification | Test File | Test Case ID | Target Assertion | PASS Criterion |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **VER-STAT-01** | Static Route Export | `services/deployment.static.test.ts` | `STAT-001` | Only `POST` exported | Route exports only POST |
| **VER-STAT-02** | Concurrency Constant | `services/deployment.static.test.ts` | `STAT-002` | `MAX_CONCURRENCY === 5` | Ceiling equals 5 |
| **VER-STAT-03** | No In-Process Schedulers | `services/deployment.static.test.ts` | `STAT-003` | 0 `setInterval` / `node-cron` | 0 occurrences in codebase |
| **VER-STAT-04** | No Queue Dependencies | `services/deployment.static.test.ts` | `STAT-004` | `package.json` inspection | 0 queue/lock dependencies |
| **VER-AUTH-01** | Missing Auth Header | `app/api/cron/check/route.deployment.test.ts` | `AUTH-001` | Status 401 `{ error: 'Unauthorized' }` | Scheduler not called |
| **VER-AUTH-02** | Malformed Header | `app/api/cron/check/route.deployment.test.ts` | `AUTH-002`..`004` | Status 401 | Scheduler not called |
| **VER-AUTH-03** | Timing-Safe Comparison | `app/api/cron/check/route.deployment.test.ts` | `AUTH-005`..`006` | Status 401, no buffer exception | Equal/unequal length rejected |
| **VER-AUTH-04** | Valid Token Acceptance | `app/api/cron/check/route.deployment.test.ts` | `AUTH-007` | Status 200 with summary | Scheduler runs |
| **VER-AUTH-05** | Fail-Closed Missing Secret | `app/api/cron/check/route.deployment.test.ts` | `AUTH-008` | Status 500 `{ error: 'Internal server error' }` | Fails closed |
| **VER-GUARD-01** | Mutual Exclusion Skip | `app/api/cron/check/route.deployment.test.ts` | `GUARD-002` | Status 200 `{ skipped: true }` | Overlapping run skipped |
| **VER-GUARD-02** | Guard Finally Release | `app/api/cron/check/route.deployment.test.ts` | `GUARD-004`..`005` | Guard released after fatal 500 | `isExecutionActive() === false` |
| **VER-CONC-01** | Worker Pool Ceiling $\le 5$ | `services/scheduler.deployment.integration.test.ts`| `CONC-001` | `maxObservedConcurrency <= 5` | Concurrency bounded at 5 |
| **VER-CONC-02** | Sliding Queue Pull | `services/scheduler.deployment.integration.test.ts`| `CONC-001` | Fast worker pulls item 6 early | Asymmetric delay handled |
| **VER-TGT-01** | Target HTTP 500 Isolation | `services/scheduler.deployment.integration.test.ts`| `TARGET-001` | Row inserted, `succeeded += 1` | `status: down`, `http` |
| **VER-TGT-02** | Target Timeout Isolation | `services/scheduler.deployment.integration.test.ts`| `TARGET-003` | Row inserted, `succeeded += 1` | `status: down`, `timeout` |
| **VER-INFRA-01** | DB Listing Failure | `app/api/cron/check/route.deployment.test.ts` | `INFRA-001` | Status 500, guard released | Generic 500 returned |
| **VER-INFRA-02** | Persistence Failure on 1 Target | `services/scheduler.deployment.integration.test.ts`| `INFRA-002` | `succeeded: 2`, `failed: 1` | Healthy persist; error isolated |
| **VER-DB-01** | Row Delta Integrity | `services/scheduler.deployment.integration.test.ts`| `DB-001` | $\Delta \text{checks} === \text{succeeded}$ | Every probe persisted |
| **VER-CYCLE-01** | Multi-Cycle Sequential Telemetry | `services/scheduler.deployment.integration.test.ts`| `CYCLE-001` | 15 rows for 3 targets across 5 runs | Monotonic, distinct IDs |
| **VER-SEC-01** | Zero Credential Leakage | `app/api/cron/check/route.deployment.test.ts` | `SEC-001` | Sentinel scan across logs & body | 0 occurrences found |
| **VER-BUILD-01** | App Router Dynamic Build | `npm run build` | CLI | Exit code 0 | `ƒ /api/cron/check` compiled |

---

## 27. PASS / FAIL Criteria

A verification run is classified as **PASS** if and only if ALL of the following conditions are simultaneously met:

1. **Existing Baseline**: All 156 existing tests pass without regressions (`npm test`).
2. **New Deployment Tests**: All new tests in the 3 specified files pass (100% green).
3. **Static Invariants**: Source AST confirms `MAX_CONCURRENCY = 5`, no `setInterval`, and no queue dependencies.
4. **Build Integrity**: `npm run build` succeeds with exit code 0, compiling `ƒ /api/cron/check`.
5. **Type Safety**: `npx tsc --noEmit` exits 0 with zero errors.
6. **Linting**: `npm run lint` exits 0 with zero warnings and zero errors.
7. **Concurrency Constraint**: In-flight concurrency empirically measured $\le 5$.
8. **Row Delta Invariant**: $\Delta \text{checks} === \text{summary.succeeded}$ holds across all integration runs.
9. **Authentication Gate**: All 8 authentication scenarios pass; timing-safe equality enforced.
10. **Guard Lifecycle**: Overlapping runs yield `{ skipped: true }`; `finally` guarantees guard release.
11. **Telemetry Fidelity**: Target failures (500, timeouts) persist rows and increment `succeeded`.
12. **Credential Sanitization**: Sentinel secrets never appear in logs or responses.
13. **Clean Teardown**: All test endpoints are deleted from PostgreSQL via cascade.
14. **Git Hygiene**: Zero production code modified; zero schema migrations added.

**FAIL Condition**: If any single assertion or invariant fails, the phase is **FAILED**. Partial or "mostly passed" status is strictly disallowed.

---

## 28. Phase 7E-D-C Implementation Checklist

The implementing engineer in Phase 7E-D-C must follow this strict sequence:

- [ ] **Step 1**: Review `docs/DEPLOYMENT_VERIFICATION_SPEC.md` completely.
- [ ] **Step 2**: Create `services/deployment.static.test.ts` implementing `STAT-001` through `STAT-004`.
- [ ] **Step 3**: Create `app/api/cron/check/route.deployment.test.ts` implementing `AUTH-001`..`008`, `GUARD-001`..`005`, `HTTP-001`..`008`, and `SEC-001`.
- [ ] **Step 4**: Create `services/scheduler.deployment.integration.test.ts` implementing `CONC-001`, `TARGET-001`..`005`, `INFRA-001`..`003`, `DB-001`, and `CYCLE-001`.
- [ ] **Step 5**: Run targeted tests:
  - `npx vitest run services/deployment.static.test.ts`
  - `npx vitest run app/api/cron/check/route.deployment.test.ts`
  - `npx vitest run services/scheduler.deployment.integration.test.ts`
- [ ] **Step 6**: Execute full test suite: `npm test`.
- [ ] **Step 7**: Run lint check: `npm run lint`.
- [ ] **Step 8**: Run TypeScript check: `npx tsc --noEmit`.
- [ ] **Step 9**: Run production build: `npm run build`.
- [ ] **Step 10**: Verify `git status --short` and `git diff --stat` to guarantee zero production-code modifications.
- [ ] **Step 11**: STOP and generate implementation report. Do NOT commit.

---

## 29. Phase 7E-D-D Final Verification Checklist

The final verification audit will check:
- [ ] Total test count = $156 + N_{\text{new}}$ passing tests.
- [ ] Production build cleanly serves `ƒ /api/cron/check`.
- [ ] Zero unhandled rejections or open handles in Vitest.
- [ ] PostgreSQL test endpoints completely purged.
- [ ] Zero secrets tracked in Git.
- [ ] Final verification evidence report compiled.
