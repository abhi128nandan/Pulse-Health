# Phase 9B — Repository Professionalization Specification

**Project:** PulseCheck — API Monitoring & Observability Dashboard  
**Phase:** 9B — Repository Professionalization Specification  
**Author:** Senior Staff Software Engineer & Release Architect  
**Status:** DRAFT / APPROVED FOR PHASE 9C IMPLEMENTATION  
**Date:** 2026-10-02  

---

## 1. Objective

Translate the approved [Phase 9A Repository Professionalization Design](file:///d:/Pulse_Health/docs/REPOSITORY_PROFESSIONALIZATION_DESIGN.md) into an exact, implementation-ready specification for **Phase 9C**.

The objective of Phase 9C is to transform the PulseCheck repository from an internal engineering development workspace into a **clean, production-ready, open-source portfolio repository** suitable for public GitHub presentation, technical recruiter evaluation, and open-source contribution—without altering any runtime behavior, API contracts, database schemas, or test coverage.

---

## 2. Verified Current State

### 2.1 Git Status & Tracked Boundary
- **Tracked & Modified (Phase 8C frontend remediation):**
  - `app/page.tsx`
  - `components/add-endpoint-modal.tsx`
  - `components/delete-endpoint-modal.tsx`
  - `components/endpoint-mobile-card.tsx`
  - `components/endpoint-row.tsx`
  - `components/summary-card.tsx`
  - `components/system-overview.tsx`
  - `components/toast.tsx`
- **Untracked Production Code (Phase 7 deliverables):**
  - `app/api/cron/check/route.ts`
  - `services/scheduler.ts`
- **Untracked Test Suites (Phase 7 deliverables):**
  - `app/api/cron/check/route.test.ts`
  - `app/api/cron/check/route.reliability.test.ts`
  - `app/api/cron/check/route.deployment.test.ts`
  - `services/scheduler.test.ts`
  - `services/scheduler.reliability.test.ts`
  - `services/scheduler.integration.reliability.test.ts`
  - `services/scheduler.deployment.integration.test.ts`
  - `services/deployment.static.test.ts`
- **Tracked Documentation:**
  - `README.md` (frozen at Phase 1 roadmap)
  - `docs/UI_DESIGN.md`
  - `docs/UI_COMPONENT_SPEC.md`
- **Untracked Documentation (14 internal phase documents):**
  - `docs/SCHEDULING_DESIGN.md`
  - `docs/SCHEDULING_SPEC.md`
  - `docs/RELIABILITY_TESTING_DESIGN.md`
  - `docs/RELIABILITY_TESTING_SPEC.md`
  - `docs/DEPLOYMENT_SCHEDULING_DESIGN.md`
  - `docs/DEPLOYMENT_SCHEDULING_SPEC.md`
  - `docs/DEPLOYMENT_VERIFICATION_DESIGN.md`
  - `docs/DEPLOYMENT_VERIFICATION_SPEC.md`
  - `docs/DEPLOYMENT_VERIFICATION_FINAL_AUDIT.md`
  - `docs/PRODUCT_QA_DESIGN.md`
  - `docs/PRODUCT_QA_SPEC.md`
  - `docs/PHASE_8C_QA_REPORT.md`
  - `docs/FINAL_RELEASE_AUDIT_DESIGN.md`
  - `docs/REPOSITORY_PROFESSIONALIZATION_DESIGN.md`
- **Tooling & Config:**
  - `package.json` (Next.js 16.3.7, React 19.2.8, Drizzle ORM 0.45.3, pg 8.23.0, Zod 4.6.5, Recharts 3.10.1, Vitest 5.0.2, Tailwind CSS 4)
  - `AGENTS.md` (Next.js App Router agent configuration block)
  - `CLAUDE.md` (scaffolding reference pointer)
  - `.env.example` (clean template with placeholders)
  - `.gitignore` (properly ignores `.env`, `.env.local`, `.env.*.local`, node_modules, build outputs)

---

## 3. README Specification

The new `README.md` must replace the outdated Phase 1 roadmap and present the finished, verified software. It must be readable and understandable in **30–60 seconds**.

### 3.1 Required Sections & Content
1. **Title & Headline:**
   - `# PulseCheck`
   - Short, punchy summary: *"Lightweight, self-hosted API monitoring and observability dashboard. Probes HTTP endpoints, calculates rolling 24h reliability metrics, and coordinates external cron execution with bounded worker concurrency."*
   - Status indicators: TypeScript Strict, Vitest (198 passing tests), Next.js 16 (App Router), MIT License.
2. **Visual Preview (Screenshots):**
   - Links to 2 primary screenshots stored in `public/screenshots/`:
     - `dashboard-overview.png`: Main dashboard overview showing summary KPIs, search bar, status tabs, and endpoint table.
     - `endpoint-detail.png`: Detail view showing 24h metrics, Recharts timeseries with threshold reference line, and recent check history.
3. **The Problem & The Solution:**
   - Problem: Microservices and third-party APIs fail intermittently, degrade under load, or time out silently. Teams often lack lightweight observability without deploying complex, expensive APM agents.
   - Solution: PulseCheck provides an active health checking engine that verifies reachability, enforces strict timeout budgets, computes mathematical uptime and latency percentiles, and provides an operator dashboard.
4. **Key Features (Fact-Based):**
   - **Active Probing Engine:** Native HTTP/HTTPS checks measuring response latency via high-resolution timers (`performance.now()`).
   - **Strict Timeout Budget:** Enforces a 5000ms timeout using `AbortController` signal cancellation.
   - **Tiered Health Classification:** Differentiates `UP` (2xx/3xx within threshold), `DEGRADED` (2xx/3xx exceeding threshold), and `DOWN` (4xx/5xx, timeout, DNS failure, network error).
   - **Rolling 24h Telemetry:** Pure mathematical computation of Uptime %, Error Rate %, Average Latency (excluding failed checks), and Nearest-Rank P95 latency.
   - **Bounded Concurrency Scheduler:** Sliding worker pool capping concurrent active probes at $\le 5$ (`MAX_CONCURRENCY`), preventing local socket exhaustion.
   - **Process-Local Execution Guard:** Prevents overlapping scheduled runs within the same Node process.
   - **Developer-Focused UI:** Dark neutral technical aesthetic with real-time filtering, master/detail navigation, native cyclic focus trapping, and full responsiveness (1440px desktop down to 320px mobile).
5. **Architecture Diagram:**
   - Clean ASCII diagram illustrating the trigger, guard, scheduler, checker, database, and UI layers.
6. **Tech Stack:**
   - Framework: Next.js 16 (App Router, Turbopack, React 19)
   - Database & ORM: PostgreSQL (Neon serverless) with Drizzle ORM
   - Language: TypeScript (Strict mode)
   - Styling: Tailwind CSS 4
   - Visualization: Recharts 3
   - Testing: Vitest (198 tests across 13 test files)
7. **Mathematical Telemetry Rules:**
   - State the exact formulas used:
     - $\text{Uptime} = \frac{\text{UP} + \text{DEGRADED}}{\text{Total}} \times 100$
     - $\text{Error Rate} = \frac{\text{DOWN}}{\text{Total}} \times 100$
     - $\text{Average Latency} = \frac{\sum \text{latency of successful checks}}{\text{count of successful checks}}$
     - $\text{P95 Latency} = \text{Nearest Rank Index } \lceil 0.95 \times N \rceil - 1$
   - Explicit invariant: *Null latency (from timeouts or invalid URLs) is never treated as 0ms.*
8. **Local Quickstart:**
   - 4-step setup: Clone, `npm install`, configure `.env.local`, `npm run dev`.
   - Command reference: `npm test`, `npm run build`, `npm start`, `npm run lint`, `npm run db:migrate`.
9. **Environment Configuration:**
   - Table detailing `DATABASE_URL` and `CRON_SECRET`.
10. **Deployment Summary:**
    - Reference to `docs/DEPLOYMENT.md`. Brief summary of Vercel/Node hosting + external HTTP cron trigger (GitHub Actions, cron-job.org).
11. **Known Architectural Boundaries:**
    - Process-local execution guard (not a distributed lock).
    - External scheduler trigger dependency (no internal `setInterval`).
    - Query-level 50-check history retrieval limit.
    - Single-tenant dashboard.
12. **License:**
    - MIT License reference.

### 3.2 What Must NOT Appear in README
- No stale phrases like "Phase 1 Roadmap", "Planned Features", or "Actively under development".
- No exaggerated marketing terms: "enterprise-grade", "production-scale", "highly available", "distributed monitoring", "24/7 monitoring".
- No real database credentials, tokens, or personal hostnames.

### 3.3 README Claim Verification Protocol
Every technical capability asserted in `README.md` must be tied to a concrete verification step before publication in Phase 9C:

| Claim in README | Verification Mechanism in Phase 9C | Source of Truth |
| :--- | :--- | :--- |
| **"198 automated tests passing"** | Execute `npm test` and assert 100% passing across 13 test files. | Vitest test runner output. |
| **"Bounded worker concurrency <= 5"** | Reference verified sliding queue implementation in `services/scheduler.ts` and test `CONC-001` in `scheduler.deployment.integration.test.ts`. | `MAX_CONCURRENCY = 5` in `scheduler.ts`. |
| **"PostgreSQL persistence & cascade"** | Query live Neon database confirming row creation delta integrity and check deletion on endpoint removal. | `db/schema.ts` (`onDelete: 'cascade'`). |
| **"Real HTTP monitoring & timeouts"** | Verify `services/checker.ts` uses native `fetch`, `performance.now()`, and 5000ms `AbortController` timeout. | `services/checker.ts`. |
| **"Rolling 24h metrics & P95"** | Verify `services/metrics.ts` pure calculation functions using deterministic Dataset Alpha. | `services/metrics.test.ts`. |
| **"Production build passing"** | Execute `npm run build` and verify clean exit code 0. | Next.js Turbopack compiler. |
| **"Native cyclic focus trapping"** | Verify `Tab` and `Shift+Tab` cyclic containment in `components/add-endpoint-modal.tsx` and `components/delete-endpoint-modal.tsx`. | Modal component source code. |

---

## 4. Architecture Documentation Specification (`docs/ARCHITECTURE.md`)

Create `docs/ARCHITECTURE.md` as an authoritative, 2-page system overview for senior engineers and evaluators.

### 4.1 Required Sections
1. **System Overview & Design Goals:**
   - Lightweight, self-contained architecture avoiding external daemons or heavy message brokers.
2. **System Topology & Data Flow:**
   - ASCII diagram of external cron trigger, API routes, execution guard, worker pool, checker engine, PostgreSQL database, and dashboard UI.
3. **Probing & Health Classification Engine (`services/checker.ts`):**
   - High-resolution timing via `performance.now()`.
   - 5000ms timeout budget using `AbortController`.
   - Classification matrix: `UP`, `DEGRADED`, `DOWN`.
   - Target failure isolation: Target 500s, DNS resolution failures, and timeouts are treated as monitoring outcomes, not platform exceptions.
4. **Persistence & Data Model (`db/schema.ts`):**
   - Tables: `endpoints` and `checks`.
   - Indexes: `checks_endpoint_id_checked_at_idx` for fast 24h timeseries queries.
   - Relational integrity: Foreign key constraint with `onDelete: 'cascade'`.
5. **Telemetry & Metrics Service (`services/metrics.ts`):**
   - Pure functions separating math from database queries.
   - Formulas: Uptime %, Error rate %, Average latency, Nearest-Rank P95.
   - Null latency guarantees.
6. **Scheduling & Concurrency Architecture (`services/scheduler.ts`):**
   - `MAX_CONCURRENCY = 5` sliding queue pull model.
   - Process-local execution guard (`acquireExecutionGuard`, `releaseExecutionGuard`).
   - Constant-time Bearer authentication (`crypto.timingSafeEqual`).
7. **Frontend Architecture (`app/page.tsx`, `components/`):**
   - Next.js App Router client component architecture.
   - Zero synthetic telemetry policy (`NO DATA` initial state).
   - Master/detail view state management with search and filter preservation.
   - Native cyclic focus trapping in modals (`AddEndpointModal`, `DeleteEndpointModal`).
   - Responsive layout adapting from 1440px desktop table to 375px mobile card stack.
8. **Architectural Trade-Offs & Known Boundaries:**
   - In-memory process guard vs. distributed lock.
   - External trigger model vs. long-running daemon.
   - Single-tenant scope.

---

## 5. API Documentation Specification (`docs/API.md`)

Create `docs/API.md` documenting all 7 REST API routes using the verified implementation as the single source of truth.

### 5.1 Route Specifications
| Route | Method | Auth | Request Body / Params | Success Status & Body | Error Responses | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/endpoints` | `GET` | None | None | `200 OK`<br>`Endpoint[]` | `500 Internal Server Error` | Returns registered endpoints. Does not include `latestCheck`. |
| `/api/endpoints` | `POST` | None | JSON: `{ name, url, latencyThresholdMs? }` | `201 Created`<br>`Endpoint` | `400 Bad Request`<br>`409 Conflict`<br>`500 Internal Server Error` | Validates name (1-100), URL (HTTP/HTTPS, max 2048), threshold (1-60000). 409 on duplicate URL. |
| `/api/endpoints/:id` | `DELETE` | None | Path param: `id` (integer) | `204 No Content`<br>*(Empty body)* | `400 Bad Request`<br>`404 Not Found`<br>`500 Internal Server Error` | Cascades deletion to all check records. |
| `/api/endpoints/:id/check` | `POST` | None | Path param: `id` (integer) | `200 OK`<br>`{ endpoint, check }` | `400 Bad Request`<br>`404 Not Found`<br>`500 Internal Server Error` | Executes on-demand probe. Target failures return 200 with `check.status = 'down'`. |
| `/api/endpoints/:id/metrics` | `GET` | None | Path param: `id` (integer) | `200 OK`<br>`EndpointMetrics` | `400 Bad Request`<br>`404 Not Found`<br>`500 Internal Server Error` | Rolling 24-hour availability and latency metrics. Zero checks return `--` equivalents. |
| `/api/endpoints/:id/history` | `GET` | None | Path: `id`<br>Query: `limit?` (default 50, max 100) | `200 OK`<br>`Check[]` | `400 Bad Request`<br>`404 Not Found`<br>`500 Internal Server Error` | Returns recent checks ordered newest first. |
| `/api/cron/check` | `POST` | Bearer Token (`CRON_SECRET`) | Header: `Authorization: Bearer <token>` | `200 OK`<br>`SchedulerRunSummary` OR `{ success: true, skipped: true, reason: string }` | `401 Unauthorized`<br>`405 Method Not Allowed`<br>`500 Internal Server Error` | Constant-time auth. Skips overlapping runs with 200 OK. 500 if server `CRON_SECRET` is unset. |

---

## 6. Deployment Documentation Specification (`docs/DEPLOYMENT.md`)

Create `docs/DEPLOYMENT.md` providing an operational runbook for deploying PulseCheck to production.

### 6.1 Required Sections
1. **Deployment Architecture:**
   - Stateless Next.js App Router application hosted on Vercel or any Node.js container runtime.
   - Managed PostgreSQL database (e.g. Neon serverless).
   - External HTTPS cron dispatcher triggering `/api/cron/check`.
2. **Prerequisites:**
   - Node.js >= 20.x, npm >= 10.x.
   - PostgreSQL instance with connection string supporting SSL (`sslmode=require`).
3. **Environment Variables:**
   - `DATABASE_URL`: Full PostgreSQL connection string.
   - `CRON_SECRET`: High-entropy secret string for securing the cron trigger.
4. **Database Provisioning & Migrations:**
   - Step-by-step instructions: `npm run db:migrate`.
5. **Production Build & Verification:**
   - Commands: `npm run build`, `npm start -p 3100`.
6. **Setting Up Scheduled Monitoring:**
   - Configuring external schedulers (GitHub Actions cron workflow, cron-job.org, or cloud scheduler):
     - HTTP Method: `POST`
     - URL: `https://<your-domain>/api/cron/check`
     - Header: `Authorization: Bearer <CRON_SECRET>`
     - Cadence: Every 1 to 5 minutes.
   - Concrete example of a `.github/workflows/monitor-cron.yml` configuration.
7. **Post-Deployment Verification:**
   - Validating dashboard mount, manual endpoint creation, manual probe, and scheduled check execution.
8. **Operational Boundaries & Security Notes:**
   - Single-process execution guard notes.
   - Recommendation to configure HTTPS only in production.

---

## 7. License Specification

- **License Type:** MIT License (Standard, permissive open-source license).
- **Target File:** `LICENSE` (placed at repository root).
- **Copyright Statement:** `Copyright (c) 2026 PulseCheck Contributors`
- **Text:** Standard OSI-approved MIT text.

---

## 8. Public vs Internal Documentation Classification

| Document Path | Classification | Recommended Action in Phase 9C | Justification |
| :--- | :--- | :--- | :--- |
| `README.md` | **PUBLIC** | Rewrite in Phase 9C | Primary portfolio landing page. |
| `docs/ARCHITECTURE.md` | **PUBLIC** | Create in Phase 9C | Essential technical architecture guide. |
| `docs/API.md` | **PUBLIC** | Create in Phase 9C | Complete developer API contract reference. |
| `docs/DEPLOYMENT.md` | **PUBLIC** | Create in Phase 9C | Production runbook and cron setup guide. |
| `docs/archive/` | **ARCHIVE** | Create directory in Phase 9C | Preserves historical development trajectory. |
| `docs/SCHEDULING_DESIGN.md` | **ARCHIVE** | Move to `docs/archive/` | Internal Phase 7 design spec. |
| `docs/SCHEDULING_SPEC.md` | **ARCHIVE** | Move to `docs/archive/` | Internal Phase 7 implementation spec. |
| `docs/RELIABILITY_TESTING_DESIGN.md` | **ARCHIVE** | Move to `docs/archive/` | Internal Phase 7 reliability design. |
| `docs/RELIABILITY_TESTING_SPEC.md` | **ARCHIVE** | Move to `docs/archive/` | Internal Phase 7 reliability spec. |
| `docs/DEPLOYMENT_SCHEDULING_DESIGN.md` | **ARCHIVE** | Move to `docs/archive/` | Internal Phase 7E architecture design. |
| `docs/DEPLOYMENT_SCHEDULING_SPEC.md` | **ARCHIVE** | Move to `docs/archive/` | Internal Phase 7E implementation spec. |
| `docs/DEPLOYMENT_VERIFICATION_DESIGN.md` | **ARCHIVE** | Move to `docs/archive/` | Internal Phase 7E-D verification design. |
| `docs/DEPLOYMENT_VERIFICATION_SPEC.md` | **ARCHIVE** | Move to `docs/archive/` | Internal Phase 7E-D verification spec. |
| `docs/DEPLOYMENT_VERIFICATION_FINAL_AUDIT.md` | **ARCHIVE** | Move to `docs/archive/` | Internal Phase 7E-D audit report. |
| `docs/UI_DESIGN.md` | **ARCHIVE** | Move to `docs/archive/` | Internal Phase 6 UI design spec. |
| `docs/UI_COMPONENT_SPEC.md` | **ARCHIVE** | Move to `docs/archive/` | Internal Phase 6 component spec. |
| `docs/PRODUCT_QA_DESIGN.md` | **ARCHIVE** | Move to `docs/archive/` | Internal Phase 8A QA design spec. |
| `docs/PRODUCT_QA_SPEC.md` | **ARCHIVE** | Move to `docs/archive/` | Internal Phase 8B QA test spec. |
| `docs/PHASE_8C_QA_REPORT.md` | **ARCHIVE** | Move to `docs/archive/` | Internal Phase 8C QA execution report. |
| `docs/FINAL_RELEASE_AUDIT_DESIGN.md` | **ARCHIVE** | Move to `docs/archive/` | Internal Phase 8D audit strategy. |
| `docs/REPOSITORY_PROFESSIONALIZATION_DESIGN.md` | **ARCHIVE** | Move to `docs/archive/` | Internal Phase 9A professionalization plan. |
| `docs/REPOSITORY_PROFESSIONALIZATION_SPEC.md` | **ARCHIVE** | Move to `docs/archive/` (after 9C) | Internal Phase 9B professionalization spec. |

---

## 9. Git Tracking Specification

The following untracked production and test files must be tracked in Git during Phase 9C:

| Path | Action in Phase 9C | Purpose |
| :--- | :--- | :--- |
| `app/api/cron/check/route.ts` | **TRACK** | Core production cron endpoint. |
| `app/api/cron/check/route.test.ts` | **TRACK** | Unit test suite for cron authentication and execution. |
| `app/api/cron/check/route.reliability.test.ts` | **TRACK** | Reliability test suite for boundary conditions and crashes. |
| `app/api/cron/check/route.deployment.test.ts` | **TRACK** | Deployment compatibility test suite. |
| `services/scheduler.ts` | **TRACK** | Core production scheduler engine with worker pool. |
| `services/scheduler.test.ts` | **TRACK** | Unit test suite for scheduler worker pool. |
| `services/scheduler.reliability.test.ts` | **TRACK** | Reliability test suite for concurrency and failure isolation. |
| `services/scheduler.integration.reliability.test.ts` | **TRACK** | Integration reliability test suite with real database queries. |
| `services/scheduler.deployment.integration.test.ts` | **TRACK** | Full deployment integration suite with real HTTP fixtures. |
| `services/deployment.static.test.ts` | **TRACK** | Static invariant test suite. |

---

## 10. Development Debris Specification

| Path | Current Purpose | Recommended Action in Phase 9C | Reason |
| :--- | :--- | :--- | :--- |
| `CLAUDE.md` | 1-line tool pointer (`@AGENTS.md`) | **REMOVE** | Non-essential scaffolding file; adds clutter to root. |
| `components/.gitkeep` | Empty folder placeholder | **REMOVE** | `components/` contains 17 active `.tsx` files; `.gitkeep` is redundant. |
| `types/.gitkeep` | Empty folder placeholder | **REMOVE** | `types/` contains `dashboard.ts`; `.gitkeep` is redundant. |
| `lib/.gitkeep` | Empty folder placeholder | **REMOVE** | `lib/` has no code; can be cleanly pruned or kept if preferred. |
| `AGENTS.md` | Next.js agent instruction block | **RETAIN** | Auto-managed by `next dev`; required by Next.js App Router tooling. |

---

## 11. Security Requirements

Phase 9C must verify the following security rules prior to completion:
1. **Zero Secret Tracking:** `.env` and `.env.local` must remain in `.gitignore` and must never be staged or committed.
2. **Template Hygiene:** `.env.example` must contain only empty placeholder keys (`DATABASE_URL=`, `CRON_SECRET=`).
3. **No Hardcoded Credentials:** No actual PostgreSQL connection strings, database passwords, API tokens, or bearer secrets may appear in `README.md`, `docs/`, or any code comment.
4. **Log Sanitization:** Documentation must verify that server logs never print authorization headers or secret values.

---

## 12. Screenshot Specification

For the target `README.md`, capture 2–3 clean, authentic screenshots in `public/screenshots/`:

| File Name | Viewport | Target Subject | Demonstrates |
| :--- | :--- | :--- | :--- |
| `dashboard-overview.png` | 1440px | Dashboard home | 4 summary KPI cards, search toolbar, filter tabs, endpoint rows with status badges and latency indicators. |
| `endpoint-detail.png` | 1440px | Endpoint detail | 24h rolling metrics grid, Recharts latency curve with 500ms threshold line, and 50-row history table. |
| `mobile-responsive.png` | 375px | Mobile portrait | Responsive layout adaptation: summary cards grid and `EndpointMobileCard` stack without horizontal overflow. |

---

## 13. GitHub Presentation Specification

- **Repository Title:** `PulseCheck`
- **Short Tagline:** "Lightweight, self-hosted API monitoring & observability dashboard with automated health checks, rolling 24h metrics, and external cron scheduling."
- **Topics:** `api-monitoring`, `observability`, `uptime-monitor`, `nextjs`, `typescript`, `postgresql`, `drizzle-orm`, `recharts`, `tailwindcss`, `health-check`
- **Badges (Minimal & Verifiable):**
  - Next.js 16 (App Router)
  - TypeScript (Strict Mode)
  - Tests (198 Passing)
  - License (MIT)

---

## 14. Phase 9C Allowed Changes

Phase 9C is strictly permitted to modify or create:
- `README.md` (rewrite for portfolio presentation)
- `LICENSE` (create MIT license)
- `docs/ARCHITECTURE.md` (create architecture guide)
- `docs/API.md` (create API contract reference)
- `docs/DEPLOYMENT.md` (create deployment guide)
- `docs/archive/**` (create directory and move historical phase documents)
- `public/screenshots/**` (place authentic screenshot assets)
- Track existing files: `app/api/cron/**`, `services/scheduler*`, `services/deployment.static.test.ts`
- Remove development debris: `CLAUDE.md`, redundant `.gitkeep` files
- `.gitignore` (only if necessary to maintain secret isolation)

---

## 15. Phase 9C Forbidden Changes

Phase 9C is **strictly prohibited** from:
- Modifying application logic in `app/page.tsx`, `components/*.tsx`, or `app/api/endpoints/**`.
- Modifying probing, persistence, metrics, or scheduler logic in `services/*.ts`.
- Modifying database schema in `db/schema.ts` or generating new Drizzle migrations.
- Installing new dependencies or modifying `package.json` / `package-lock.json`.
- Modifying existing test assertion logic or deleting test suites.
- Fabricating mock telemetry in production UI or tests.
- Committing credentials or deploying the application.

---

## 16. Implementation Order for Phase 9C

1. **Step 1 — Baseline Verification:**
   - Execute `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build` to confirm clean starting state.
2. **Step 2 — Scaffold Cleanup:**
   - Remove `CLAUDE.md` and redundant `.gitkeep` files.
3. **Step 3 — Documentation Archive Consolidation:**
   - Create `docs/archive/` and move the 15 internal phase markdown files into it.
4. **Step 4 — Author Public Documentation:**
   - Create `docs/ARCHITECTURE.md`.
   - Create `docs/API.md`.
   - Create `docs/DEPLOYMENT.md`.
5. **Step 5 — Author License:**
   - Create `LICENSE` (MIT).
6. **Step 6 — Author README:**
   - Rewrite `README.md` following the Section 3 specification.
7. **Step 7 — Screenshot Placement:**
   - Place dashboard screenshots in `public/screenshots/` and link in README.
8. **Step 8 — Full Toolchain Re-verification:**
   - Run `npm test` (verify 198/198 passing).
   - Run `npx tsc --noEmit` (verify 0 errors).
   - Run `npm run lint` (verify 0 warnings).
   - Run `npm run build` (verify clean production build).
9. **Step 9 — Git Boundary Audit:**
   - Run `git status --short` and `git diff --name-only` to ensure zero forbidden files were altered.

---

## 17. Acceptance Criteria for Phase 9C

Phase 9C will be marked **PASS** if and only if:
- [ ] `README.md` accurately describes the finished software; zero mentions of "Phase 1 current" or unverified claims.
- [ ] `LICENSE` is present with valid MIT terms.
- [ ] `docs/ARCHITECTURE.md`, `docs/API.md`, and `docs/DEPLOYMENT.md` are present, accurate, and sourced from actual code.
- [ ] `docs/archive/` cleanly houses the internal phase specifications without deleting development history.
- [ ] Untracked production files (`app/api/cron/**`, `services/scheduler*`, test suites) are staged/tracked.
- [ ] Development debris (`CLAUDE.md`, redundant `.gitkeep`) is pruned.
- [ ] Zero secret exposure across the entire repository.
- [ ] Zero production business logic, database schema, or API contracts were modified.
- [ ] Vitest suite passes 100% ($\ge 198$ tests passing).
- [ ] TypeScript strict mode compiles with 0 errors.
- [ ] ESLint reports 0 warnings and 0 errors.
- [ ] Next.js production build succeeds with exit code 0.

---

## 18. Phase 9C Handoff

With the completion of this specification, Phase 9B is complete. The project is prepared to proceed to **Phase 9C (Repository Professionalization Implementation)** upon review and approval.
