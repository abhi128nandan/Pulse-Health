# Phase 10B — Production Deployment Specification

**Project:** PulseCheck — API Monitoring & Observability Dashboard  
**Phase:** 10B — Production Deployment Specification  
**Status:** **SPECIFICATION COMPLETE**  
**Date:** 2026-10-02  

---

## 1. Objective

The objective of Phase 10B is to define an exact, implementation-ready production deployment specification for PulseCheck. This specification operationalizes the approved Phase 10A deployment design into an actionable runbook and verification suite without performing any deployment actions, provisioning live infrastructure, or altering application code.

### Boundaries & Constraints
- **Specification Only:** No live resources are provisioned. No projects are created in Vercel or Neon. No GitHub Actions or cron-job.org schedules are configured.
- **Zero Runtime Code Modification:** Application code in `app/`, `components/`, `services/`, and `db/` remains completely untouched.
- **Zero Schema / Migration Modification:** `db/schema.ts` and `drizzle/` migrations remain unaltered.
- **Zero Dependency Changes:** `package.json` and `package-lock.json` are frozen.
- **Truthful Claim Boundary:** Deployment claims distinguish between verified development facts (Node 24.x local test harness) and deployment compatibility targets (platform-supported cloud runtimes).

---

## 2. Deployment Target

The production architecture consists of three integrated layers:

```
[ User Browser ]
       │
       ▼ (HTTPS / TLS)
[ Vercel Serverless Platform ]
       │  - Next.js 16 App Router (Node.js runtime)
       │  - Client-side fetch / API requests
       │  - Serverless Route Handlers: /api/endpoints/*, /api/cron/check
       │
       ├──► (Outbound HTTP Health Probes) ──► [ Monitored Target APIs ]
       │
       └──► (Encrypted SSL Transport) ────► [ Neon Serverless PostgreSQL ]
                                              (endpoints, checks tables)
       ▲
       │ (Scheduled HTTP POST + Bearer Auth)
[ External HTTP Scheduler ]
       ├─ Option A: GitHub Actions (Scheduled workflow)
       └─ Option B: cron-job.org (Managed HTTP ping service)
```

### Concrete Trade-Offs of External Scheduler Options

| Evaluation Dimension | Option A: GitHub Actions | Option B: cron-job.org |
| :--- | :--- | :--- |
| **Trigger Mechanism** | Scheduled CI/CD workflow (`cron: "*/5 * * * *"`) dispatching `curl`. | Managed HTTP webhook dispatcher. |
| **Execution Accuracy** | Best-effort execution queue; subject to 2–5 minute delays during peak GitHub queue congestion. | High schedule fidelity with minimal timing drift. |
| **Audit & Logging** | Workflow execution history and full curl output logged directly within GitHub. | Execution history and HTTP response status logged in cron-job.org dashboard. |
| **Alerting on Failure** | Sends GitHub workflow failure notifications/emails on non-200 responses. | Built-in email alerts on consecutive HTTP failure thresholds. |
| **Maintenance & Secrets** | Stored within repository variables and secrets (`vars.PULSECHECK_URL`, `secrets.PULSECHECK_CRON_SECRET`). | Stored within cron-job.org account dashboard. |
| **Cadence Limits** | Effective minimum reliable cadence is 5 minutes. | Flexible cadences down to 1 minute. |

---

## 3. Vercel Configuration

The Vercel deployment specification is designed to leverage standard zero-config Next.js 16 detection:

- **Project Name:** `pulsecheck`
- **Framework Preset:** `Next.js`
- **Root Directory:** `./` (Repository root)
- **Install Command:** `npm ci`
- **Build Command:** `npm run build`
- **Output Directory:** Automatically managed by Next.js preset (`.next`)
- **Node.js Version:** Platform-supported Node runtime compatible with Next.js 16 (Node 20.x or Node 22.x LTS).
  - *Distinction:* The verified local development and test runtime is **Node 24.x**. The deployment compatibility target is the platform-supported Node LTS runtime provided by Vercel.
- **Git Branch Configuration:**
  - **Production Branch:** `main` (Automatic deployments on commit/merge).
  - **Preview Deployments:** Pull requests generate isolated preview URLs.
  - *Preview Caveat:* If preview deployments share the production `DATABASE_URL`, manual tests on preview URLs will write to the production database. Isolated branch databases in Neon should be utilized if preview isolation is desired.

---

## 4. GitHub Integration

The integration between GitHub and Vercel follows standard GitOps delivery:

```
[ Git Repository: abhi128nandan/Pulse-Health ]
       │
       ▼ Push to branch: main
[ Vercel GitHub App Trigger ]
       │
       ├── 1. Clone repository
       ├── 2. Execute Install: npm ci
       ├── 3. Inject Production Environment Variables (DATABASE_URL, CRON_SECRET)
       ├── 4. Execute Build: npm run build (Turbopack compilation + static generation)
       └── 5. Deploy artifacts to Global Edge Network
```

- **Trigger:** Automatic webhook invocation on push to `main`.
- **Environment Isolation:** Secrets configured in the Vercel dashboard under "Production" are only injected into builds originating from `main`.

---

## 5. Environment Variables

Exactly two environment variables are required in production. Both are strictly scoped to the server runtime:

| Variable Name | Vercel Environment Scope | Scope Requirement | Purpose | Value Constraints |
| :--- | :--- | :--- | :--- | :--- |
| `DATABASE_URL` | Production | Server-only | Neon PostgreSQL connection string. | Must use the Neon pooled connection string with SSL (`postgresql://<user>:<password>@<host>-pooler.neon.tech/<dbname>?sslmode=require`). |
| `CRON_SECRET` | Production | Server-only | High-entropy shared secret authenticating `POST /api/cron/check`. | Minimum 32-byte hex string (e.g. generated via `openssl rand -hex 32`). |

### Strict Non-Exposure Invariants
- **No `NEXT_PUBLIC_` Prefix:** Neither variable may be prefixed with `NEXT_PUBLIC_`.
- **No Client Inclusion:** Verified that neither `DATABASE_URL` nor `CRON_SECRET` is referenced in `app/page.tsx`, `components/`, or client-side utilities.

---

## 6. Neon PostgreSQL

The production database uses Neon serverless PostgreSQL.

- **Connection Endpoint:** Pooled connection string (`-pooler.neon.tech`) on port `5432`.
- **SSL Configuration:** SSL is required (`sslmode=require`). `db/index.ts` automatically configures `{ rejectUnauthorized: false }` when detecting `neon.tech` or `sslmode=require` in `DATABASE_URL`.
- **Connection Pool:** Managed via `pg.Pool` with connection reuse across warm serverless function invocations.
- **Database Tables:**
  - `endpoints`: Target configuration and latency thresholds.
  - `checks`: Time-series observations and error telemetry with foreign key `ON DELETE CASCADE`.

---

## 7. Migration Procedure

Database migrations must be applied prior to cutting over production traffic.

### 7.1 Migration Script Contract
From [package.json](file:///D:/Pulse_Health/package.json):
```json
"db:migrate": "drizzle-kit migrate"
```
Configuration is defined in [drizzle.config.ts](file:///D:/Pulse_Health/drizzle.config.ts), loading SQL files from `./drizzle`.

### 7.2 Execution Steps
1. **Precondition:** Neon PostgreSQL database is active and `DATABASE_URL` is verified.
2. **Execution:** Run migrations against the production database:
   ```bash
   DATABASE_URL="<production-neon-pooled-url>" npm run db:migrate
   ```
3. **Verification:** Inspect database schema using a PostgreSQL client or `npm run db:studio` to ensure tables `endpoints` and `checks` exist with indexes:
   - Index `checks_endpoint_id_checked_at_idx` present on `checks(endpoint_id, checked_at DESC)`.
   - Unique constraint `endpoints_url_unique` present on `endpoints(url)`.
4. **Safety Rule:** Migration execution is decoupled from application startup. Next.js does not run migrations on boot. Destructive schema commands (`drizzle-kit push --force` or `drop table`) are strictly prohibited.

---

## 8. Build Procedure

The production build compiles the Next.js App Router application into optimized standalone assets:

### 8.1 Build Command Sequence
```bash
npm ci
npm run build
```

### 8.2 Build Invariants
- **`npm ci` (No `--omit=dev`):** Dev dependencies (TypeScript, Tailwind CSS, `@types/*`) are required during `npm run build` to perform typechecking and CSS compilation.
- **Turbopack Compilation:** `npm run build` executes `next build` with Turbopack.
- **Type Checking:** Runs strict TypeScript validation (`tsc`). Any compilation error aborts the deployment before artifact publishing.
- **Zero Runtime Secrets Needed During Build:** Static page generation in Next.js does not query the database during the build step, ensuring build steps succeed without connecting to external networks.

---

## 9. External Cron Specification

Scheduled monitoring is initiated by an external HTTP trigger against the production endpoint:

- **Endpoint:** `POST https://<production-domain>/api/cron/check`
- **Header:** `Authorization: Bearer <CRON_SECRET>`
- **Expected Cadence:** Initial proposed cadence of 5 minutes (`*/5 * * * *`).
- **HTTP Timeout:** Recommended 30 to 60 seconds (must accommodate up to $\le 5$ concurrent target HTTP probes with 5-second socket timeouts).
- **Retry Policy:** Do not retry failed requests immediately to prevent hammering target APIs during external outages. Let the next scheduled interval trigger naturally.
- **Execution Response:**
  - Success: `200 OK` with JSON summary payload (`totalEndpoints`, `attempted`, `succeeded`, `failed`, `durationMs`, `results`).
  - Guard Skipped: `200 OK` with `{ "success": true, "skipped": true, "reason": "Previous scheduled check run is still active" }`.
  - Unauthorized: `401 Unauthorized` (`{ "error": "Unauthorized" }`).
  - Server Misconfigured: `500 Internal Server Error` (`{ "error": "Internal server error" }`).

---

## 10. Option A: GitHub Actions Specification

*Note: Specification only. Do not create file until Phase 10C.*

### Workflow File: `.github/workflows/pulsecheck-cron.yml`
```yaml
name: PulseCheck Scheduled Monitoring

on:
  schedule:
    # Executes every 5 minutes
    - cron: '*/5 * * * *'
  workflow_dispatch: # Allows manual trigger from GitHub Actions UI

jobs:
  scheduled-check:
    name: Trigger Scheduled Monitoring
    runs-on: ubuntu-latest
    steps:
      - name: Send Authenticated Cron Request
        run: |
          curl -sS -X POST \
            "${{ vars.PULSECHECK_URL }}/api/cron/check" \
            -H "Authorization: Bearer ${{ secrets.PULSECHECK_CRON_SECRET }}" \
            --fail-with-body
```

### Variable Configuration
- **Repository Variable:** `PULSECHECK_URL` (e.g. `https://pulsecheck.vercel.app`) configured under *Settings > Secrets and variables > Actions > Variables*.
- **Repository Secret:** `PULSECHECK_CRON_SECRET` configured under *Settings > Secrets and variables > Actions > Secrets*.

---

## 11. Option B: cron-job.org Specification

*Note: Specification only. Do not configure until Phase 10C.*

### Job Parameters
- **Title:** `PulseCheck Monitor Trigger`
- **URL:** `https://<production-domain>/api/cron/check`
- **Request Method:** `POST`
- **Request Headers:**
  - Key: `Authorization`
  - Value: `Bearer <CRON_SECRET>`
- **Schedule:** User-selected cadence, with 5 minutes as the initial proposed cadence.
- **Request Timeout:** 30 seconds.
- **Failure Notification:** Enabled (alerts sent if 2 consecutive runs fail).

---

## 12. Complete Deployment Sequence

The exact step-by-step rollout sequence:

1. **Local Pre-Flight Verification:**
   - Execute test suite: `npm test` (all 198 tests pass).
   - Execute linter: `npm run lint` (0 errors).
   - Execute TypeScript check: `npx tsc --noEmit` (0 errors).
   - Execute production build: `npm run build` (clean exit code 0).
2. **Release Commit & Push:**
   - Ensure clean working tree.
   - Push release commit to GitHub `main` branch.
3. **Provision / Verify Neon Database:**
   - Retrieve pooled connection string (`sslmode=require`).
4. **Execute Database Migrations:**
   - Run `DATABASE_URL="..." npm run db:migrate`.
   - Confirm table and index creation.
5. **Configure Vercel Project:**
   - Connect repository `abhi128nandan/Pulse-Health`.
   - Set framework preset: `Next.js`.
   - Set Install Command: `npm ci`.
   - Set Build Command: `npm run build`.
6. **Set Production Environment Variables in Vercel:**
   - Add `DATABASE_URL` (Pooled Neon URL).
   - Add `CRON_SECRET` (High-entropy 32+ byte string).
7. **Trigger Initial Deployment:**
   - Deploy `main` branch via Vercel dashboard.
8. **Obtain Production URL:**
   - Record assigned production domain (`https://<project>.vercel.app`).
9. **Perform Verification Suite (DEP-001 – DEP-018):**
   - Execute verification tests as specified in Section 13.
10. **Configure External Scheduler:**
    - Set up Option A (GitHub Actions) or Option B (cron-job.org) with production URL and secret.
11. **Verify Automated Cadence:**
    - Confirm scheduled check execution without manual intervention.
12. **Update Public Documentation:**
    - Update `docs/DEPLOYMENT.md` and `README.md` to reflect verified deployment status.

---

## 13. Production Verification Matrix (DEP-001 – DEP-018)

| ID | Purpose | Precondition | Action | Expected Result | Evidence Required | Pass/Fail Rule |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **DEP-001** | Production Reachability | Vercel deployment published | Send HTTP GET to production URL | HTTP 200 OK returned | HTTP status header 200 | Fail if status $\ne 200$ |
| **DEP-002** | Frontend Rendering | DEP-001 passed | Open production URL in web browser | Dashboard renders header, stats, and table | 0 console errors, clean DOM | Fail on hydration/console error |
| **DEP-003** | Endpoint Registration | Dashboard loaded | Submit "Add Endpoint" form (`POST /api/endpoints`) | Returns HTTP 201 Created with endpoint record | Endpoint row appears in table | Fail if $\ne 201$ or row missing |
| **DEP-004** | Endpoint Retrieval | Endpoint created | Fetch `GET /api/endpoints/:id` | Returns HTTP 200 with matching schema | Valid JSON payload | Fail if $\ne 200$ or schema mismatch |
| **DEP-005** | Manual Health Check | Endpoint exists | Click "Check Now" (`POST /api/endpoints/:id/check`) | Returns HTTP 200 with real probe outcome | Non-zero latency, real status code | Fail if $\ne 200$ or latency missing |
| **DEP-006** | Check Persistence | DEP-005 passed | Query `GET /api/endpoints/:id/history` | Latest check matches execution ID & timestamp | Record present in history list | Fail if record missing |
| **DEP-007** | Metrics & Null Handling | Endpoint has checks | View metrics card and detail view | Correct uptime %, average latency, and P95; correctly displays null if no successful checks exist | Correctly calculated values or valid null placeholders | Fail if math is invalid or null crashes UI |
| **DEP-008** | Latency Visualization | History checks exist | Open Endpoint Detail modal | Recharts SVG curve renders history observations | SVG paths rendered without errors | Fail on Recharts crash or missing curve |
| **DEP-009** | Cron Auth Rejection | Deployment live | Send `POST /api/cron/check` with invalid/missing token | Returns HTTP 401 Unauthorized | `{ "error": "Unauthorized" }` | Fail if status $\ne 401$ |
| **DEP-010** | Cron Auth Acceptance | Deployment live | Send `POST /api/cron/check` with valid `CRON_SECRET` | Returns HTTP 200 OK with summary JSON | `{ "success": true, "attempted": N }` | Fail if status $\ne 200$ |
| **DEP-011** | Scheduler Execution | DEP-010 executed | Inspect Vercel function runtime logs | Logs show start, worker pool activity, and completion | Vercel runtime log entries | Fail if worker logs absent |
| **DEP-012** | Scheduled Check Persistence | DEP-010 executed | Query endpoint history via UI/API | New check records present with matching timestamps | Sequential check IDs stored in Neon | Fail if no DB records written |
| **DEP-013** | Target Failure Classification | Register known failing URL (e.g. 500 endpoint) | Trigger manual or scheduled probe | Probe classified as `DOWN` without server error | UI shows red badge, HTTP 200 returned | Fail if server returns 500 |
| **DEP-014** | Infrastructure Error Resilience | Controlled non-production test harness | Simulate database connectivity failure | API returns HTTP 500 without leaking stack traces | `{ "error": "Internal server error" }` | Fail if raw SQL or credentials leak |
| **DEP-015** | Secret Bundle Scoping | Production build complete | Search compiled JS assets in `.next/static` | Zero matches for `DATABASE_URL` or `CRON_SECRET` | Grep confirms 0 occurrences | Fail if secret appears in bundle |
| **DEP-016** | Production Build Verification | Source tree clean | Run `npm run build` | Turbopack compilation succeeds with exit code 0 | Clean build logs | Fail on build error |
| **DEP-017** | Transport Encryption Verification | Production URL live | Inspect browser security details and TLS certificate | HTTPS enforced; valid TLS certificate | Valid TLS certificate signed by trusted CA | Fail on insecure HTTP |
| **DEP-018** | Automated External Triggering | External cron configured | Wait for scheduled interval (e.g. 5m) without manual action | Scheduled checks appear in database automatically | Check timestamp advanced automatically | Fail if no automated run occurs |

*Critical Safeguard for DEP-014:* Never intentionally revoke production database access. Infrastructure failure testing must be performed strictly within a local/test environment or controlled staging harness.

---

## 14. Security Verification Plan

Before release sign-off, verify the following security requirements:

1. **Zero Secret Leakage in Client Bundles:**
   - Inspect `.next/static` JavaScript chunks using text search for strings matching `DATABASE_URL` and `CRON_SECRET`. Must yield 0 results.
2. **Git Repository Hygiene:**
   - Verify `.env.local` is ignored via `git check-ignore .env.local`.
   - Verify zero uncommitted or committed `.env` files with credentials in Git history.
3. **Fail-Closed Cron Authorization:**
   - Request with missing `Authorization` header $\to$ HTTP 401.
   - Request with malformed `Authorization: Token xyz` $\to$ HTTP 401.
   - Request with invalid secret $\to$ HTTP 401.
   - Constant-time comparison verified via `crypto.timingSafeEqual()`.
4. **Sanitized Error Responses:**
   - Inbound bad requests or database errors must return generic JSON messages (`{ "error": "Internal server error" }`) rather than PostgreSQL error details or table names.
5. **HTTPS Transport:**
   - Verify plain HTTP requests to `http://<production-domain>` automatically redirect (HTTP 301/308) to `https://<production-domain>`.

---

## 15. Rollback Specification

If issues emerge post-deployment, execute the appropriate targeted rollback:

### 15.1 Application Code Regression
- **Action:** Open the Vercel Dashboard > Project > Deployments. Identify the previous stable deployment and select **"Promote to Production"**.
- **Result:** Instant edge routing cutover to the previous immutable build artifact within seconds.

### 15.2 Environment Variable Error
- **Action:** Correct the faulty variable (`DATABASE_URL` or `CRON_SECRET`) in Vercel Project Settings > Environment Variables, then click **Redeploy**.

### 15.3 Database Migration Failure
- **Action:** Since Phase 10 introduces zero schema changes, the database schema remains strictly backward-compatible. In the event of a damaged migration state, inspect `drizzle/` history and re-run migrations against a verified backup branch in Neon.

### 15.4 External Cron Malfunction
- **Action:**
  - If GitHub Actions workflow fails: Disable the workflow via GitHub Actions UI (`Disable workflow`).
  - If cron-job.org fails: Pause the job in the dashboard.
  - *Impact:* Manual dashboard monitoring remains 100% operational while the scheduler trigger is diagnosed.

---

## 16. Documentation Update Plan (Phase 10C)

Upon successful execution of the deployment sequence and passing the DEP-001 – DEP-018 verification suite, documentation will be updated to reflect verified facts:

### 16.1 Updates to `docs/DEPLOYMENT.md`
- Elevate Vercel + Neon + External Scheduler from "Compatible / Designed To Support" to **"Verified Production Deployment"**.
- Add the live production URL and verified cron schedule cadence.
- Document exact verification date and test suite results.

### 16.2 Updates to `README.md`
- Add live production demo badge and link (if public access is intended).
- Update status section to declare production deployment verified.

---

## 17. Release Gate

The deployment is considered complete and approved for production release only when all of the following gates pass:

- [ ] Production URL reachable over HTTPS with valid TLS certificate (`DEP-001`, `DEP-017`).
- [ ] Dashboard renders cleanly with zero console or hydration errors (`DEP-002`).
- [ ] Endpoints can be created, viewed, and deleted (`DEP-003`, `DEP-004`).
- [ ] Manual health checks execute live HTTP probes against external APIs (`DEP-005`).
- [ ] Check observations persist to Neon PostgreSQL (`DEP-006`).
- [ ] Metrics (uptime, avg latency, P95) calculate correctly and handle nulls gracefully (`DEP-007`).
- [ ] Latency chart renders Recharts visual curves (`DEP-008`).
- [ ] Unauthorized cron requests are rejected with 401 (`DEP-009`).
- [ ] Authenticated cron requests execute scheduler worker pool and return summary (`DEP-010`, `DEP-011`).
- [ ] Scheduled checks persist to database (`DEP-012`).
- [ ] Third-party target failures are classified as `DOWN` without server 500 errors (`DEP-013`).
- [ ] Database failure resilience verified safely in test harness (`DEP-014`).
- [ ] Production bundles verified free of server secrets (`DEP-015`).
- [ ] External scheduler fires autonomously on schedule (`DEP-018`).
- [ ] Zero unexpected runtime code, schema, or package changes exist in the Git tree.

---

## 18. Non-Goals

The following activities are strictly prohibited in Phase 10:
- No changes to UI components, layout, or styling.
- No changes to REST API endpoints or request/response contracts.
- No changes to `db/schema.ts` or database tables.
- No new packages added to `package.json`.
- No user authentication or login system added to the dashboard.
- No alerting system (Slack/email/webhooks) added.
- No internal `setInterval` background daemon implemented.
- No synthetic checks or simulated metrics added to the database.

---

## 19. Phase 10C Handoff

Phase 10B Specification is complete. When transitioning to Phase 10C (Production Deployment Execution & Verification):
1. Review this document against operational requirements.
2. Confirm the selected external scheduler option (GitHub Actions or cron-job.org).
3. Proceed with Step 1 of the Deployment Sequence (Section 12).
