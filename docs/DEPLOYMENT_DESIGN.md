# Phase 10A — Production Deployment Design

**Project:** PulseCheck — API Monitoring & Observability Dashboard  
**Phase:** 10A — Production Deployment Design  
**Status:** **DESIGN COMPLETE**  
**Date:** 2026-10-02  

---

## 1. Objective

The objective of Phase 10A is to establish an exhaustive, implementation-ready production deployment design for PulseCheck. This design specifies how the application will be hosted, connected to persistence, automated via external schedules, secured against unauthorized access, and verified post-deployment.

The design adheres to a strict boundary:
- **Design Only:** No live infrastructure is provisioned, no deployments are executed, and no application or configuration files are modified.
- **Truthful Status:** Clearly distinguishes between what has been **verified** in our local production test harness and what is **architecturally supported/compatible** for cloud hosting.
- **Contract Fidelity:** Reflects exact runtime implementations for API endpoints, authentication mechanisms, database connections, and scheduler concurrency.

---

## 2. Current Architecture

PulseCheck is a Next.js (App Router) full-stack observability application built with TypeScript, Tailwind CSS, Drizzle ORM, and PostgreSQL.

### 2.1 Interactive Web & Manual Check Topology
```
[ User Browser ]
       │
       ▼ (HTTPS)
[ Next.js App Router (UI / Server Components) ]
       │
       ▼ (Fetch API / SWR-style Polling)
[ Next.js API Routes (/api/endpoints/*) ]
       │
       ├──► monitor.ts ──► checker.ts ──► [ Target HTTP/HTTPS API ]
       │                                            │ (Latency, Status, Error)
       │                                            ▼
       └──────────────────────────────────► [ Neon PostgreSQL ]
                                              (endpoints, checks tables)
```

### 2.2 Scheduled Monitoring Topology
```
[ External Scheduler (e.g. GitHub Actions / cron-job.org) ]
       │
       ▼ POST /api/cron/check (Authorization: Bearer CRON_SECRET)
[ Next.js Cron Route Handler (app/api/cron/check/route.ts) ]
       │
       ├─► 1. Verify Server CRON_SECRET (500 if unconfigured)
       ├─► 2. Timing-safe Token Comparison (401 if invalid/missing)
       ├─► 3. Acquire In-Memory Guard (200 { skipped: true } if active)
       │
       ▼
[ Scheduler Engine (services/scheduler.ts) ]
       │
       ├─► List active endpoints from DB
       ├─► Sliding Worker Pool (MAX_CONCURRENCY = 5)
       │      │
       │      ├─► Worker 1 ──► monitor.ts ──► Target API ──► Persist Check
       │      ├─► Worker 2 ──► monitor.ts ──► Target API ──► Persist Check
       │      └─► Worker N (Drains queue)
       │
       ▼
[ Release Execution Guard & Return Aggregate JSON Summary ]
```

---

## 3. Deployment Target Analysis

PulseCheck is designed for standard Node.js/Next.js hosting environments with external PostgreSQL connectivity. The three primary deployment models evaluated are:

| Evaluation Dimension | Vercel (Serverless Next.js) | Generic Node PaaS (Render / Railway / Fly.io) | Traditional VPS / VM (Ubuntu + Systemd) |
| :--- | :--- | :--- | :--- |
| **Runtime Compatibility** | Native Next.js 16 serverless runtime. Zero configuration required for App Router. | Native Node.js 20+ runtime running `next start`. | Native Node.js 20+ runtime behind Nginx reverse proxy. |
| **Next.js Integration** | 100% native (Turbopack, route handlers, asset optimization). | High; standard production build (`npm run build && npm start`). | High; standard production build (`npm run build && npm start`). |
| **Environment Variables** | Native dashboard & CLI secret management; server/client scoping. | Dashboard secret management; injected into process env. | Managed via `.env` file with strict filesystem permissions (`chmod 600`). |
| **Neon PostgreSQL** | Direct SSL connectivity (`neon.tech` with pooled connection strings). | Direct SSL connectivity (`neon.tech` with pooled or direct strings). | Direct SSL connectivity (`neon.tech`). |
| **API Route Support** | Serverless function execution per route invocation. | Persistent Node HTTP server handling incoming requests. | Persistent Node HTTP server handling incoming requests. |
| **Execution Timeouts** | Hobby tier: 10s default (configurable up to 60s on Pro/Fluid compute). | Configurable request timeouts (typically 60s–300s). | Configurable reverse proxy timeouts (e.g., Nginx `proxy_read_timeout 60s`). |
| **Process Model** | Ephemeral serverless containers spun up on-demand. | Single persistent Node.js process (or container replica). | Single persistent Node.js process managed by PM2 or Systemd. |
| **Internal Scheduler (`setInterval`)** | **Incompatible** (processes freeze/sleep when idle; timers are destroyed). | Technically possible, but discouraged due to multi-process or restart drift. | Possible, but couples background scheduler to web server process. |
| **External Cron (`POST /api/cron/check`)** | **100% Native & Optimal**. External ping wakes serverless function, executes run, and exits. | **100% Native & Optimal**. External ping arrives at persistent server. | **100% Native & Optimal**. External ping or local crontab triggers endpoint. |
| **Platform Cost & Maintenance** | Free tier available; zero infrastructure maintenance. | Low-cost PaaS; minimal maintenance. | Low-cost VPS; requires OS patching, TLS renewal, and process monitoring. |

---

## 4. Selected Target for Phase 10B

### Target: **Vercel + Neon PostgreSQL + GitHub Actions / cron-job.org**

### Technical Rationale
1. **Next.js Synergy:** Vercel provides the reference hosting environment for Next.js 16 App Router, ensuring zero edge routing or asset bundling quirks.
2. **Stateless Alignment:** PulseCheck was intentionally architected as a stateless application. By decoupling scheduling from the web server and exposing `POST /api/cron/check`, it perfectly matches Vercel’s serverless function lifecycle.
3. **Database Architecture:** Neon’s serverless PostgreSQL with pooled connections (`-pooler.neon.tech`) pairs seamlessly with Vercel's ephemeral function invocations, preventing connection exhaustion.
4. **Maintenance Overhead:** Eliminates operating system patching, reverse proxy configuration, and TLS certificate renewal (automated SSL via Let's Encrypt / Vercel Edge Network).
5. **Secondary Fallback:** If serverless execution limits (10s on Hobby) constrain check runs with high endpoint counts, Render or Railway serve as drop-in zero-code alternatives using `npm start`.

---

## 5. Production Runtime Requirements

### 5.1 System Specifications
- **Node.js:** `>= 20.x` LTS (Node 20 or Node 22).
- **Package Manager:** `npm >= 10.x`.
- **Operating Environment:** Linux (x86_64 or arm64).
- **Target Architecture:** Serverless Node.js runtime (Vercel) or containerized Node.js.

### 5.2 Build & Execution Lifecycle
1. **Dependency Installation:** `npm ci --omit=dev` (in production runner) or standard build pipeline install.
2. **Database Migration:** `npm run db:migrate` (runs `drizzle-kit migrate` against `DATABASE_URL`).
3. **Production Build:** `npm run build` (invokes `next build` with Turbopack optimization).
4. **Runtime Execution:** `npm start` (on persistent hosts) or serverless handler entrypoint (on Vercel).

### 5.3 Why Internal Schedulers (`setInterval`) are Prohibited
- **Ephemeral Lifecycles:** In modern cloud platforms (especially serverless), web worker processes are terminated or frozen after servicing requests. An in-memory `setInterval` stops firing the moment the server becomes idle.
- **Resource Leaks:** Long-lived timers in Node.js processes can retain heap allocations, causing slow memory leaks and unbounded connection pool growth.
- **Multi-Instance Duplication:** In any environment with horizontal autoscaling or zero-downtime rolling deploys, multiple instances would run competing timers, leading to duplicate probes and database collisions.
- **Stateless Decoupling:** External scheduling ensures monitoring cadence is decoupled from web server availability and code deployments.

---

## 6. Environment Variables & Secret Scoping

The application requires exactly two environment variables in production. Both are strictly server-side:

| Variable | Scope | Required | Purpose | Security Considerations |
| :--- | :--- | :--- | :--- | :--- |
| `DATABASE_URL` | Server Only | **Yes** | Connection string for Neon PostgreSQL database (`postgresql://<user>:<password>@<host>/<dbname>?sslmode=require`). | Must use pooled connection endpoint (`-pooler.neon.tech`). Never commit to Git or expose in client bundles. |
| `CRON_SECRET` | Server Only | **Yes** | High-entropy shared secret (e.g. 64-character hex string) used to authenticate `POST /api/cron/check`. | Enforces fail-closed authorization. Compared in constant time via `crypto.timingSafeEqual()`. |

### Client-Side Leak Prevention
- Neither variable uses the `NEXT_PUBLIC_` prefix required for Next.js client bundling.
- Verified: No references to `process.env.DATABASE_URL` or `process.env.CRON_SECRET` exist in `app/page.tsx` or any file within `components/`.

---

## 7. Database Flow & Schema Management

### 7.1 Connectivity Flow
```
[ Production Next.js Server / Function ]
               │
               ▼
[ db/index.ts (pg.Pool + Drizzle ORM) ]
               │
               ▼ SSL Connection (`sslmode=require`, rejectUnauthorized: false)
[ Neon PostgreSQL Serverless Pooler (-pooler.neon.tech:5432) ]
               │
               ▼
[ PostgreSQL Database (endpoints, checks tables) ]
```

### 7.2 Connection Configuration Invariants
- Direct connection pool created via `pg.Pool`.
- SSL auto-negotiation in `db/index.ts` verifies `connectionString.includes('neon.tech')` or `sslmode=require` and automatically sets `{ rejectUnauthorized: false }` to support Neon certificate chains.
- Uses pooled connection strings in serverless deployments to ensure queries route through PgBouncer, preventing connection limits from being exceeded.

### 7.3 Schema & Migrations
- Production schema definition is defined in `db/schema.ts`.
- Migrations are versioned in `drizzle/0000_dazzling_ezekiel.sql`.
- Migration Execution: Applied before launching the web server using `npm run db:migrate`.
- Database Tables:
  1. `endpoints`: Stores registered target APIs (`id`, `name`, `url`, `latency_threshold_ms`, `created_at`).
  2. `checks`: Stores historical probe results (`id`, `endpoint_id`, `checked_at`, `status_code`, `latency_ms`, `success`, `status`, `error_type`, `error_message`).
  3. Relational Invariant: Foreign key constraint with `ON DELETE CASCADE` ensures deleting an endpoint immediately purges all associated check records.

---

## 8. Manual Health Check Flow

### 8.1 Execution Pipeline
When an operator clicks "Check Now" on the dashboard:
1. **Client Action:** Dashboard issues `POST /api/endpoints/:id/check`.
2. **ID Validation:** Route handler validates numeric ID format (`parseEndpointId`).
3. **Endpoint Resolution:** `services/endpoints.ts` fetches target configuration from PostgreSQL.
4. **Live HTTP Probe:** `services/checker.ts:checkEndpoint()` executes an active HTTP request:
   - Configurable timeout (default 5,000ms).
   - Measures exact wall-clock latency in milliseconds.
   - Evaluates HTTP response status code and compares latency against `latency_threshold_ms`.
   - Classifies outcome: `UP` (2xx and latency $\le$ threshold), `DEGRADED` (2xx but latency > threshold), or `DOWN` (non-2xx, network error, or timeout).
5. **Persistence:** `services/monitor.ts` inserts a new row into the `checks` table.
6. **Response:** Route returns `200 OK` with both the endpoint details and the new check record.
7. **Client Revalidation:** Dashboard state updates immediately, refreshing summary metrics and chart latency points.

### 8.2 Production Verification Evidence
To prove that a manual check is real and functioning in production:
- Returned check contains a real HTTP status code from the external target (e.g., `200`).
- Returned check contains non-zero measured latency (e.g., `142ms`).
- Check timestamp matches the current UTC wall clock (`checked_at`).
- Immediate subsequent query to `GET /api/endpoints/:id/history` contains the newly created check ID.

---

## 9. Scheduled Monitoring (Cron) Flow

### 9.1 Authentication & Concurrency Pipeline
```
1. Inbound Request
   POST https://<production-host>/api/cron/check
   Authorization: Bearer <CRON_SECRET>

2. Server Verification
   ├─ process.env.CRON_SECRET configured?
   │  └─ NO  ──► HTTP 500 { "error": "Internal server error" } (Fail-closed)
   │
   ├─ Header present & starts with 'Bearer '?
   │  └─ NO  ──► HTTP 401 { "error": "Unauthorized" }
   │
   └─ Token matches CRON_SECRET (crypto.timingSafeEqual)?
      └─ NO  ──► HTTP 401 { "error": "Unauthorized" }

3. Overlap Guard (Process-Local Invariant)
   ├─ acquireExecutionGuard()
   │  └─ FALSE (Already running) ──► HTTP 200 { "success": true, "skipped": true }
   │
   └─ TRUE (Acquired) ──► Proceed to step 4

4. Scheduler Execution (services/scheduler.ts)
   ├─ Fetch all registered endpoints via listEndpoints()
   ├─ If empty: return success summary immediately
   └─ Worker Pool (MAX_CONCURRENCY = 5)
      ├─ Dispatches up to 5 simultaneous HTTP probes
      ├─ Sliding queue: as each probe completes, the next endpoint is fetched
      └─ Individual worker errors (target timeouts/500s) are caught and classified as
         monitoring outcomes without crashing the run

5. Completion & Cleanup
   ├─ Aggregate run statistics (total, succeeded, failed, durationMs)
   ├─ releaseExecutionGuard() in `finally` block
   └─ Return HTTP 200 with JSON summary
```

---

## 10. External Cron Scheduling Strategy

PulseCheck relies on an external scheduler to trigger monitoring runs. Two battle-tested, zero-cost options are designed:

### 10.1 Option A: GitHub Actions (Recommended for Engineering Repositories)
- **Mechanism:** Scheduled workflow executing a simple curl command.
- **Workflow Path:** `.github/workflows/pulsecheck-cron.yml`
- **Schedule:** `cron: '*/5 * * * *'` (every 5 minutes).
- **Secrets:** Repository secret `PULSECHECK_CRON_SECRET` and variable `PULSECHECK_URL`.
- **Command:**
  ```bash
  curl -s -S -X POST "${{ secrets.PULSECHECK_URL }}/api/cron/check" \
    -H "Authorization: Bearer ${{ secrets.PULSECHECK_CRON_SECRET }}" \
    --fail-with-body
  ```
- **Strengths:** Fully version-controlled, audit log preserved in GitHub Actions history, manual trigger (`workflow_dispatch`) available.
- **Trade-offs:** GitHub cron execution timing can drift by 2–5 minutes during peak load periods.

### 10.2 Option B: cron-job.org (Recommended for High Frequency / Low Drift)
- **Mechanism:** Specialized external HTTP webhook trigger.
- **Configuration:**
  - URL: `https://<production-host>/api/cron/check`
  - HTTP Method: `POST`
  - Headers: `Authorization: Bearer <CRON_SECRET>`
  - Schedule: User-configured (every 1, 2, or 5 minutes).
  - Timeout: Configured to 30 seconds.
- **Strengths:** Highly accurate timing, automatic email notifications on consecutive HTTP failures.

---

## 11. Production Security Architecture

1. **Transport Encryption:** All production traffic (UI, REST API, cron triggers) must traverse HTTPS with TLS 1.3 enforced by the edge network.
2. **Secret Non-Disclosure:**
   - `CRON_SECRET` and `DATABASE_URL` reside solely in server environment variables.
   - Zero hardcoded tokens or database passwords anywhere in source code or documentation.
3. **Fail-Closed Authorization:**
   - If `CRON_SECRET` is unset on the server, the endpoint aborts with HTTP 500 without evaluating incoming tokens.
   - If the request token length differs from the expected secret, rejection is immediate before buffer comparison.
   - Buffer comparison utilizes `crypto.timingSafeEqual` to eliminate timing side-channel attacks.
4. **Data Isolation & Sanitization:**
   - Database errors log detailed messages to server stdout/stderr for operational debugging, but return sanitized generic messages (`{ "error": "Internal server error" }`) to client callers.
   - Relational cascading prevents orphaned check telemetry upon endpoint deletion.

---

## 12. Production Failure Model

The deployment design strictly separates **Target Failures** (monitored third-party APIs failing) from **Platform / Infrastructure Failures** (PulseCheck system issues):

| Failure Scenario | Failure Category | System Behavior & User Experience | HTTP Status |
| :--- | :--- | :--- | :--- |
| **Target API returns 500** | Target Failure | Probe measures response; classifies check as `DOWN`; persists record to PostgreSQL; dashboard displays red badge. | `200 OK` (Probe successful) |
| **Target API times out (>5s)** | Target Failure | Probe aborts after timeout; classifies check as `DOWN` with `error_type: 'TIMEOUT'`; persists record; dashboard charts latency cliff. | `200 OK` (Probe successful) |
| **Target API DNS resolution failure** | Target Failure | Probe catches `ENOTFOUND`; classifies check as `DOWN` with `error_type: 'DNS_ERROR'`; persists record. | `200 OK` (Probe successful) |
| **Production PostgreSQL unreachable** | Infrastructure Failure | Database query throws error; caught by route try/catch; logged to server console; returns sanitized error. | `500 Internal Server Error` |
| **Missing `CRON_SECRET` on server** | Configuration Failure | Route handler detects missing environment variable; aborts before processing requests; logs configuration alert. | `500 Internal Server Error` |
| **Invalid `Authorization` token** | Security Rejection | Request rejected immediately by token buffer check. | `401 Unauthorized` |
| **Cron Trigger Overlap** | Concurrency Contention | In-memory execution guard detects active run; safely skips current execution; returns informational JSON. | `200 OK` (`skipped: true`) |
| **Scheduler Partial Worker Failure** | Mixed Scenario | Individual failing endpoint records error outcome; remaining workers continue queue processing; summary reflects partial counts. | `200 OK` (Summary returned) |
| **Production Build Failure** | Pipeline Failure | Deployment build command (`npm run build`) fails type checking or bundling; deployment pipeline aborts before publishing. | Build Error (No traffic cutover) |

---

## 13. Production Verification Matrix (DEP-001 – DEP-018)

Every deployed environment must pass this 18-point verification suite before release acceptance:

| ID | Category | Verification Action | Expected Result | Evidence Required |
| :--- | :--- | :--- | :--- | :--- |
| **DEP-001** | Connectivity | Send HTTP GET to public production URL | Returns HTTP 200 OK | Browser / curl status 200 |
| **DEP-002** | Frontend | Load dashboard in browser | Renders header, system overview metrics, endpoint table | Clean render, 0 console errors |
| **DEP-003** | API / Database | Add test endpoint via UI/API (`POST /api/endpoints`) | Returns HTTP 201 Created with endpoint record | New endpoint visible in table |
| **DEP-004** | API / Database | Query `GET /api/endpoints/:id` | Returns HTTP 200 OK with correct schema | Valid JSON payload |
| **DEP-005** | Monitoring | Trigger manual check (`POST /api/endpoints/:id/check`) | Returns HTTP 200 OK with check result | Real status code and latency returned |
| **DEP-006** | Persistence | Verify check persistence in database | New record exists in `checks` table | Timestamp matches execution time |
| **DEP-007** | Metrics | View endpoint metrics card on dashboard | 24h uptime, average latency, and P95 latency displayed | Non-null metric values |
| **DEP-008** | History | Inspect endpoint latency history chart | Recharts SVG renders historical data points | Visual chart and history list populated |
| **DEP-009** | Security | Call `POST /api/cron/check` with no / invalid header | Returns HTTP 401 Unauthorized | `{ "error": "Unauthorized" }` |
| **DEP-010** | Security | Call `POST /api/cron/check` with valid `CRON_SECRET` | Returns HTTP 200 OK with summary JSON | `{ "success": true, "attempted": N }` |
| **DEP-011** | Scheduler | Inspect server logs during cron invocation | Logs show start, worker activity, and completion | Structured log lines in platform console |
| **DEP-012** | Persistence | Verify scheduled checks created records in DB | All active endpoints have new check rows | Sequential IDs created in `checks` table |
| **DEP-013** | Resilience | Register intentionally failing URL (e.g. `httpstat.us/500`) | Status correctly classified as `DOWN` | Table shows red status, server stays healthy |
| **DEP-014** | Resilience | Temporarily revoke DB access in test harness | API returns clean 500 error without leaking stack trace | Sanitized JSON error returned |
| **DEP-015** | Security | Inspect public HTML and JavaScript source bundles | Zero instances of `DATABASE_URL` or `CRON_SECRET` | Static grep on `.next/static` bundles |
| **DEP-016** | Build | Execute `npm run build` in deployment runner | Turbopack compilation completes with exit code 0 | Clean build logs |
| **DEP-017** | Transport | Inspect TLS certificate in browser | Valid TLS 1.3 certificate signed by trusted CA | Padlock icon, HTTPS enforced |
| **DEP-018** | Automation | Wait for external cron schedule trigger (e.g. 5m) | Trigger fires automatically; DB records new check | Timestamp advanced without manual action |

---

## 14. Rollback Strategy

In the event of an operational issue following deployment, the following rapid rollback procedures apply:

1. **Application Code Regression:**
   - **Vercel / Cloud PaaS:** Instant rollback to previous deployment artifact via platform dashboard (instant traffic cutover to previous immutable build).
   - **Git Rollback:** Revert problematic commit and trigger deployment pipeline.
2. **Environment Variable Misconfiguration:**
   - Update variable in platform dashboard (`CRON_SECRET` or `DATABASE_URL`) and trigger immediate redeployment.
3. **Database Migration Issues:**
   - Since Phase 10 introduces zero schema changes, the database schema remains strictly backward compatible with previous releases.
4. **External Cron Failure:**
   - If the external scheduler malfunctions, manual checks via the dashboard remain 100% operational. The external cron workflow can be paused or reconfigured independently without touching application code.

---

## 15. Documentation Updates Planned for Phase 10C

Following successful deployment verification in Phase 10B, documentation will be updated to reflect verified status:

1. **`docs/DEPLOYMENT.md`:**
   - Elevate the selected cloud platform from "Compatible / Designed To Support" to "Verified Deployment".
   - Document live deployment URL, production cron schedule, and actual verification timestamps.
2. **`README.md`:**
   - Add production deployment badge or verified demo link if public access is enabled.
   - Update deployment status section.

---

## 16. Non-Goals

The following activities are strictly prohibited during Phase 10:
- **No Application Changes:** No modifications to UI components, React hooks, or styling.
- **No API Changes:** No changes to endpoint request/response contracts or URL structures.
- **No Schema Changes:** No alterations to `db/schema.ts` or addition of Drizzle migrations.
- **No Dependency Additions:** No new packages added to `package.json`.
- **No Internal Scheduler Daemon:** No replacement of external cron triggers with long-lived background daemons.
- **No Authentication System:** No user login or session management added to the dashboard.
- **No Synthetic Telemetry:** No fabrication of fake checks or simulated production metrics.

---

## 17. Phase 10B Handoff Checklist

Phase 10A Design is complete. When transitioning to Phase 10B Implementation Specification:
- [x] Host target identified: Vercel + Neon PostgreSQL + External Cron.
- [x] Environment variable requirements established: `DATABASE_URL`, `CRON_SECRET`.
- [x] Database migration strategy confirmed: `npm run db:migrate`.
- [x] Security and fail-closed authentication verified against current code.
- [x] 18-point verification matrix defined (`DEP-001` through `DEP-018`).
- [x] Rollback plan documented.
- [x] Strict non-goals reinforced.
