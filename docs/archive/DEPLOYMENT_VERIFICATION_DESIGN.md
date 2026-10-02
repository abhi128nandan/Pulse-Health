# PulseCheck Deployment-Compatible Verification Design

## 1. Document Status

- **Phase**: 7E-D-A
- **Status**: Design Only
- **Role**: Architectural Verification Plan for Deployment-Compatible Scheduling
- **Author**: Senior Staff Software Engineer & Reliability Engineer
- **Predecessor Documents**:
  - [`docs/DEPLOYMENT_SCHEDULING_DESIGN.md`](file:///d:/Pulse_Health/docs/DEPLOYMENT_SCHEDULING_DESIGN.md) — Scheduling Architecture & System Principles
  - [`docs/DEPLOYMENT_SCHEDULING_SPEC.md`](file:///d:/Pulse_Health/docs/DEPLOYMENT_SCHEDULING_SPEC.md) — Deployment Implementation Specification
  - [`docs/RELIABILITY_TESTING_SPEC.md`](file:///d:/Pulse_Health/docs/RELIABILITY_TESTING_SPEC.md) — Authoritative Reliability Test Suite (REL-001 through REL-023)
- **Successor Phase**: Phase 7E-D-B (Deployment Verification Specification)

---

## 2. Objective

The objective of this design is to establish an implementation-ready, rigorous verification strategy to prove that PulseCheck's existing external-cron monitoring pipeline operates correctly, securely, and predictably in deployment-like environments.

The verification exercises the end-to-end architecture:
```
External Scheduler
        ↓ (HTTPS POST + Bearer CRON_SECRET)
POST /api/cron/check
        ↓ (crypto.timingSafeEqual constant-time comparison)
Execution Guard (acquireExecutionGuard)
        ↓
runScheduledChecks()
        ↓
Bounded Worker Pool (MAX_CONCURRENCY = 5)
        ↓
runCheck(endpoint.id)
        ↓
checkEndpoint(url, latencyThresholdMs)
        ↓
PostgreSQL Persistence (checks table)
        ↓
SchedulerRunSummary Aggregation
        ↓
HTTP Response (200 / 401 / 500)
```

This verification does **not** redesign the scheduling architecture. It defines the testing, empirical measurement, database delta tracking, and security auditing required to validate deployment compatibility before conducting actual cloud deployments.

---

## 3. Scope & Non-Goals

### In Scope
- Verification of Next.js App Router dynamic route compilation for `POST /api/cron/check`.
- Cryptographic authentication verification (fail-closed, byte-length guard, constant-time equality).
- Process-local execution guard lifecycle (`acquire`, `release`, `finally` cleanup).
- Empirical measurement of worker pool concurrency ($C \le 5$) under queue saturation.
- Verification of target failure classification (`status: down`, `errorType: http/timeout/dns`) vs. infrastructure operational failures.
- PostgreSQL telemetry persistence integrity and cascading cleanup.
- Multi-cycle sequential runs verifying monotonic timestamp ordering and zero state corruption.
- Security and credential sanitization auditing.

### Strictly Out of Scope (Non-Goals)
- No introduction of distributed locking (Redis, ZooKeeper, Consul, PostgreSQL advisory locks).
- No message queues or worker systems (BullMQ, Kafka, RabbitMQ, Celery).
- No schema alterations, table additions, or Drizzle migrations.
- No in-process background loops (`setInterval`, `node-cron`).
- No provider-specific deployment configurations (Vercel cron, AWS CloudWatch, Google Cloud Scheduler manifests).
- No actual production deployment actions in this phase.

---

## 4. Fundamental Verification Boundaries

To avoid conflating testing environments with live cloud topologies, the verification plan establishes three explicit operational categories:

```
┌─────────────────────────────────┐
│ A. Existing Unit & Reliability  │ Tested in-process using mocked or local loopback servers.
│    Verification (Phases 7C/7D)  │ Proves algorithmic correctness, guard logic, and Drizzle queries.
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ B. Deployment-Compatible        │ Validates the complete pipeline over an active HTTP transport,
│    Verification (Phase 7E-D)    │ testing actual Next.js route handlers, real PostgreSQL,
│                                 │ and simulated external cron triggers.
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│ C. Actual Production Deployment │ The live infrastructure environment (cloud scheduler, DNS,
│    (Post-Phase 7)               │ TLS termination, multi-AZ load balancers, cold starts).
└─────────────────────────────────┘
```

### Critical Architectural Distinctions
1. **Local Verification Proves Application Behavior**: Verifies that the route parser, constant-time authentication, worker queue, and persistence pipelines execute as designed.
2. **Build Verification Proves Route Compilation**: Verifies that Next.js App Router properly discovers, compiles, and optimizes `app/api/cron/check/route.ts` as a server-rendered dynamic endpoint.
3. **Environment Verification Proves Configuration Integrity**: Verifies that `DATABASE_URL` and `CRON_SECRET` are correctly required and documented without secrets committed to Git.
4. **Production Deployment Validates Provider Runtimes**: Only an actual deployment can validate vendor-specific cold starts, regional network routing, and platform-enforced socket timeouts. Local testing validates compliance with the deployment contract, not the cloud provider's SLA.

---

## 5. Multi-Level Verification Hierarchy

The verification plan structures validation into four distinct levels:

### Level 1 — Static Verification
Inspects codebase source files, dependencies, and configuration to guarantee architectural hygiene:
- Verify `app/api/cron/check/route.ts` exports only `POST`.
- Verify `process.env.CRON_SECRET` is accessed without fallback default tokens.
- Verify `services/scheduler.ts` enforces `MAX_CONCURRENCY = 5`.
- Verify zero instances of `setInterval`, `setTimeout` scheduling loops, or `node-cron`.
- Verify `.env.example` documents `DATABASE_URL` and `CRON_SECRET` with generic placeholders.
- Verify `package.json` contains no unauthorized queue or worker dependencies.

### Level 2 — Automated Test Suite Verification
Validates that the existing 156-test suite passes without regression:
- 130 baseline unit/integration tests across `checker`, `monitor`, `endpoints`, `metrics`, and dashboard components.
- 26 authoritative reliability tests (REL-001 through REL-023) across `services/scheduler.reliability.test.ts`, `app/api/cron/check/route.reliability.test.ts`, and `services/scheduler.integration.reliability.test.ts`.

### Level 3 — Production-Build Verification
Validates that the production build succeeds without compilation or type-checking errors:
- `npm run lint` exits 0 (0 ESLint errors, 0 warnings).
- `npx tsc --noEmit` exits 0 (0 TypeScript type errors).
- `npm run build` exits 0, confirming that `ƒ /api/cron/check` is recognized as a dynamic, server-rendered route.

### Level 4 — Deployment-Like HTTP Transport Verification
Exercises `POST /api/cron/check` through a running HTTP server instance, matching real external-cron invocations:
1. Missing `Authorization` header $\rightarrow$ HTTP 401 `{ "error": "Unauthorized" }`.
2. Malformed `Authorization` header (Basic, empty Bearer) $\rightarrow$ HTTP 401.
3. Incorrect token (length mismatch & content mismatch) $\rightarrow$ HTTP 401.
4. Correct token $\rightarrow$ HTTP 200 with full `SchedulerRunSummary`.
5. Missing server `CRON_SECRET` $\rightarrow$ HTTP 500 `{ "error": "Internal server error" }` (fails closed).
6. Empty endpoint database $\rightarrow$ HTTP 200 `{ totalEndpoints: 0, attempted: 0, succeeded: 0, failed: 0 }`.
7. Monitored target HTTP 500 $\rightarrow$ HTTP 200 summary (`succeeded += 1`) + persisted `status: down`, `errorType: http`.
8. Monitored target timeout $\rightarrow$ HTTP 200 summary (`succeeded += 1`) + persisted `status: down`, `errorType: timeout`.
9. Overlapping execution $\rightarrow$ HTTP 200 `{ "success": true, "skipped": true, "reason": "Previous scheduled check run is still active" }`.
10. Unhandled scheduler failure $\rightarrow$ HTTP 500 + execution guard released via `finally`.

---

## 6. Database Verification Strategy

### The Row Delta Invariant
Every scheduled monitoring check executed against PostgreSQL must satisfy the fundamental row delta invariant:

$$\Delta \text{checks} = \text{summary.succeeded}$$

Where:
- $\Delta \text{checks} = \text{Count}(\text{checks after}) - \text{Count}(\text{checks before})$
- Target failures (HTTP 500, timeout, DNS resolution failure) represent completed monitoring operations and **must** insert a check record.
- Infrastructure failures (PostgreSQL connection drops, missing endpoints) fail before or during write, produce no check row, and increment `summary.failed`.

### Field-Level Persistence Assertions
For every inserted row in `checks`, the verification asserts:
- `endpoint_id`: Exactly matches the monitored endpoint's primary key.
- `checked_at`: Valid `Date` timestamp recorded within the test window.
- `status_code`: Exact integer (e.g., 200, 500, 404) or `null` (for timeouts and network errors).
- `latency_ms`: Non-negative integer ($\ge 0$).
- `success`: `true` for 2xx/3xx within threshold; `false` for 4xx/5xx, timeouts, or network failures.
- `status`: Exactly `'up'`, `'degraded'`, or `'down'`.
- `error_type`: Exactly `null`, `'http'`, `'timeout'`, `'dns'`, `'network'`, or `'invalid_url'`.
- `error_message`: Precise descriptive string or `null`.

### Schema Invariance
- Verification explicitly checks that no auxiliary tables (e.g., `scheduler_runs`, `cron_locks`) are introduced.

---

## 7. Concurrency Verification Strategy

### Empirical Measurement of Runtime Concurrency
To prove that concurrency is strictly bounded by `MAX_CONCURRENCY = 5`, the verification plan defines an empirical test using an overloaded queue:

```
Endpoints Queue (12 items): [ E1, E2, E3, E4, E5, E6, E7, E8, E9, E10, E11, E12 ]
Worker Pool (Max 5 Workers):
  Worker 1: Claims E1 (In-flight)
  Worker 2: Claims E2 (In-flight)
  Worker 3: Claims E3 (In-flight)
  Worker 4: Claims E4 (In-flight)
  Worker 5: Claims E5 (In-flight)  ──> Active Concurrency = 5 (Ceiling Reached)

Worker 5 finishes E5 (fast target) ──> Immediately claims E6 (Active Concurrency = 5)
Worker 1 finishes E1 (slow target) ──> Immediately claims E7 (Active Concurrency = 5)
...
All 12 endpoints processed. Max Observed Concurrency = 5.
```

### Concurrency Instrumentation Model
```typescript
let activeChecks = 0;
let maxObservedConcurrency = 0;
const processedEndpointIds = new Set<number>();

// Instrumented mock check probe:
async function instrumentedCheck(id: number) {
  activeChecks++;
  maxObservedConcurrency = Math.max(maxObservedConcurrency, activeChecks);
  processedEndpointIds.add(id);
  
  await delay(30); // Controlled asynchronous execution
  
  activeChecks--;
  return successResult;
}
```

### Empirical Assertions
1. `maxObservedConcurrency <= 5` (never exceeds 5 at any point).
2. `processedEndpointIds.size === 12` (every endpoint is evaluated).
3. Each endpoint is processed exactly once (no duplicates).
4. Sliding queue invariant: A worker finishing early immediately claims the next index ($t_{\text{next,start}} < t_{\text{slow,done}}$).

---

## 8. Execution Guard Verification Strategy

The process-local execution guard must be validated across five operational scenarios:

```
Scenario A: Idle State ─────────► Request 1 Arrives ──► acquireGuard() = true  ──► Executes Run
Scenario B: In-Flight State ────► Request 2 Arrives ──► acquireGuard() = false ──► Skips (200 OK)
Scenario C: Run 1 Finishes ─────► finally Block     ──► releaseGuard()         ──► Guard Idle
Scenario D: Fatal Rejection ────► Scheduler Throws  ──► finally Block         ──► releaseGuard()
Scenario E: Subsequent Request ─► Request 3 Arrives ──► acquireGuard() = true  ──► Executes Normally
```

### Verification Assertions
- In Scenario B, Request 2 returns immediately without invoking `runScheduledChecks()`.
- Request 2 returns HTTP 200 with `"skipped": true` and `"reason": "Previous scheduled check run is still active"`.
- Request 2 does **not** release Request 1's lock.
- In Scenario D, an unhandled scheduler error triggers `finally { releaseExecutionGuard(); }`, ensuring the guard is never permanently locked.
- In Scenario E, a subsequent valid request successfully acquires the guard and runs to completion.

---

## 9. Failure Semantics Verification

The verification design enforces a strict separation between target failures and infrastructure failures:

| Failure Type | Example Event | Expected HTTP Status | Scheduler Counter | Database Impact |
| :--- | :--- | :---: | :--- | :--- |
| **Target Failure** | HTTP 500 Internal Server Error | `200 OK` | `succeeded += 1`, `failed: 0` | Row written (`status: down`, `http`) |
| **Target Failure** | Target HTTP 404 Not Found | `200 OK` | `succeeded += 1`, `failed: 0` | Row written (`status: down`, `http`) |
| **Target Failure** | Probe exceeds 5s timeout | `200 OK` | `succeeded += 1`, `failed: 0` | Row written (`status: down`, `timeout`) |
| **Target Failure** | Target domain DNS failure | `200 OK` | `succeeded += 1`, `failed: 0` | Row written (`status: down`, `dns`) |
| **Target Failure** | Degraded latency (e.g. 450ms > 200ms) | `200 OK` | `succeeded += 1`, `failed: 0` | Row written (`status: degraded`) |
| **Infrastructure** | PostgreSQL down on endpoint list | `500 Internal Error` | Scheduler aborted | No check rows written |
| **Infrastructure** | DB write failure on 1 endpoint | `200 OK` | `succeeded: N-1`, `failed: 1` | Succeeded endpoints persist; failed does not |
| **Infrastructure** | Endpoint deleted mid-flight | `200 OK` | `succeeded: N-1`, `failed: 1` | Succeeded endpoints persist; failed does not |
| **Infrastructure** | Missing `CRON_SECRET` on server | `500 Internal Error` | Scheduler not invoked | No check rows written |

**Verification Rule**: A monitored API endpoint being DOWN is a **successful monitoring observation**. Only internal operational defects increment `summary.failed`.

---

## 10. Authentication Verification Strategy

The verification plan tests every branch of the authentication gate:

### Test Vectors
1. **Missing `Authorization` Header**: Request sent without `Authorization`. Assert HTTP 401 `{ "error": "Unauthorized" }`.
2. **Invalid Scheme**: Request sent with `Authorization: Basic dXNlcjpwYXNz`. Assert HTTP 401.
3. **Empty Bearer**: Request sent with `Authorization: Bearer ` or whitespace only. Assert HTTP 401.
4. **Incorrect Secret (Differing Byte Length)**: Expected token length 32; received token length 16. Assert HTTP 401 without buffer length exceptions.
5. **Incorrect Secret (Identical Byte Length)**: Expected token `secret-token-123456789012345678`; received `secret-token-12345678901234567X`. Assert HTTP 401 via `crypto.timingSafeEqual`.
6. **Valid Secret**: Matches `process.env.CRON_SECRET`. Assert HTTP 200 and scheduler execution.
7. **Missing Server Configuration**: `delete process.env.CRON_SECRET`. Assert HTTP 500 `{ "error": "Internal server error" }`. Fail-closed.

---

## 11. Timeout & Execution Budget Verification

### Mathematical Planning Model
The total duration of a scheduled run across $N$ endpoints with concurrency $C = 5$ is:

$$T_{\text{run}} \approx \left\lceil \frac{N}{5} \right\rceil \times \bar{L} + T_{\text{overhead}}$$

### Three-Tier Timeout Boundary
The verification must explicitly isolate and measure the three distinct timeout tiers:
1. **Per-Target Check Timeout (`5,000ms`)**: Enforced by `checker.ts` using `AbortController`. If a target hangs, it is aborted after 5s and classified as `timeout`.
2. **Scheduler Batch Execution Duration**: Determined by $N$ and target response times. If 5 endpoints time out in parallel, batch duration is $\approx 5.1\text{s}$.
3. **External Cron Client Timeout**: The external HTTP client timeout must exceed the batch execution duration. If the client disconnects prematurely, the hosting platform may terminate the execution context.

**Verification Assertion**: A test suite exercising 5 endpoints with one intentional 5s timeout must cleanly complete within a 15s test timeout budget, correctly recording 4 healthy checks and 1 timeout check.

---

## 12. Multi-Instance Limitation Verification

### Architectural Fact
`acquireExecutionGuard()` operates on an in-memory boolean variable (`let isRunActive = false`) residing in a single Node.js heap.

### Verification Plan
- **In-Process Boundary**: Within a single process, two overlapping requests reliably result in Request 1 executing and Request 2 receiving `{ "skipped": true }`.
- **Multi-Instance Limitation (Documented Invariant)**: In horizontal deployments with multiple independent application containers or serverless instances, Request 1 on Instance A and Request 2 on Instance B will both execute because Instance B has its own independent memory space.
- **Verification Rule**: The verification suite must explicitly document this constraint as an accepted Phase 7 limitation and verify that process-local mutual exclusion functions properly without pretending to offer distributed locking.

---

## 13. Repeated-Cycle Verification Strategy

To guarantee that scheduled execution is fully idempotent and leak-free across multiple cron triggers:

### Scenario Definition
- Create 3 real endpoints pointing to a deterministic local HTTP server (`/up`).
- Execute `runScheduledChecks()` sequentially for **5 consecutive cycles**.

### Database Invariants
1. Initial count: $C_0$. Final count: $C_5$. Assert $C_5 - C_0 = 15$ exactly ($5 \times 3 = 15$).
2. Exactly 5 new rows created for each endpoint.
3. Every row possesses a unique primary key `id`.
4. The `checked_at` timestamps for each endpoint are strictly monotonically increasing ($t_1 < t_2 < t_3 < t_4 < t_5$).
5. No existing check rows are modified or overwritten.
6. Memory and connection pools remain stable across cycles.

---

## 14. Security & Sanitization Verification

The verification design includes automated scanning of all logs and responses for sensitive credentials:

### Sentinel Values
During security testing, inject recognizable sentinel strings:
- `CRON_SECRET_SENTINEL_xyz987`
- `postgresql://sentinel_user:sentinel_password@db.example.com/pulsecheck`

### Verification Assertions
1. **Console Output Inspection**: Spies on `console.log`, `console.error`, and `console.warn` assert that `sentinel_password` and `CRON_SECRET_SENTINEL_xyz987` never appear in stdout/stderr.
2. **Response Body Inspection**: Assert that neither token appears in any HTTP 200, 401, or 500 response payload.
3. **Error Message Inspection**: Thrown internal errors must never leak connection strings or raw SQL syntax to the client.
4. **Repository Hygiene**: Assert that `.env.local` is ignored in `.gitignore` and `.env.example` contains only empty or placeholder values.

---

## 15. Cleanup & Test Isolation Strategy

Every deployment verification test must guarantee complete test isolation:
- **Database Cascade Cleanup**: All test endpoints registered in PostgreSQL must be recorded in an array and deleted in `afterEach()` or `afterAll()` hooks via `deleteEndpoint()`. PostgreSQL's `ON DELETE CASCADE` automatically removes all associated check rows.
- **Local Server Lifecycle**: Ephemeral Node.js HTTP servers (`127.0.0.1:0`) must be closed in `afterAll()`.
- **State Reset**: `resetExecutionGuard()` must run before and after every test case.
- **Environment Restoration**: `process.env` snapshots must be restored after tests modifying `CRON_SECRET`.
- **Mock Cleanup**: Vitest spies and globals (`vi.unstubAllGlobals()`, `vi.clearAllMocks()`) must be cleanly restored.

---

## 16. Observability of Verification Evidence

For every verification run, the test harness must capture and report:

| Evidence Metric | Verification Source | Expected Value |
| :--- | :--- | :--- |
| **HTTP Status Code** | Route response status | 200 (Success/Skip), 401 (Auth), 500 (Fatal) |
| **Response Payload Structure** | JSON body parser | Valid `SchedulerRunSummary` or error object |
| **Total Endpoints Evaluated** | Summary `totalEndpoints` | Matches database query count |
| **Completed Telemetry Checks** | Summary `succeeded` | Matches count of evaluated endpoints |
| **Failed Infrastructure Checks** | Summary `failed` | 0 under normal operation; $> 0$ on DB error |
| **PostgreSQL Row Delta ($\Delta$)** | Database `COUNT(*)` query | $\Delta \text{checks} === \text{summary.succeeded}$ |
| **Maximum Active Concurrency** | In-flight worker counter | $\le 5$ under all queue loads |
| **Guard Overlap Skip** | Route response `skipped` | `true` when overlapping |
| **Execution Duration** | Summary `durationMs` | $> 0\text{ms}$, within execution budget |

---

## 17. Traceability Matrix

| Requirement ID | Requirement Description | Verification Method | Target Evidence | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| **VER-01** | Ingress Route Accessibility | HTTP POST to `/api/cron/check` | HTTP response | Route reachable, accepts POST |
| **VER-02** | Authentication Enforcement | Header inspection & `timingSafeEqual` | Status 401 on bad token | Unauthorized requests rejected |
| **VER-03** | Fail-Closed Secret Config | Unset `CRON_SECRET` test | Status 500 on missing secret | Generic internal error returned |
| **VER-04** | Process-Local Guard | Overlapping request test | Status 200 `{ skipped: true }` | Run skipped, in-flight run protected |
| **VER-05** | Guard Release on Error | Fatal scheduler rejection test | `isExecutionActive() === false` | Finally block releases guard |
| **VER-06** | Concurrency Ceiling $\le 5$ | Queue saturation test (12 targets) | Active worker counter | Max active concurrency $\le 5$ |
| **VER-07** | Sliding Worker Queue | Asymmetric target delays test | Start time of item 6 vs item 1 | Idle worker pulls waiting queue item |
| **VER-08** | Target Failure Isolation | Monitored target returns 500 | Check row with `status: down` | `succeeded += 1`, persisted |
| **VER-09** | Target Timeout Isolation | Monitored target hangs > 5s | Check row with `errorType: timeout` | `succeeded += 1`, persisted |
| **VER-10** | Infrastructure Failure | Database write failure test | Summary `failed += 1` | Error recorded, peers continue |
| **VER-11** | Database Persistence Delta | Integration checks counting | DB row delta vs `succeeded` | $\Delta \text{checks} === \text{succeeded}$ |
| **VER-12** | Multi-Cycle Telemetry | 5 sequential runs across 3 targets | Monotonic timestamps, 15 rows | Monotonic history, distinct rows |
| **VER-13** | Credential Sanitization | Sentinel string search in logs/body | Regex search for sentinels | 0 occurrences of secret/password |
| **VER-14** | Production Build | `npm run build` | Next.js build output | Dynamic route `ƒ /api/cron/check` |

---

## 18. Phase 7E-D-A Exit Criteria

Phase 7E-D-A (Verification Design) is complete and approved when:
1. [x] Multi-level verification strategy (Static, Automated Tests, Build, HTTP Transport) is fully articulated.
2. [x] Database persistence assertions and the row delta invariant ($\Delta \text{checks} === \text{summary.succeeded}$) are established.
3. [x] Empirical measurement of the concurrency ceiling ($C \le 5$) with sliding queue behavior is defined.
4. [x] Execution guard lifecycle and `finally`-based release are specified across all 5 operational scenarios.
5. [x] Target failure vs. infrastructure failure separation is explicitly enforced.
6. [x] Constant-time authentication and fail-closed secret handling are detailed.
7. [x] Timeout tiers and execution budget formulas are specified without inventing provider-specific guarantees.
8. [x] Process-local limitation in multi-instance topologies is transparently documented.
9. [x] Traceability matrix connects all requirements to measurable verification evidence.
10. [x] Zero production code, zero database schemas, and zero dependencies were modified.
