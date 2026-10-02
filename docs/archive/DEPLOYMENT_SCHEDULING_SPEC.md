# PulseCheck Deployment-Compatible Scheduling Specification

## 1. Document Status

- **Phase**: 7E-B
- **Status**: Specification Only
- **Role**: Implementation Contract for Deployment-Compatible Scheduling
- **Author**: Senior Backend & SRE Engineer
- **Predecessor Document**: [`docs/DEPLOYMENT_SCHEDULING_DESIGN.md`](file:///d:/Pulse_Health/docs/DEPLOYMENT_SCHEDULING_DESIGN.md)
- **Successor Phases**:
  - Phase 7E-C — Implementation
  - Phase 7E-D — Deployment-Compatible Verification

### Relationship & Position
```
docs/DEPLOYMENT_SCHEDULING_DESIGN.md (Approved Architecture)
              ↓
docs/DEPLOYMENT_SCHEDULING_SPEC.md (This Document: Exact Engineering Contract)
              ↓
Phase 7E-C (Minimal Implementation / Configuration Hardening)
              ↓
Phase 7E-D (Deployment-Compatible Verification)
```

### Taxonomy of Statements
Every statement in this specification belongs to exactly one category:
- `[EXISTING BEHAVIOR]`: Verified in current codebase and tests (Phases 7C / 7D).
- `[IMPLEMENTATION WORK]`: Explicit requirement for Phase 7E-C.
- `[DEPLOYMENT ASSUMPTION]`: Operational condition expected from hosting environments.
- `[KNOWN LIMITATION]`: Invariant constraint intentionally preserved in this phase.
- `[FUTURE IMPROVEMENT]`: Post-Phase 7 architectural candidate; strictly out of scope now.

---

## 2. Purpose

The purpose of this specification is to provide a comprehensive, implementation-ready contract for operating PulseCheck's scheduled health monitoring pipeline in real-world deployment environments. Another engineer must be able to verify, configure, or harden the deployment pipeline without making ambiguous architectural decisions independently.

---

## 3. Scope

This specification governs:
1. The ingress contract of `POST /api/cron/check`.
2. Cryptographic authentication via pre-shared `CRON_SECRET` using constant-time comparison.
3. Process-local concurrency control and mutual exclusion via `acquireExecutionGuard()`.
4. Scheduler worker pool execution with bounded concurrency ($C \le 5$).
5. The separation of target health classification from scheduler operational telemetry.
6. The persistence lifecycle into the existing PostgreSQL schema.
7. Explicit failure, retry, budget, and multi-instance operational boundaries.

---

## 4. Non-Goals

The following components and behaviors are **strictly forbidden** from being introduced in Phase 7E:
- `[NON-GOAL]`: In-process background loops (`setInterval`, `setTimeout`, `node-cron`, long-running workers).
- `[NON-GOAL]`: Distributed locking systems (Redis Redlock, ZooKeeper, Consul, Etcd).
- `[NON-GOAL]`: Background message brokers or queues (BullMQ, Kafka, RabbitMQ, Celery, AWS SQS).
- `[NON-GOAL]`: Database schema changes, new tables, or Drizzle migrations.
- `[NON-GOAL]`: Outbound alerting or notification channels (Slack, Discord, PagerDuty, Webhooks, Email).
- `[NON-GOAL]`: Per-endpoint individualized scheduling intervals.
- `[NON-GOAL]`: Automatic in-process retry loops with exponential backoff.
- `[NON-GOAL]`: Provider-specific deployment manifests or vendor lock-in.

---

## 5. Current System Baseline

`[EXISTING BEHAVIOR]`
The codebase contains a fully tested, functional baseline:
- **Baseline Test Suite**: 156 tests passing across 10 test files (`npm test`).
  - Unit Scheduler Suite: `services/scheduler.test.ts` (14 tests) + `services/scheduler.reliability.test.ts` (6 tests).
  - Integration Scheduler Suite: `services/scheduler.integration.reliability.test.ts` (8 tests).
  - Cron Route Suite: `app/api/cron/check/route.test.ts` (7 tests) + `app/api/cron/check/route.reliability.test.ts` (12 tests).
  - Domain Suites: `checker.test.ts` (9 tests), `monitor.test.ts` (22 tests), `endpoints.test.ts` (36 tests), `metrics.test.ts` (42 tests).
- **Core Orchestrator**: [`services/scheduler.ts`](file:///d:/Pulse_Health/services/scheduler.ts)
- **Ingress Route**: [`app/api/cron/check/route.ts`](file:///d:/Pulse_Health/app/api/cron/check/route.ts)
- **Database Engine**: PostgreSQL connected via Drizzle ORM (`db/index.ts`, `db/schema.ts`).
- **Linter & Type Check**: ESLint (0 errors, 0 warnings), TypeScript (`tsc --noEmit`, 0 errors).

---

## 6. Existing Scheduling Architecture

`[EXISTING BEHAVIOR]`
The existing scheduling pipeline executes strictly on-demand when triggered:

```mermaid
flowchart TD
    ExtCron["External Cron Scheduler"] -->|HTTPS POST + Bearer Secret| Route["app/api/cron/check/route.ts"]
    Route --> Step1{"Check CRON_SECRET configured?"}
    Step1 -- No --> Err500["Return 500 Internal Server Error"]
    Step1 -- Yes --> Step2{"Validate Authorization Bearer Token"}
    Step2 -- Invalid/Missing --> Err401["Return 401 Unauthorized"]
    Step2 -- Valid --> Step3{"acquireExecutionGuard()"}
    Step3 -- Already Active --> Skip200["Return 200 OK (skipped: true)"]
    Step3 -- Acquired --> Sched["services/scheduler.ts : runScheduledChecks()"]
    
    subgraph SchedulerExecution ["Worker Pool (MAX_CONCURRENCY = 5)"]
        Sched --> List["services/endpoints.ts : listEndpoints()"]
        List --> Empty{"0 Endpoints?"}
        Empty -- Yes --> EmptySummary["Return 200 Summary (0 attempted)"]
        Empty -- No --> Workers["Sliding Queue Worker Pool (Up to 5 Workers)"]
        Workers --> Monitor["services/monitor.ts : runCheck(endpoint.id)"]
        Monitor --> Checker["services/checker.ts : checkEndpoint()"]
        Checker --> Target["Target External API"]
        Target --> Checker
        Checker --> Persist["services/monitor.ts : persistCheckResult()"]
        Persist --> PostgreSQL[("PostgreSQL: checks table")]
    end

    SchedulerExecution --> Summary["Aggregate SchedulerRunSummary"]
    Summary --> Release["finally: releaseExecutionGuard()"]
    Release --> Resp200["Return 200 OK with SchedulerRunSummary"]
```

---

## 7. Deployment Execution Model

`[DESIGN DECISION]` & `[DEPLOYMENT ASSUMPTION]`
1. **Stateless Compute**: Next.js instances are deployed as stateless HTTP runtimes (e.g., container instances or serverless execution units).
2. **Push-Based Trigger**: Monitoring execution is driven exclusively by an external HTTP push. The application never initiates polling autonomously.
3. **Lifecycle Synchronization**: The lifetime of a scheduled monitoring execution is strictly bound to the lifetime of the incoming HTTP request. The request remains open until all endpoints complete evaluation, are persisted to PostgreSQL, and the summary is returned.

---

## 8. External Scheduler Contract

`[DEPLOYMENT ASSUMPTION]`
An external scheduler (e.g., cron service, cloud scheduler, crontab, runner) must adhere to the following contract:

### Responsibilities of External Scheduler
1. **Trigger Cadence**: Decides the frequency of monitoring (e.g., every 1m, 5m, 10m).
2. **Transport Delivery**: Dispatches an `HTTPS POST` request to `https://<domain>/api/cron/check`.
3. **Credential Provision**: Sends the HTTP header `Authorization: Bearer <CRON_SECRET>`.
4. **Transport Timeout**: The external scheduler must configure a client-side HTTP timeout that comfortably exceeds the execution budget for the expected endpoint workload (see Section 21).
5. **Transport Failure Handling**: If network transmission fails or HTTP 500 is returned, the external scheduler may retry based on its own policies.

### Invariant Boundary
- The external scheduler has **no visibility** into PulseCheck internal concurrency, endpoint IDs, or database state.
- PulseCheck has **no control** over external scheduler availability, clock accuracy, or network routing.

---

## 9. POST /api/cron/check Contract

`[EXISTING BEHAVIOR]`
Defined in [`app/api/cron/check/route.ts`](file:///d:/Pulse_Health/app/api/cron/check/route.ts):

- **Method**: `POST`
- **Path**: `/api/cron/check`
- **Request Headers**:
  - `Authorization`: `Bearer <token>` (Required)
  - `Content-Type`: `application/json` (Optional, body ignored)
- **Request Body**: None required. Any incoming body is safely ignored.

---

## 10. Authentication Contract

`[EXISTING BEHAVIOR]`
1. **Secret Retrieval**: Reads `process.env.CRON_SECRET`.
2. **Header Parsing**:
   ```typescript
   const authHeader = request.headers.get('Authorization');
   if (!authHeader || !authHeader.startsWith('Bearer ')) {
     return Response.json({ error: 'Unauthorized' }, { status: 401 });
   }
   const token = authHeader.slice('Bearer '.length);
   ```
3. **Byte Length Guard**:
   ```typescript
   const expectedBuffer = Buffer.from(cronSecret, 'utf-8');
   const receivedBuffer = Buffer.from(token, 'utf-8');
   if (expectedBuffer.length !== receivedBuffer.length) {
     return Response.json({ error: 'Unauthorized' }, { status: 401 });
   }
   ```
4. **Constant-Time Verification**:
   ```typescript
   if (!timingSafeEqual(expectedBuffer, receivedBuffer)) {
     return Response.json({ error: 'Unauthorized' }, { status: 401 });
   }
   ```
5. **Fail-Closed Guarantee**: If `expectedBuffer.length !== receivedBuffer.length`, rejection occurs before `timingSafeEqual()` can throw a length mismatch exception.

---

## 11. CRON_SECRET Requirements

`[DEPLOYMENT ASSUMPTION]` & `[SECURITY REQUIREMENTS]`
- **Entropy**: Minimum 32 cryptographically random alphanumeric characters (e.g., generated via `openssl rand -hex 32`).
- **Location**: Injected strictly via hosting platform environment secrets.
- **Git Hygiene**: Must never be committed to Git or stored in versioned files (`.env.local` is ignored in `.gitignore`).
- **Zero Leakage Invariant**:
  - Must never appear in stdout/stderr logs.
  - Must never appear in HTTP response bodies or headers.
  - Must never appear in thrown error messages.
  - Must never be persisted to PostgreSQL.

---

## 12. Execution Guard Contract

`[EXISTING BEHAVIOR]`
Defined in [`services/scheduler.ts`](file:///d:/Pulse_Health/services/scheduler.ts#L34-L71):

```typescript
let isRunActive = false;

export function acquireExecutionGuard(): boolean {
  if (isRunActive) return false;
  isRunActive = true;
  return true;
}

export function releaseExecutionGuard(): void {
  isRunActive = false;
}

export function isExecutionActive(): boolean {
  return isRunActive;
}
```

### Invariants
1. **Route Ownership**: The route handler owns the guard lifecycle. `services/scheduler.ts` does NOT acquire or release the guard internally.
2. **Guaranteed Release via Finally**:
   ```typescript
   try {
     const summary = await runScheduledChecks();
     return Response.json(summary, { status: 200 });
   } catch (error) {
     return Response.json({ error: 'Internal server error' }, { status: 500 });
   } finally {
     releaseExecutionGuard();
   }
   ```
3. **Atomic Mutual Exclusion**: In a single Node.js event-loop thread, checking and setting `isRunActive` is synchronous and atomic.
4. **`[KNOWN LIMITATION]`**: The guard is strictly process-local. It does not synchronize state across multiple independent Node.js processes.

---

## 13. Scheduler Execution Contract

`[EXISTING BEHAVIOR]`
Signature:
```typescript
export async function runScheduledChecks(): Promise<SchedulerRunSummary>
```

### Lifecycle Steps
1. **Timestamping**: Captures `startedAt = Date.now()`.
2. **Listing**: Calls `await listEndpoints()`. If `listEndpoints()` throws (e.g., PostgreSQL connection severed), the exception propagates unhandled to the route handler.
3. **Empty Handling**: If `endpointList.length === 0`, returns immediately with:
   ```typescript
   {
     success: true,
     totalEndpoints: 0,
     attempted: 0,
     succeeded: 0,
     failed: 0,
     durationMs: Date.now() - startedAt,
     results: []
   }
   ```
4. **Worker Dispatch**: Instantiates workers up to `MAX_CONCURRENCY = 5`.
5. **Aggregation**: Computes `succeeded = count(outcome === 'completed')`, `failed = count(outcome === 'error')`.

---

## 14. Concurrency Contract

`[EXISTING BEHAVIOR]`
- **Ceiling**:
  ```typescript
  export const MAX_CONCURRENCY = 5;
  ```
- **Pool Size Calculation**:
  ```typescript
  const workerCount = Math.min(MAX_CONCURRENCY, endpointList.length);
  ```
- **Sliding Worker Queue Algorithm**:
  ```typescript
  let queueIndex = 0;
  async function worker(): Promise<void> {
    while (true) {
      const index = queueIndex;
      if (index >= endpointList.length) return;
      queueIndex++;
      const endpoint = endpointList[index];
      // Execute check...
    }
  }
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  ```
- **Invariants**:
  - Exactly $N$ checks are initiated for $N$ endpoints.
  - Active in-flight checks never exceed 5 simultaneously.
  - Fast-responding endpoints yield immediately, allowing their worker to pull the next waiting endpoint without waiting for slower peers.
  - Target failures (500, timeouts) never stall or abort other active workers.

---

## 15. Monitoring Execution Contract

`[EXISTING BEHAVIOR]`
For each endpoint assigned to a worker:
1. Invokes existing [`services/monitor.ts : runCheck(endpoint.id)`](file:///d:/Pulse_Health/services/monitor.ts).
2. `monitor.ts` executes:
   - Queries `endpoints` table by ID. If missing, returns `{ ok: false, error: 'ENDPOINT_NOT_FOUND', message: '...' }`.
   - Calls `services/checker.ts : checkEndpoint(endpoint.url, endpoint.latencyThresholdMs)`.
   - Performs `INSERT INTO checks (...)`.
3. Output mapping:
   - If `result.ok === true` $\rightarrow$ `{ outcome: 'completed', status: result.status, error: null }`.
   - If `result.ok === false` $\rightarrow$ `{ outcome: 'error', status: null, error: result.message }`.
   - If worker throws unhandled exception $\rightarrow$ `{ outcome: 'error', status: null, error: errorMessage }`.

---

## 16. Target Failure Semantics

`[EXISTING BEHAVIOR]` & `[CRITICAL INVARIANT]`
A target failure is defined as an error or anomaly in the monitored external API, including:
- HTTP 4xx (Client Error)
- HTTP 5xx (Server Error)
- Connection timeout (AbortController after 5000ms)
- DNS resolution failure (`ENOTFOUND`, `EAI_AGAIN`)
- TCP connection reset / network unreachable
- High latency exceeding `latencyThresholdMs` (classified as `degraded`)

### Contractual Rules
1. **Target Failure is a Monitoring Success**: The monitoring system succeeded in detecting, measuring, and classifying the target state.
2. **Outcome**: `outcome === 'completed'`.
3. **Status**: `status === 'down'` (or `status === 'degraded'`).
4. **Summary Counter**: Increments `summary.succeeded += 1`.
5. **Database Row**: Exactly one row inserted into the `checks` table recording `success: false`, `status: 'down'`, `statusCode`, and `errorType`.

---

## 17. Infrastructure Failure Semantics

`[EXISTING BEHAVIOR]` & `[CRITICAL INVARIANT]`
An infrastructure failure is an internal failure within PulseCheck or its supporting platform:
- PostgreSQL database unreachable during `listEndpoints()` $\rightarrow$ Request terminates with HTTP 500.
- PostgreSQL disk full or connection dropped during `persistCheckResult()` $\rightarrow$ Worker captures thrown error, sets `outcome = 'error'`, `error = '<message>'`.
- Endpoint deleted from database between `listEndpoints()` and `runCheck()` $\rightarrow$ Worker records `outcome = 'error'`, `error = 'Endpoint with ID X not found'`.
- Missing `CRON_SECRET` configuration $\rightarrow$ Route terminates with HTTP 500.

### Contractual Rules
1. **Infrastructure Failure is an Operational Error**: The monitoring system could not complete its intended telemetry recording.
2. **Outcome**: `outcome === 'error'`, `status === null`.
3. **Summary Counter**: Increments `summary.failed += 1`.
4. **Database Row**: No row inserted for the failed endpoint.
5. **Partial Execution**: One endpoint failing persistence does **not** abort other concurrent workers.

---

## 18. Persistence Contract

`[EXISTING BEHAVIOR]`
- **Target Table**: `checks` table defined in [`db/schema.ts`](file:///d:/Pulse_Health/db/schema.ts).
- **Zero Schema Additions**: No dedicated cron run table, no lock table, no scheduler history table.
- **Append-Only Telemetry**: Completed checks append new rows. No updates or mutations on existing rows.
- **Cascade Behavior**: If an endpoint is deleted, PostgreSQL `ON DELETE CASCADE` automatically removes historical check rows.
- **Database Row Delta Invariant**:
  $$\Delta \text{checks} = \text{summary.succeeded}$$

---

## 19. Response Contract

`[EXISTING BEHAVIOR]`
The endpoint produces strictly typed JSON matching these four schemas:

### A. Completed Run (`200 OK`)
```typescript
interface SchedulerRunSummary {
  success: boolean;            // true
  totalEndpoints: number;     // e.g. 3
  attempted: number;          // e.g. 3
  succeeded: number;          // e.g. 3 (completed probes)
  failed: number;             // e.g. 0 (infrastructure errors)
  durationMs: number;         // Elapsed runtime in ms
  results: Array<{
    endpointId: number;
    endpointName: string;
    outcome: 'completed' | 'error';
    status: 'up' | 'degraded' | 'down' | null;
    error: string | null;
  }>;
}
```

### B. Skipped Overlap Run (`200 OK`)
```typescript
interface SkippedRunResponse {
  success: true;
  skipped: true;
  reason: 'Previous scheduled check run is still active';
}
```

### C. Unauthorized (`401 Unauthorized`)
```typescript
interface UnauthorizedResponse {
  error: 'Unauthorized';
}
```

### D. Internal Error (`500 Internal Server Error`)
```typescript
interface InternalErrorResponse {
  error: 'Internal server error';
}
```

---

## 20. HTTP Status Contract

| Condition | Status Code | Content-Type | Body Summary |
| :--- | :---: | :---: | :--- |
| Valid secret, checks executed | `200 OK` | `application/json` | `SchedulerRunSummary` |
| Valid secret, previous run active | `200 OK` | `application/json` | `{ success: true, skipped: true, reason: string }` |
| Valid secret, 0 endpoints | `200 OK` | `application/json` | `SchedulerRunSummary` with 0 attempted |
| Missing `Authorization` header | `401 Unauthorized` | `application/json` | `{ error: 'Unauthorized' }` |
| Header not `Bearer <token>` | `401 Unauthorized` | `application/json` | `{ error: 'Unauthorized' }` |
| Invalid secret value | `401 Unauthorized` | `application/json` | `{ error: 'Unauthorized' }` |
| Server `CRON_SECRET` not set | `500 Internal Server Error` | `application/json` | `{ error: 'Internal server error' }` |
| `listEndpoints()` throws DB error | `500 Internal Server Error` | `application/json` | `{ error: 'Internal server error' }` |
| Unhandled scheduler exception | `500 Internal Server Error` | `application/json` | `{ error: 'Internal server error' }` |

---

## 21. Execution Budget

`[DEPLOYMENT ASSUMPTION]`
The approximate duration of a scheduled run is modeled as:

$$T_{\text{run}} \approx \left\lceil \frac{N}{5} \right\rceil \times \bar{L} + T_{\text{overhead}}$$

Where:
- $N$ = Total registered endpoints
- $\bar{L}$ = Average target probe latency (typically $50\text{ms} - 300\text{ms}$; up to $5000\text{ms}$ on timeout)
- $T_{\text{overhead}}$ = Database query and insertion latency ($\approx 10\text{ms} - 50\text{ms}$)

### Planning Benchmarks
- **10 Healthy Targets ($L \approx 100\text{ms}$)**: $\lceil 10 / 5 \rceil \times 100\text{ms} \approx 200\text{ms} - 400\text{ms}$.
- **10 Targets with 5 Timeouts ($L = 5000\text{ms}$)**: Takes $\approx 5100\text{ms} - 5500\text{ms}$.
- **50 Healthy Targets ($L \approx 100\text{ms}$)**: $\lceil 50 / 5 \rceil \times 100\text{ms} \approx 1000\text{ms} - 1500\text{ms}$.
- **50 Targets with 10 Timeouts**: Takes $\approx 11\text{s} - 13\text{s}$.

*Note: This is an engineering planning approximation, not a provider SLA.*

---

## 22. Timeout Interaction

`[EXISTING BEHAVIOR]` & `[DEPLOYMENT ASSUMPTION]`
Four distinct timeouts govern scheduled execution:

| Layer | Timeout Value | Enforced By | Consequence on Expiry |
| :--- | :--- | :--- | :--- |
| **1. Per-Target Check** | `5,000ms` (default) | `checker.ts` via `AbortController` | Target marked `DOWN`, `errorType: timeout`, persisted, worker continues. |
| **2. Entire Run Execution** | $\sum \text{Batches}$ | Node.js process runtime | Determined by $N$ and target latencies. |
| **3. External HTTP Trigger** | Configured by Scheduler | External Cron Provider | Client-side trigger timeout; request is severed and execution is not guaranteed to continue if runtime terminates on client abort. |
| **4. Hosting Platform Limit** | Platform specific | Deployment Provider | Platform terminates HTTP request context; in-flight execution is halted. |

**Contract Rule**: Deployment configuration must ensure Layer 3 and Layer 4 are strictly greater than the worst-case duration of Layer 2 to avoid premature request termination.

---

## 23. Overlap Behavior

`[EXISTING BEHAVIOR]`
When two requests arrive at the same application process:

```
Timeline:
t = 0s  : Request 1 arrives  ──> Guard ACQUIRED ──> Scheduler starts
t = 2s  : Request 2 arrives  ──> Guard ACTIVE   ──> Skipped (HTTP 200 { skipped: true })
t = 5s  : Request 1 finishes ──> Guard RELEASED ──> Returns HTTP 200 (Summary)
t = 6s  : Request 3 arrives  ──> Guard ACQUIRED ──> Scheduler starts
```

### Properties
1. Request 2 does **not** wait or queue. It returns immediately with HTTP 200.
2. Request 2 does **not** disrupt or abort Request 1.
3. Request 2 does **not** release Request 1's guard.
4. Request 2 is explicitly distinguishable via `"skipped": true`.

---

## 24. Multi-Instance Behavior

`[KNOWN LIMITATION]`
Because `acquireExecutionGuard()` utilizes a process-local variable (`isRunActive`), horizontal multi-instance deployments (e.g., 2+ containers or separate serverless instances behind a load balancer) have independent memory states.

```
Request A ──> [ Load Balancer ] ──> Instance 1 (isRunActive: false -> true)  ──> Executes Run
Request B ──> [ Load Balancer ] ──> Instance 2 (isRunActive: false -> true)  ──> Executes Run Simultaneously
```

### Operational Reality
1. If the external scheduler dispatches concurrent requests, or a retry arrives while an initial run is still active on a different instance, **both instances will execute checks concurrently**.
2. **PostgreSQL Impact**: Both runs will insert check rows. Telemetry remains valid (append-only), but probe frequency temporarily doubles during the overlap.
3. **Deployment Requirement for Phase 7**: The external cron cadence must be spaced sufficiently (e.g., 5-minute interval) so runs finish well before the next scheduled trigger, minimizing overlapping triggers across instances.

---

## 25. Deployment Assumptions

`[DEPLOYMENT ASSUMPTION]`
1. **Node.js Environment**: Node.js $\ge 18.18$ supporting global `fetch`, `crypto.timingSafeEqual`, and ESM/TypeScript.
2. **PostgreSQL**: Neon, Supabase, AWS RDS, or self-hosted PostgreSQL $\ge 14$ accessible over TCP.
3. **HTTPS Ingress**: Production domain routes traffic through TLS termination before reaching Next.js.
4. **Outbound Internet Egress**: The host allows outbound HTTP/HTTPS connections on ports 80 and 443 to probe external targets.

---

## 26. Environment Variable Requirements

`[DEPLOYMENT ASSUMPTION]`
Configured in deployment environment settings:

| Variable | Type | Description | Example / Format |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | String (URI) | PostgreSQL connection string with SSL | `postgresql://user:pass@host:5432/db?sslmode=require` |
| `CRON_SECRET` | String | Shared bearer token for cron authentication | High-entropy 32+ character string |

---

## 27. Security Requirements

`[SECURITY REQUIREMENTS]`
1. **In-Transit Encryption**: All cron traffic must use HTTPS.
2. **Constant-Time Verification**: Prevents token length and character timing leaks.
3. **Fail-Closed Design**: If `CRON_SECRET` is undefined, the endpoint unconditionally returns 500 without evaluating any authentication header.
4. **Information Leakage Prevention**:
   - Internal errors return generic `{ "error": "Internal server error" }`.
   - Never print secrets to stdout/stderr.
   - Never echo authorization tokens in error messages.
5. **Pre-Execution Rejection**: Unauthorized requests are rejected at Step 2 before database queries or guard checks occur.

---

## 28. Logging / Observability Requirements

`[EXISTING BEHAVIOR]`
The scheduler emits structured console logging to stdout/stderr:

- **Run Started**:
  ```text
  Scheduled check run started: <N> endpoints
  ```
- **Run Completed**:
  ```text
  Scheduled check run completed: <N> endpoints, <S> succeeded, <F> failed, <D>ms
  ```
- **Run Skipped**:
  ```text
  Scheduled check run skipped: previous run still active
  ```
- **Endpoint Infrastructure Error**:
  ```text
  Scheduled check failed for endpoint <ID>: <ErrorMessage>
  ```
- **Fatal Error**:
  ```text
  Scheduled check run failed: <ErrorMessage>
  ```

### Forbidden Logging Invariants
- `console.log(process.env.CRON_SECRET)` is strictly forbidden.
- `console.log(authHeader)` is strictly forbidden.
- Database passwords and connection strings must never be logged.

---

## 29. Failure Scenarios

| # | Trigger / Event | Route Response | Persistence Behavior | Scheduler Summary | Recovery Behavior |
| :--- | :--- | :---: | :--- | :--- | :--- |
| 1 | Database has 0 endpoints | `200 OK` | No rows written | `total: 0, attempted: 0, succeeded: 0, failed: 0` | Immediate clean return |
| 2 | All endpoints UP | `200 OK` | $N$ rows written (`status: up`) | `succeeded: N, failed: 0` | Normal completion |
| 3 | Endpoint DEGRADED (slow) | `200 OK` | Row written (`status: degraded`) | `succeeded += 1, failed: 0` | Telemetry captured |
| 4 | Target returns HTTP 500 | `200 OK` | Row written (`status: down`, `http`) | `succeeded += 1, failed: 0` | Telemetry captured |
| 5 | Target times out (> 5s) | `200 OK` | Row written (`status: down`, `timeout`) | `succeeded += 1, failed: 0` | Telemetry captured |
| 6 | Target DNS failure (`ENOTFOUND`) | `200 OK` | Row written (`status: down`, `dns`) | `succeeded += 1, failed: 0` | Telemetry captured |
| 7 | DB fails during `listEndpoints()` | `500 Internal Error` | No rows written | Run not created | Guard released in finally |
| 8 | DB fails during `persistCheckResult()` | `200 OK` | Other endpoints persist | Failed endpoint `outcome: error`, `failed += 1` | Other endpoints finish |
| 9 | Missing Authorization header | `401 Unauthorized` | No rows written | Scheduler not invoked | Guard not acquired |
| 10 | Missing server `CRON_SECRET` | `500 Internal Error` | No rows written | Scheduler not invoked | Fails closed safely |
| 11 | Overlapping trigger on same instance | `200 OK` (`skipped: true`) | No rows written | Scheduler not invoked | Yields to active run |
| 12 | Overlapping trigger on different instance | `200 OK` | Both runs persist | Both runs report summaries | Both runs finish |
| 13 | Uncaught scheduler exception | `500 Internal Error` | Partial rows if any | Exception caught by route | Guard released in finally |

---

## 30. Recovery Expectations

1. **Crash Recovery**: If an instance crashes mid-run, the process terminates and in-memory guard state is reset upon restart. No stale locks remain.
2. **Database Reconnection**: Drizzle / Node PostgreSQL driver recovers pool connections automatically on subsequent cycles.
3. **Guard Self-Healing**: Guaranteed `finally { releaseExecutionGuard(); }` prevents deadlocks even after unhandled rejections.

---

## 31. Deployment Readiness Checklist

Prior to production traffic:
- [ ] `DATABASE_URL` configured with valid credentials and SSL mode.
- [ ] `CRON_SECRET` configured with high-entropy token.
- [ ] Application deployed on HTTPS domain.
- [ ] `POST /api/cron/check` verified reachable.
- [ ] External scheduler job configured to invoke `POST /api/cron/check`.
- [ ] External scheduler configured with `Authorization: Bearer <CRON_SECRET>`.
- [ ] External scheduler timeout set to $\ge 60\text{s}$.
- [ ] Verification test: HTTP 401 on missing secret.
- [ ] Verification test: HTTP 200 on valid secret.
- [ ] Verification test: Database row delta matches `summary.succeeded`.
- [ ] Verification test: Consecutive trigger returns `skipped: true`.

---

## 32. Implementation Checklist for Phase 7E-C

`[IMPLEMENTATION WORK]`
Phase 7E-C will verify and ensure the deployment readiness of the existing codebase:

### Codebase Changes
- [ ] **NO production code changes required** unless a specific deployment incompatibility is discovered.
- [ ] **NO database schema or migration files**.
- [ ] **NO dependency additions in `package.json`**.
- [ ] Ensure `next.config.ts` preserves external route accessibility.

### Verification Deliverables
- [ ] Execute automated test suite: 156/156 tests passing.
- [ ] Verify production Next.js build: `npm run build` exits 0.
- [ ] Verify ESLint and TypeScript checks exit 0.
- [ ] Verify environment documentation in `.env.example`.

---

## 33. Verification Requirements

Phase 7E-C must prove:
1. `npm test` passes with 100% green status (156 tests across 10 files).
2. Production build compiles cleanly with zero warnings or errors.
3. Zero mutations to `db/schema.ts` or migrations.
4. Clean Git working tree with no untracked secrets.

---

## 34. Known Limitations

1. **Process-Local Guard**: Overlap protection is confined to a single Node.js instance.
2. **Global Schedule**: All endpoints share a single global trigger.
3. **No In-App Alerts**: Failures are written to the database; outbound alerts are not dispatched.
4. **Execution Duration Scaling**: Total runtime scales with $\lceil N / 5 \rceil \times \bar{L}$.
5. **No Distributed Locks**: Relies on external scheduler cadence to avoid cross-node collisions.

---

## 35. Future Evolution

Post-Phase 7 architectural considerations:
1. **PostgreSQL Advisory Locks**: Single-query distributed locking (`pg_try_advisory_xact_lock`) for multi-instance coordination without Redis.
2. **Asynchronous Task Queue**: Transitioning endpoint execution to background workers (e.g., pg-boss or BullMQ) to reduce HTTP request duration to $< 50\text{ms}$.
3. **Per-Endpoint Intervals**: Adding `interval_seconds` column to `endpoints` table.
4. **Notification Dispatcher**: Outbound webhooks and PagerDuty integration triggered on check transitions.

---

## 36. Acceptance Criteria

This specification (Phase 7E-B) is accepted and approved when:
1. [x] Accurately reflects the current Phase 7C implementation and Phase 7D reliability tests.
2. [x] Defines the external scheduler responsibilities ("WHEN") vs PulseCheck responsibilities ("WHAT").
3. [x] Formulates the exact 18-step request lifecycle.
4. [x] Explicitly documents the process-local limitation of the execution guard.
5. [x] Details the bounded worker concurrency model ($C \le 5$).
6. [x] Concretely distinguishes target failure vs infrastructure failure.
7. [x] Models the execution budget without inventing artificial provider SLAs.
8. [x] Provides a 13-row comprehensive failure scenario matrix.
9. [x] Details the Phase 7E-C implementation checklist.
10. [x] Requires zero production code modifications, zero schema changes, and zero new dependencies.
