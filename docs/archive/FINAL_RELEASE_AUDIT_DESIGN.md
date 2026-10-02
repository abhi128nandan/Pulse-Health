# Phase 8D-A — Final Release Readiness Audit Design

**Project:** PulseCheck — API Monitoring & Observability Dashboard  
**Phase:** 8D-A — Final Release Readiness Audit Design  
**Author:** Senior Staff Software Engineer & Release/QA Architect  
**Status:** DRAFT / APPROVED FOR SPECIFICATION (Phase 8D-B)  
**Date:** 2026-10-02  
**Target Release Gate:** Production Release Readiness (Phase 8D)  

---

## 1. Document Status

This document establishes the authoritative, end-to-end audit design and verification strategy to evaluate PulseCheck's readiness for production release.

Phase 8C successfully remediated all frontend defects and completed the product QA suite (`QA-001` through `QA-050`). However, an enterprise release readiness audit must evaluate the **complete, integrated software system** across all architectural layers, runtime environments, and operational boundaries—rather than isolated frontend passes.

This document is **DESIGN ONLY**. No application code, database schemas, test cases, or configurations are altered in this phase.

---

## 2. Purpose

The purpose of the Final Release Readiness Audit is to:
1. Provide an objective, evidence-based verification framework that proves PulseCheck satisfies all product, reliability, architectural, and security invariants.
2. Establish formal distinction between **Documented Claims**, **Implementation Facts**, **Empirical Verifications**, **Known Limitations**, and **Release Risks**.
3. Define the precise verification methodologies for all 16 system domains spanning UI, APIs, database persistence, HTTP probing, telemetry computation, external cron scheduling, concurrency boundaries, security hygiene, accessibility, responsiveness, and repository health.
4. Establish unambiguous gate criteria that govern whether PulseCheck can be safely deployed to production.

---

## 3. Release Readiness Definition

In PulseCheck, **Release Readiness** is defined as meeting all of the following criteria simultaneously:
- **Zero Blockers:** 0 P0 (blocker) and 0 P1 (critical/functional/accessibility) defects across the entire product.
- **Contract Adherence:** 100% compliance with defined API contracts, database schemas, metrics formulas, and status semantics (`UP`, `DEGRADED`, `DOWN`, `NO DATA`).
- **Empirical Proof:** All critical system behaviors (concurrency caps, process execution guards, cron authentication, target failure isolation, database cascading) must be backed by empirical evidence on a running production build and live PostgreSQL database.
- **No Synthetic Telemetry:** The UI displays strictly authentic data derived from genuine monitoring runs; no fabricated latency or mock metrics exist in production code paths.
- **Operational Transparency:** All intentional architectural constraints (e.g., process-local execution guards, external scheduler triggers) are explicitly documented with known operational profiles.
- **Clean Toolchain:** Automated test suite passes 100% (current baseline: >= 198 tests across 13 files), TypeScript strict mode compiles with 0 errors, ESLint reports 0 warnings, and Next.js production build succeeds without warnings or hydration hazards.
 
 ---
 
 ## 4. Current System Baseline
 
 | Layer | Implementation Component | Current Verified Baseline Status |
 | :--- | :--- | :--- |
 | **Framework** | Next.js 16.3.7 (App Router, Turbopack) | Production build passing; dynamic SSR routes verified. |
 | **Language** | TypeScript Strict Mode (`npx tsc --noEmit`) | 0 type diagnostics. |
 | **Linter** | ESLint (`npm run lint`) | 0 warnings, 0 errors. |
 | **Automated Tests** | Vitest (`npm test`) | 198/198 tests passing across 13 test files (100%). |
| **Database** | PostgreSQL (Neon serverless) via Drizzle ORM | Schema migrations applied; foreign key cascade active. |
| **Probing Engine** | `services/checker.ts` (native `fetch`, high-res timer) | Enforces 5000ms timeout via `AbortController`. |
| **Monitoring Engine** | `services/monitor.ts` | Records atomic checks; handles target failures as status. |
| **Metrics Engine** | `services/metrics.ts` | Pure functions for Uptime, Error Rate, Avg Latency, P95. |
| **Scheduler** | `services/scheduler.ts` | `MAX_CONCURRENCY = 5`, sliding worker queue, execution guard. |
| **Cron Trigger** | `app/api/cron/check/route.ts` | `POST` only, timing-safe `CRON_SECRET` Bearer auth. |
| **Frontend UI** | `app/page.tsx` + `components/*.tsx` | 50/50 QA scenarios verified in Phase 8C. |

---

## 5. Audit Scope

The release audit evaluates the entire surface area of PulseCheck:

```
[ External Scheduler / HTTP Client ]
                 │
                 ▼ (Domain 7 & 8: Real HTTP transport, Bearer Auth, POST only)
     ┌────────────────────────────────────────────────────────┐
     │ Next.js Production Server (Port 3100)                  │
     │                                                        │
     │  ┌───────────────────────┐  ┌───────────────────────┐  │
     │  │ App Router API Routes │  │ Dashboard Client UI   │  │
     │  │ (Domain 5: REST APIs) │  │ (Domains 1,10,12,13)  │  │
     │  └───────────┬───────────┘  └───────────┬───────────┘  │
     │              │                          │              │
     │              ▼                          ▼              │
     │  ┌───────────────────────────────────────────────────┐  │
     │  │ Execution Guard & Scheduler (Domains 6, 9)        │  │
     │  │  - Process-local isExecutionActive guard          │  │
     │  │  - Worker pool concurrency <= 5                   │  │
     │  └───────────────────────┬───────────────────────────┘  │
     │                          │                              │
     │                          ▼                              │
     │  ┌───────────────────────────────────────────────────┐  │
     │  │ HTTP Checker & Monitor (Domains 2, 3)             │  │
     │  │  - Target probing (HTTP/DNS/Timeout)              │  │
     │  │  - Metrics computation (Domain 4)                 │  │
     │  └───────────────────────┬───────────────────────────┘  │
     └──────────────────────────┼──────────────────────────────┘
                                │
                                ▼ (Domain 3: PostgreSQL / Neon)
            ┌───────────────────────────────────────┐
            │ PostgreSQL (Neon)                     │
            │  - endpoints table                    │
            │  - checks table (ON DELETE CASCADE)   │
            └───────────────────────────────────────┘
```

---

## 6. Non-Goals

The release audit explicitly **excludes** the following out-of-scope activities:
1. **Redesigning Architecture:** No distributed locks (Redis, ZooKeeper), message queues (BullMQ, Kafka), or persistent background daemons will be designed or added.
2. **Feature Expansion:** No authentication/multi-tenancy, alerting channels (Slack, PagerDuty, email), or multi-region probe networks.
3. **Database Schema Alterations:** No alterations to table columns, indexes, or relations.
4. **Third-Party Service Provisioning:** No provisioning of cloud cron providers (Vercel Cron, GitHub Actions, AWS EventBridge).
5. **Code Modifications in Phase 8D-A:** Zero code or test authoring during the audit design phase.

---

## 7. Audit Principles

1. **Empirical Fact Over Documented Assertion:** A feature or invariant is only considered verified if accompanied by deterministic, reproducible evidence.
2. **Target Failure vs. Platform Failure Isolation:** Target HTTP 500s, DNS resolution failures, and network timeouts are **monitoring outcomes**, not platform crashes. They must be recorded cleanly as `DOWN` with appropriate diagnostics.
3. **Fail-Closed Security:** Missing or misconfigured secrets must deny execution without leaking credentials, tokens, or internal error traces.
4. **Zero Synthetic Telemetry:** Never populate UI components or database tables with fabricated data to satisfy tests or aesthetic appearance.
5. **Preservation of Null Latency Invariant:** When a check has `latency_ms = null` (e.g. invalid URL format) or when a check fails (`status = 'down'`), it is strictly excluded from metrics latency averages. In metrics calculation and UI rendering, `null` must **never** be coerced into `0`.
6. **Independence of Audit:** Findings must be audited directly against the running production artifact (`next start`), not assumed from historical phase artifacts.

---

## 8. Evidence Model

Every finding in the audit must be classified with an explicit Evidence Type and Verification Status:

### 8.1 Evidence Types
- `[UNIT]`: In-memory isolated unit tests executing pure functions (e.g., metrics formulas, URL validators).
- `[INTEGRATION]`: Subsystem tests validating multi-module interactions (e.g., scheduler worker pool with mock database).
- `[DATABASE]`: Physical database queries executed against the live PostgreSQL (Neon) database verifying schema, constraints, and cascades.
- `[HTTP]`: Real TCP/HTTP network socket requests dispatched against the live Next.js production server (`http://127.0.0.1:3100`).
- `[BROWSER]`: Headless or automated browser DOM inspection evaluating rendering, focus traps, event handling, and console streams.
- `[STATIC]`: Static source analysis, AST scanning, ESLint output, or TypeScript strict type checks.
- `[BUILD]`: Next.js production build compiler telemetry (`next build`).
- `[GIT]`: Git status, tree diffs, tracking audits, and repository hygiene scans.

### 8.2 Classification Categories
- **DOCUMENTED CLAIM:** A capability asserted in documentation or architectural specs.
- **IMPLEMENTATION FACT:** A property verified by direct inspection of active source code.
- **EMPIRICAL VERIFICATION:** A property validated by running executable code, tests, or live network calls.
- **KNOWN LIMITATION:** An intentional, documented architectural constraint or boundary condition.
- **RELEASE RISK:** A defect, vulnerability, or operational hazard that could impact production stability.

---

## 9. Product Functional Audit (Domain 1)

The functional audit validates the 20 primary user journeys through the dashboard:

| Journey ID | Journey Name | Target Behavior | Evidence Type | Acceptance Standard |
| :--- | :--- | :--- | :--- | :--- |
| **JRN-01** | Zero Endpoints Dashboard | Fresh installation renders `EmptyState` component with clear CTA. | `[BROWSER]` | Displays "No endpoints monitored yet" with active "Add Endpoint" button. |
| **JRN-02** | Add Endpoint Open | Clicking CTA opens modal dialog. | `[BROWSER]` | Modal mounts with `role="dialog"`, auto-focuses Name input. |
| **JRN-03** | Blank Form Validation | Submitting empty form blocks network request. | `[BROWSER]` | Inline errors: name required, URL required; zero HTTP requests. |
| **JRN-04** | Protocol Validation | Rejects non-HTTP/HTTPS URLs (e.g. `ftp://`). | `[BROWSER]` | Inline error: "URL must start with http:// or https://". |
| **JRN-05** | Malformed URL Validation | Rejects invalid strings (e.g. `http://foo bar`). | `[BROWSER]` | Inline error: "Please enter a valid URL". |
| **JRN-06** | Threshold Validation | Rejects threshold <= 0 or > 60000. | `[BROWSER]` | Rejects out-of-range thresholds with specific boundary errors. |
| **JRN-07** | Duplicate URL Handling | Submitting existing URL triggers 409 conflict. | `[HTTP]` / `[BROWSER]` | Toast displays "An endpoint with this URL already exists"; no crash. |
| **JRN-08** | Successful Registration | Valid endpoint submitted; receives HTTP 201. | `[HTTP]` / `[BROWSER]` | Modal closes, focus restored, endpoint prepended to dashboard. |
| **JRN-09** | Initial State Invariant | Newly registered endpoint has `NO DATA` status. | `[BROWSER]` | Status badge is `NO DATA`; zero automatic background checks dispatched. |
| **JRN-10** | Manual Probe Trigger | Clicking "Check Now" initiates active probe. | `[BROWSER]` / `[HTTP]` | Button changes to "Probing...", disabled against rapid multi-clicks. |
| **JRN-11** | Probe UP Evaluation | Target responds 200 with latency <= threshold. | `[HTTP]` / `[BROWSER]` | Status updates to `UP` (green check circle); row displays real latency. |
| **JRN-12** | Probe DEGRADED Evaluation | Target responds 200 with latency > threshold. | `[HTTP]` / `[BROWSER]` | Status updates to `DEGRADED` (amber triangle); latency highlighted. |
| **JRN-13** | Probe DOWN Evaluation | Target responds 500. | `[HTTP]` / `[BROWSER]` | Status updates to `DOWN` (red X circle); target failure isolated. |
| **JRN-14** | Probe Timeout Evaluation | Target hangs > 5000ms. | `[HTTP]` / `[BROWSER]` | AbortController aborts at 5s; status `DOWN`, errorType `timeout`. |
| **JRN-15** | Probe DNS Failure | Domain cannot be resolved. | `[HTTP]` / `[BROWSER]` | Status `DOWN`, errorType `dns`/`network`, isolated from platform. |
| **JRN-16** | Master/Detail Navigation | Clicking row opens endpoint detail view. | `[BROWSER]` | Renders 24h summary metrics, latency chart, and history table. |
| **JRN-17** | Filter State Preservation | Back button preserves search query and tab. | `[BROWSER]` | Returning to overview retains query string and active status filter. |
| **JRN-18** | Real-time Search | Filters rows by name or URL. | `[BROWSER]` | Immediate client-side filtering; clear button resets query. |
| **JRN-19** | Status Filter Tabs | Filters by ALL, UP, DEGRADED, DOWN, NO DATA. | `[BROWSER]` | List accurately reflects filtered subset; empty tab shows reset action. |
| **JRN-20** | Deletion & Cascade | Delete modal confirms; deletes endpoint & checks. | `[DATABASE]` / `[HTTP]` | Endpoint removed from UI; DB cascade deletes all associated check records. |

---

## 10. HTTP Checker Audit (Domain 2)

The audit of `services/checker.ts` verifies adherence to core probing contracts:

1. **Protocol Restriction:** Only `http:` and `https:` protocols are accepted. Any other protocol returns `{ status: 'down', errorType: 'invalid_url', latencyMs: null }` without dispatching network calls.
2. **High-Resolution Timing:** Latency must be measured using `performance.now()` surrounding the native `fetch` call, rounded to the nearest integer millisecond.
3. **Timeout Enforcement:**
   - Default timeout is strictly 5000ms (`DEFAULT_TIMEOUT_MS = 5000`).
   - Driven by an active `AbortController` signal passed to `fetch`.
   - On abort, timeout returns `{ statusCode: null, latencyMs, success: false, status: 'down', errorType: 'timeout', errorMessage: 'Request timed out after 5000ms' }`, where `latencyMs` reflects the measured elapsed probe time (`performance.now() - startTime` $\ge 5000\text{ms}$). Because `status: 'down'`, it is strictly excluded from metrics latency averages.
   - Null latency (`latencyMs: null`) is generated when URL validation fails prior to probing (`errorType: 'invalid_url'`) or when check records have no latency recorded. All failed checks (`status: 'down'`) are excluded from latency averages.
4. **Classification Matrix:**
   - `statusCode >= 200 && statusCode < 400` AND `latencyMs <= threshold` $\rightarrow$ `up` (`success: true`).
   - `statusCode >= 200 && statusCode < 400` AND `latencyMs > threshold` $\rightarrow$ `degraded` (`success: true`).
   - `statusCode >= 400 && statusCode <= 599` $\rightarrow$ `down` (`success: false`, `errorType: 'http'`).
   - DNS failure (`ENOTFOUND`, `EAI_AGAIN`, `getaddrinfo`) $\rightarrow$ `down` (`success: false`, `errorType: 'dns'`).
   - Connection reset/refused $\rightarrow$ `down` (`success: false`, `errorType: 'network'`).
5. **No Synthetic Normalization:** Checker outputs must never normalize target errors into platform exceptions.

---

## 11. Monitoring & Persistence Audit (Domain 3)

The audit of `services/monitor.ts` and `db/schema.ts` verifies database persistence integrity:

1. **Atomic Check Persistence:**
   - Every execution of `runCheckForEndpoint(endpointId)` must write **exactly one** record to the `checks` table.
   - Record fields: `endpoint_id`, `checked_at` (timestamp), `status_code`, `latency_ms`, `success`, `status`, `error_type`, `error_message`.
2. **Target Failure vs. Infrastructure Failure:**
   - When a target endpoint fails (HTTP 500, timeout, DNS), `runCheckForEndpoint` succeeds and returns `{ outcome: 'completed', check: CheckResult }`.
   - When the database write fails or endpoint ID is invalid, it returns `{ outcome: 'error', error: string }`.
3. **Foreign Key Integrity:**
   - `checks.endpoint_id` strictly references `endpoints.id` with `onDelete: 'cascade'`.
   - Audit must verify by creating an endpoint, logging checks, deleting the endpoint, and querying `SELECT count(*) FROM checks WHERE endpoint_id = :id` to confirm zero orphaned rows.

---

## 12. Metrics Audit (Domain 4)

The audit of `services/metrics.ts` validates mathematical exactness across all pure metrics functions and database aggregation queries.

### 12.1 Deterministic Dataset Alpha Audit
The audit will execute against a standard deterministic dataset:
- Check 1: `UP`, latency = 120ms
- Check 2: `UP`, latency = 180ms
- Check 3: `DEGRADED`, latency = 600ms
- Check 4: `DOWN`, latency = `null` (timeout / network failure)

### 12.2 Mathematical Invariants
$$\text{Total Checks} = 4$$
$$\text{Successful Checks} = \text{UP} + \text{DEGRADED} = 2 + 1 = 3$$
$$\text{Failed Checks} = \text{DOWN} = 1$$
$$\text{Uptime Percentage} = \frac{3}{4} \times 100 = 75.00\%$$
$$\text{Error Rate Percentage} = \frac{1}{4} \times 100 = 25.00\%$$
$$\text{Average Latency} = \frac{120 + 180 + 600}{3} = \frac{900}{3} = 300\text{ ms}$$
*Invariant: The 4th check (null latency) must be strictly excluded from the denominator. Average latency must NEVER divide by 4 or treat null as 0.*
$$\text{P95 Latency} = \text{Nearest Rank Index } \lceil 0.95 \times 3 \rceil - 1 = \lceil 2.85 \rceil - 1 = 3 - 1 = 2 \rightarrow \text{Sorted}[2] = 600\text{ ms}$$

### 12.3 Zero-Check Invariant
When an endpoint has 0 checks in the 24-hour evaluation window:
- `uptime`: 0 (UI renders `--`)
- `errorRate`: 0 (UI renders `--`)
- `averageLatencyMs`: `null` (UI renders `--`)
- `p95LatencyMs`: `null` (UI renders `--`)
- `totalChecks`: 0

---

## 13. API Contract Audit (Domain 5)

Audit all 7 REST API endpoints exposed by the Next.js server for schema, status codes, and error sanitization:

| Route | Method | Expected Status Codes | Request Validation | Response Contract |
| :--- | :--- | :--- | :--- | :--- |
| `/api/endpoints` | `GET` | 200 | None | Array of `Endpoint` objects (`id`, `name`, `url`, `latencyThresholdMs`, `createdAt`). Does NOT include `latestCheck`. |
| `/api/endpoints` | `POST` | 201, 400, 409, 500 | `name` non-empty text, `url` valid HTTP/HTTPS, `latencyThresholdMs` 1..60000 | Created `Endpoint` object. |
| `/api/endpoints/[id]` | `DELETE` | 204, 400, 404, 500 | `id` numeric integer | Empty body (`204 No Content`) as implemented in `app/api/endpoints/[id]/route.ts`. Cascades DB checks. (Note: returns 204 with empty body; does not return 200 `{ success: true }`). |
| `/api/endpoints/[id]/check` | `POST` | 200, 400, 404, 500 | `id` numeric integer | `{ endpoint: Endpoint, check: CheckResult }`. Updates DB. |
| `/api/endpoints/[id]/metrics`| `GET` | 200, 400, 404, 500 | `id` numeric integer | `{ uptime, errorRate, averageLatencyMs, p95LatencyMs, totalChecks }`. |
| `/api/endpoints/[id]/history`| `GET` | 200, 400, 404, 500 | `id` integer, `limit` optional integer (default 50) | Array of up to 50 `Check` objects ordered `checked_at` descending. |
| `/api/cron/check` | `POST` | 200, 401, 405, 500 | `Authorization: Bearer <CRON_SECRET>` | `{ message: string, summary: SchedulerRunSummary }` on execution, or `{ success: true, skipped: true, reason: string }` (200 OK) when execution guard is active. |

### 13.1 Contract Hygiene Rules
- Any non-numeric `id` param returns `400 Bad Request`.
- Any missing endpoint returns `404 Not Found`.
- Duplicate URL creation returns `409 Conflict`.
- Disallowed HTTP methods on any route return `405 Method Not Allowed`.

---

## 14. Scheduler Audit (Domain 6)

The audit of `services/scheduler.ts` verifies automated monitoring cycle execution:

1. **Process-Local Execution Guard:**
   - An in-memory boolean flag (`isExecutionActive`) guards the scheduler against overlapping executions within the same Node process.
   - If an execution is triggered while `isExecutionActive === true`, `acquireExecutionGuard()` returns `false`.
   - The cron route logs a warning and returns **HTTP 200** with `{ success: true, skipped: true, reason: 'Previous scheduled check run is still active' }`, cleanly skipping the execution without running checks. (It does not return 409).
   - Guard lifecycle (`acquireExecutionGuard` and `releaseExecutionGuard`) is managed in `app/api/cron/check/route.ts` with release guaranteed in a `finally` block to prevent deadlock on uncaught errors.
2. **Concurrency Cap:**
   - Worker pool concurrency must strictly satisfy:
     $$\text{Active Probes} \le \text{MAX\_CONCURRENCY} = 5$$
   - Verified via sliding queue pull: as soon as one worker completes, the next endpoint is pulled immediately without waiting for sibling workers in the batch.
3. **Exhaustive Processing:**
   - Every registered endpoint in the database must be processed exactly once per scheduler cycle.
   - Zero-endpoint scenario must complete cleanly without error, returning `{ total: 0, succeeded: 0, failed: 0, durationMs: ... }`.

---

## 15. Cron Security Audit (Domain 7)

The audit of `app/api/cron/check/route.ts` evaluates authentication and secret hygiene:

1. **HTTP Method Enforcement:** Only `POST` requests are accepted. `GET`, `PUT`, `DELETE` return `405 Method Not Allowed`.
2. **Bearer Token Authentication:**
   - Client must provide `Authorization: Bearer <CRON_SECRET>`.
   - Missing `Authorization` header, header without `Bearer ` prefix, wrong token length, or incorrect token value $\rightarrow$ **HTTP 401 Unauthorized** with body `{ error: 'Unauthorized' }`.
3. **Timing-Safe Comparison:**
   - Comparison between provided bearer token and `CRON_SECRET` must use `crypto.timingSafeEqual` over buffers to prevent side-channel timing attacks.
4. **Secret Sanitization:**
   - Neither `CRON_SECRET`, the `Authorization` header, nor token fragments may be printed in console logs, returned in response bodies, or exposed in error messages.
5. **Fail-Closed Server Configuration:**
   - If the server-side `process.env.CRON_SECRET` environment variable is undefined or empty string, the route logs `console.error('CRON_SECRET environment variable is not configured')` and returns **HTTP 500 Internal Server Error** with body `{ error: 'Internal server error' }`, immediately failing closed before inspecting request headers or executing checks.

---

## 16. Deployment Compatibility Audit (Domain 8)

The audit verifies the application's ability to run as a production-built Node.js artifact triggered by external infrastructure:

1. **Production Artifact Build:**
   - Execute `npm run build` using Next.js Turbopack compiler.
   - Must verify zero build warnings, zero TypeScript errors, and correct static/dynamic route allocation.
2. **Live Production Server Execution:**
   - Start the built application: `next start -p 3100`.
   - Dispatch real TCP/HTTP requests to `http://127.0.0.1:3100/api/cron/check`.
3. **Transport Proof:**
   - Distinguish direct route testing (`await POST(req)`) from genuine HTTP transport testing over network sockets (`fetch('http://127.0.0.1:3100/api/cron/check')`).
   - Validate HTTP 401 on missing secret.
   - Validate HTTP 200 on valid secret.
   - Validate database rows created in live PostgreSQL.

---

## 17. Reliability Audit (Domain 9)

The audit executes the verified reliability test suites:
- `services/scheduler.reliability.test.ts`
- `services/scheduler.integration.reliability.test.ts`
- `services/scheduler.deployment.integration.test.ts`
- `services/deployment.static.test.ts`

### 17.1 Verified Invariants Checklist
- [x] **INVAR-01:** Concurrency never exceeds 5 active HTTP sockets under burst loads.
- [x] **INVAR-02:** Slow/hanging endpoints (delay > 5000ms) are aborted via AbortController and do not block fast endpoints.
- [x] **INVAR-03:** Target DNS/network failures are recorded as completed checks (`status: 'down'`) and do not interrupt the run.
- [x] **INVAR-04:** Persistence failure on 1 of $N$ endpoints records `{ outcome: 'error' }` for that endpoint but allows remaining $N-1$ endpoints to complete and persist.
- [x] **INVAR-05:** Deletion of an endpoint during an active scheduler run does not crash the scheduler loop.
- [x] **INVAR-06:** Overlap guard prevents concurrent runs in the same process; guard resets reliably even when errors occur.
- [x] **INVAR-07:** 5 consecutive sequential scheduler cycles produce strictly monotonic check records without state leakage.

---

## 18. Frontend & Product Polish Audit (Domain 10)

Audits the Phase 8C frontend implementation for visual and behavioral integrity:

1. **Visual Language:** Calm, dense, technical, developer-focused dark neutral aesthetic. Zero gratuitous animations, gradients, or glassmorphism.
2. **Consistent Terminology:** Latency threshold is consistently labeled `"Latency threshold"` across modals, tables, and chart reference lines. No introduction of `"SLA"`.
3. **Zero Synthetic Data:** Unevaluated endpoints render `NO DATA` (`--`). No default 100% uptime or 0ms latency displayed before an endpoint is probed.
4. **Interactive Debounce:** "Check Now" buttons disable immediately upon click with "Probing..." label to prevent accidental multi-clicks.
5. **Chart Fidelity:**
   - X-axis points arranged strictly in chronological order (oldest to newest).
   - Reference line plotted at `endpoint.latencyThresholdMs`.
   - Null latency points rendered with failure indicators and tooltips, without dropping the line to 0ms.
6. **Toast Feedback:** Unobtrusive, auto-dismissing notifications for create, probe, and delete events.

---

## 19. Responsive Layout Audit (Domain 11)

Audit exact rendering across five standard responsive breakpoints:

| Viewport Width | Device Target | Required Layout Adaptations |
| :--- | :--- | :--- |
| **1440px** | Large Desktop | Centered `max-w-7xl` container; 4-card summary grid; 6-column full tabular data view; right-aligned actions. |
| **1024px** | Small Desktop / Tablet Landscape | Proportional padding; summary grid intact; full table visible with comfortable cell padding. |
| **768px** | Tablet Portrait | Summary cards collapse to 2-column grid (`grid-cols-2`); table wrapper preserves `overflow-x-auto`. |
| **375px** | Mobile Portrait | Table is hidden (`hidden md:table`); `EndpointMobileCard` stack is active (`md:hidden`); full action set accessible. |
| **320px** | Narrow Mobile | Zero horizontal viewport scrolling; card padding compressed; touch targets maintain $\ge 36\text{px}$ height; long URLs wrap safely. |

---

## 20. Accessibility Audit (Domain 12)

Audit keyboard accessibility, screen-reader semantics, and focus management:

1. **Native Cyclic Focus Trap:**
   - `AddEndpointModal` and `DeleteEndpointModal` must contain focus within the dialog.
   - Pressing `Tab` from the last focusable element wraps to the first focusable element.
   - Pressing `Shift+Tab` from the first focusable element wraps to the last focusable element.
   - Focus cannot escape to the background page DOM.
2. **Focus Restoration:**
   - Opening a modal records `document.activeElement`.
   - Closing the modal (via Cancel button, Escape key, or backdrop click) restores focus back to the initiating element.
3. **Keyboard Activatable Rows:**
   - Table rows and mobile cards have `tabIndex={0}` and respond to `Enter` and `Space` to trigger master/detail selection.
   - Nested action buttons (Check Now, Delete) invoke `e.stopPropagation()`.
4. **Color Independence:**
   - Status badges combine distinct geometric SVG icons (CheckCircle, AlertTriangle, XCircle, MinusCircle) with explicit text labels (`UP`, `DEGRADED`, `DOWN`, `NO DATA`).
5. **Screen Reader Semantics:**
   - Modals provide `role="dialog"`, `aria-modal="true"`, and `aria-labelledby`.
   - Toasts provide `role="status"` under an `aria-live="polite"` live region.

---

## 21. Browser Runtime Audit (Domain 13)

Audits browser runtime console output against a running production instance:

1. **Hydration Verification:** 0 React hydration mismatch errors (`Text content does not match server-rendered HTML`).
2. **DOM Nesting Verification:** Zero HTML nesting violations:
   - No `<div>` directly inside `<tbody>` or `<table>`.
   - No `<tr>` directly inside `<div>`.
   - No `<button>` nested inside another `<button>`.
3. **Console Cleanliness:** Zero uncaught exceptions, zero unhandled promise rejections, zero React deprecation warnings.
4. **Static Asset Integrity:** All bundled CSS, JS chunks, and SVG icons return HTTP 200 without 404s.

---

## 22. Security & Sanitization Audit (Domain 14)

Verifies zero credential or infrastructure disclosure across logs, source code, and network payloads:

1. **Secret Scanning:**
   - Source code scan for hardcoded credentials, API keys, or database URLs.
   - Verify `.env.local` is present in `.gitignore`.
2. **Payload Sanitization:**
   - Audit client fetch error handlers: SQL error messages, database hostnames, table schemas, and Node internals must be intercepted and replaced with safe, human-readable strings.
3. **Log Sanitization:**
   - Verify `console.log` statements in services and API routes do not output `DATABASE_URL`, `CRON_SECRET`, or HTTP request authorization headers.

---

## 23. Build & Toolchain Audit (Domain 15)

Evaluates compiler, type checker, linter, and test harness execution:

1. **Test Suite:** `npm test` executes the complete suite; requires 100% passing tests across all test suites (current baseline: >= 198 tests across 13 test files).
2. **Type Checking:** `npx tsc --noEmit` validates TypeScript strict mode with 0 errors.
3. **Linting:** `npm run lint` validates all source files with 0 warnings and 0 errors.
4. **Production Build:** `npm run build` compiles production assets cleanly with Next.js Turbopack.

---

## 24. Git & Repository Hygiene Audit (Domain 16)

Evaluates working directory state and change boundaries:

1. **Permitted Change Verification:** Verify that only permitted files were modified during Phase 8C:
   - `app/page.tsx`
   - `components/*.tsx`
   - `docs/*.md`
2. **Prohibited File Isolation:** Confirm zero modifications to:
   - `services/*.ts`
   - `db/schema.ts`
   - `drizzle/*`
   - `app/api/*`
   - `package.json`
   - `package-lock.json`
3. **Clean Workspace:** No temporary test logs, core dumps, or scratch files tracked by Git.

---

## 25. Known Architectural Limitations

The release audit explicitly distinguishes known architectural trade-offs from bugs:

1. **Process-Local Execution Guard:** The scheduler's `isExecutionActive` guard is in-memory and local to a single Node.js process. In a horizontally scaled, multi-instance deployment without distributed locking, multiple instances receiving simultaneous cron triggers could execute checks concurrently. This is an intentional design boundary for single-instance or external-scheduler-coordinated deployments.
2. **External Trigger Dependency:** PulseCheck does not run an internal timer daemon (`setInterval`). Scheduled checks depend entirely on external HTTP triggers hitting `/api/cron/check`.
3. **Absence of Database Archival / Query-Level History Limit:** PulseCheck has no database-level retention policy, TTL expiration, or automated partitioning table cleanup in PostgreSQL. Check records accumulate continuously in the `checks` table until an endpoint is deleted (which cascades). The system currently enforces only a query-level retrieval limit: `GET /api/endpoints/:id/history` defaults to returning the most recent 50 checks (`DEFAULT_RECENT_CHECKS_LIMIT = 50`, capped at 100), and the dashboard UI displays at most 50 recent rows. The absence of an automated database cleanup or partition archiving mechanism is an intentional design boundary for this phase.
4. **No Native Alerting:** PulseCheck is an observability dashboard and probe engine. It does not dispatch outbound emails, webhooks, or SMS alerts upon status degradation.
5. **Single-Tenant Model:** There is no multi-user authentication or role-based access control (RBAC) in the dashboard UI.

---

## 26. Risk Classification Framework

Risks identified during the audit will be categorized using the standard severity model:

| Severity | Criteria | Impact on Release Gate |
| :--- | :--- | :--- |
| **P0 (Blocker)** | Data loss, memory leak, crash loop, secret exposure, unhandled security vulnerability, or broken build. | **HARD BLOCKER.** Release prohibited until remediated. |
| **P1 (Critical)** | Core user journey broken, metric formula incorrect, concurrency cap breached, focus trap failure, or hydration error. | **HARD BLOCKER.** Release prohibited until remediated. |
| **P2 (Medium)** | Minor UI alignment defect, non-critical responsive glitch, non-blocking console warning, or suboptimal error copy. | Allowed for release with documented tracking ticket. |
| **P3 (Low)** | Minor polish suggestion, cosmetic spacing discrepancy, or non-functional documentation inconsistency. | Allowed for release. |

---

## 27. Final Release Gate

The system is granted **RELEASE APPROVAL** if and only if all gate conditions are satisfied:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FINAL RELEASE GATE CRITERIA                     │
├────────────────────────────────────────────────────────────────────────┤
│ 1. P0 Defects = 0                                                     │
│ 2. P1 Defects = 0                                                     │
│ 3. Automated Test Suite: 100% PASS (current baseline: >= 198 tests)   │
│ 4. TypeScript Strict Compilation: 0 errors                             │
│ 5. ESLint Static Analysis: 0 warnings, 0 errors                       │
│ 6. Next.js Production Build: SUCCESS (0 errors)                       │
│ 7. Live HTTP Socket Transport: 200 OK & 401 Unauthorized verified      │
│ 8. Live Database Persistence: Verified on Neon PostgreSQL             │
│ 9. Concurrency Cap: Max 5 confirmed under load                        │
│ 10. Timing-Safe Cron Authentication: Confirmed                         │
│ 11. Mathematical Metrics: Dataset Alpha 100% verified                  │
│ 12. Null Latency Invariant: Strictly preserved (never coerced to 0)   │
│ 13. Zero Synthetic Telemetry: Confirmed                                │
│ 14. Native Cyclic Focus Traps: Verified in both modals                │
│ 15. Responsive Viewports: 1440, 1024, 768, 375, 320px verified        │
│ 16. Browser Runtime: 0 hydration errors, 0 DOM warnings                │
│ 17. Credential Sanitization: 0 secrets leaked                          │
│ 18. Git Boundary: Strictly compliant with phase change limits         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 28. Evidence Requirements

Every audit item in the subsequent Phase 8D execution must provide explicit evidence formatted as:

```markdown
### [AUDIT-ID] Feature / Requirement Name
- **Target Invariant:** Detailed statement of required behavior.
- **Evidence Type:** [UNIT | INTEGRATION | DATABASE | HTTP | BROWSER | STATIC | BUILD | GIT]
- **Execution Environment:** (e.g. Node 20 / Windows / Neon PostgreSQL / Port 3100)
- **Empirical Evidence:** Actual command output, HTTP response status, or database row snapshot.
- **Classification:** [DOCUMENTED CLAIM | IMPLEMENTATION FACT | EMPIRICAL VERIFICATION | KNOWN LIMITATION]
- **Status:** [PASS | FAIL | BLOCKED]
```

---

## 29. Audit Execution Order

When executing the audit in Phase 8D, the verification must follow a strict logical sequence to prevent testing on unstable or unbuilt artifacts:

```
Step 1: Repository & Git Cleanliness Audit [STATIC, GIT]
    ↓
Step 2: Build & Toolchain Audit (tsc, lint, test, next build) [BUILD, UNIT, INTEGRATION]
    ↓
Step 3: Database & Schema Audit (PostgreSQL connection, tables, cascade) [DATABASE]
    ↓
Step 4: Live Production Server Boot (next start -p 3100) [BUILD, HTTP]
    ↓
Step 5: API & Cron Transport Audit (Real socket calls, auth, fail-closed) [HTTP]
    ↓
Step 6: Scheduler & Concurrency Audit (Worker pool, guard, isolation) [INTEGRATION, HTTP]
    ↓
Step 7: Probing Engine & Target Failure Audit (UP, DEGRADED, DOWN, timeout, DNS) [HTTP]
    ↓
Step 8: Mathematical Metrics Audit (Dataset Alpha verification) [UNIT, DATABASE]
    ↓
Step 9: Product & UI Journey Audit (Dashboard, Add, Probe, Detail, Delete) [BROWSER]
    ↓
Step 10: Responsive & Viewport Audit (1440px down to 320px) [BROWSER]
    ↓
Step 11: Accessibility & Focus Trap Audit (Keyboard tab order, cyclic trap, Escape) [BROWSER]
    ↓
Step 12: Browser Console & Hydration Audit (Console log capture) [BROWSER]
    ↓
Step 13: Security & Credential Exposure Audit (Secret scan, error sanitization) [STATIC, HTTP]
    ↓
Step 14: Final Gate Evaluation & Release Recommendation [GATE]
```

---

## 30. Acceptance Criteria for Phase 8D-A

Phase 8D-A is satisfied when:
1. `docs/FINAL_RELEASE_AUDIT_DESIGN.md` is authored with complete technical coverage across all 16 domains.
2. Clear distinction is drawn between Documented Claims, Implementation Facts, Empirical Verifications, Known Limitations, and Release Risks.
3. Explicit pass/fail gate criteria are defined with zero ambiguity.
4. No production code, tests, schemas, package files, or configurations have been altered.
5. Git working tree diff is strictly limited to the newly created design document.

---

## 31. Phase 8D-B Handoff

Upon review and approval of this design document, the workflow advances to:

$$\text{Phase 8D-B — Final Release Readiness Audit Specification}$$

In Phase 8D-B, each audit domain will be translated into concrete, reproducible test cases with exact assertions, mock servers, HTTP request bodies, and expected outputs, preparing for final audit execution.
