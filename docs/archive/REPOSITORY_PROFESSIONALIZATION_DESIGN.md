# Phase 9A — Repository Professionalization Design

**Project:** PulseCheck — API Monitoring & Observability Dashboard  
**Phase:** 9A — Repository Professionalization & Deployment Preparation Design  
**Author:** Senior Staff Software Engineer & Repository/Release Architect  
**Status:** DRAFT / APPROVED FOR IMPLEMENTATION (Phase 9B)  
**Date:** 2026-10-02  

---

## 1. Executive Summary

PulseCheck has completed core functional development, HTTP probing engine implementation, PostgreSQL persistence, mathematical telemetry computation, external cron scheduling with bounded worker concurrency ($\le 5$), deployment verification, and comprehensive product QA (`QA-001` through `QA-050` verified in Phase 8C with 198/198 passing automated tests).

However, the current repository reflects an **internal iterative engineering trajectory** rather than a **polished, public-facing open-source software product**. Specifically:
- `README.md` is frozen at Phase 1 ("Phase 1 — Foundation (Current)"), describing planned features rather than the completed, working software.
- The root and `docs/` directories contain 15 verbose internal design specs, prompt engineering records, and audit reports that obscure the product's actual architecture and make the repository resemble an AI agent trajectory rather than a shipping software project.
- There is no `LICENSE` file.
- The core public documentation set (`docs/ARCHITECTURE.md`, `docs/API.md`, `docs/DEPLOYMENT.md`) is missing.
- Production code for scheduled checks (`services/scheduler.ts` and `app/api/cron/`) remains untracked in Git alongside extensive reliability test suites.

This document establishes the strategic, non-destructive plan for **Phase 9B**, preparing PulseCheck for public GitHub presentation, technical recruiter evaluation, open-source review, and cloud deployment.

---

## 2. Current Repository Assessment

Evaluating the repository across four professional lenses:

### 2.1 Senior Software Engineer Lens
- **Strengths:** 
  - Strict TypeScript configuration (`tsconfig.json`).
  - Robust database schema with Drizzle ORM and foreign key `ON DELETE CASCADE`.
  - Pure metrics functions separating domain math from I/O (`services/metrics.ts`).
  - Worker pool sliding queue with hard concurrency bound ($\le 5$).
  - Fail-closed constant-time authentication (`crypto.timingSafeEqual`).
  - 100% automated test pass rate across 13 test files (198 tests).
- **Weaknesses:**
  - 15 internal design and specification documents in `docs/` create high cognitive load and conceal the system's actual interfaces.
  - Development scaffolding files (`AGENTS.md`, `CLAUDE.md`, `.gitkeep` placeholders) remain scattered across the tree.

### 2.2 Technical Recruiter Lens
- **Strengths:** High-signal full-stack engineering stack: Next.js 16 (App Router), React 19, TypeScript, PostgreSQL (Neon), Tailwind CSS, Vitest.
- **Weaknesses:**
  - A recruiter skimming `README.md` in 30 seconds sees "Planned Features" and "Phase 1 Roadmap", incorrectly concluding the project is an unfinished scaffold.
  - No visual screenshots of the responsive dark-neutral dashboard, metrics gauges, or Recharts latency curves.

### 2.3 GitHub Reviewer / Open-Source Contributor Lens
- **Strengths:** Standard npm scripts (`npm test`, `npm run dev`, `npm run build`, `npm run lint`). Clean `.env.example`.
- **Weaknesses:**
  - No `LICENSE` (defaults to all rights reserved, preventing reuse or contribution).
  - No concise API documentation detailing request/response shapes for endpoints or cron triggers.
  - No architectural overview explaining the relationship between the external cron trigger, execution guard, and checker engine.

---

## 3. Repository Structure Audit

### 3.1 Current Directory Layout
```
Pulse_Health/
├── .env.example
├── .gitignore
├── AGENTS.md                         # Next.js agent rule file (auto-generated)
├── CLAUDE.md                         # Reference pointer file
├── README.md                         # Outdated Phase 1 roadmap document
├── package.json
├── package-lock.json
├── tsconfig.json
├── eslint.config.mjs
├── next.config.ts
├── postcss.config.mjs
├── drizzle.config.ts
├── app/
│   ├── api/
│   │   ├── cron/check/               # [UNTRACKED] Cron trigger route & tests
│   │   └── endpoints/                # REST API routes & tests
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                      # Dashboard client component
├── components/                       # 17 UI components (tables, modals, charts)
├── db/                               # PostgreSQL connection & Drizzle schema
├── drizzle/                          # Migration SQL & journal metadata
├── lib/                              # Empty directory (.gitkeep)
├── public/                           # Default Next.js SVGs (vercel.svg, next.svg, etc.)
├── services/                         # Core engines + scheduler [UNTRACKED]
├── types/                            # Domain TypeScript types
└── docs/                             # 15 internal phase specs, designs & audits
```

### 3.2 Audit Findings
1. **Critical Source Tracking Gap:** `app/api/cron/check/` and `services/scheduler.ts` (along with its 5 reliability and deployment test suites) are currently untracked in Git. These represent vital Phase 7 production capabilities that must be tracked.
2. **Phase Documentation Overload:** 15 markdown files totaling over 480KB exist in `docs/`. While invaluable for development history, they should not clutter the primary documentation path of a clean GitHub repository.
3. **Empty Scaffolding:** `lib/.gitkeep` and `components/.gitkeep` are unnecessary remnants of initial project generation.
4. **Generic Public Assets:** `public/` contains standard Next.js template SVGs (`vercel.svg`, `next.svg`, `globe.svg`) rather than PulseCheck branding or dashboard demo media.

---

## 4. Public vs Internal Artifact Classification

| Path | Current Purpose | Classification | Recommendation | Justification / Impact |
| :--- | :--- | :--- | :--- | :--- |
| `app/page.tsx`, `app/layout.tsx` | Core Next.js UI | **A. KEEP PUBLIC** | Retain | Essential product frontend. |
| `app/api/endpoints/**` | REST APIs for endpoints, metrics, history | **A. KEEP PUBLIC** | Retain | Core public API surface. |
| `app/api/cron/check/**` | Cron check trigger & test suites | **A. KEEP PUBLIC** | Stage & Track | Production scheduler entrypoint; currently untracked. |
| `components/*.tsx` | 17 Dashboard components | **A. KEEP PUBLIC** | Retain | UI component architecture. |
| `services/checker.ts`, `services/monitor.ts`, `services/metrics.ts` | Probing, persistence, and telemetry services | **A. KEEP PUBLIC** | Retain | Core business logic and pure math. |
| `services/scheduler.ts` | Concurrency worker pool & guard | **A. KEEP PUBLIC** | Stage & Track | Production scheduler; currently untracked. |
| `services/*.test.ts` | Unit, integration & reliability tests | **A. KEEP PUBLIC** | Stage & Track | Proves reliability invariants (198 tests). |
| `db/schema.ts`, `db/index.ts` | Neon PostgreSQL schema & client | **A. KEEP PUBLIC** | Retain | Database data model and relations. |
| `drizzle/**` | SQL migrations & metadata | **A. KEEP PUBLIC** | Retain | Reproducible database schema migrations. |
| `package.json`, `package-lock.json` | Dependencies & build scripts | **A. KEEP PUBLIC** | Retain | Standard npm package definitions. |
| `.env.example` | Template for environment configuration | **A. KEEP PUBLIC** | Retain | Essential setup documentation without secrets. |
| `.gitignore` | Build and secret ignore patterns | **A. KEEP PUBLIC** | Retain & Audit | Protects against secret commits. |
| `README.md` | Top-level project landing page | **B. KEEP BUT CONSOLIDATE** | Rewrite in Phase 9B | Currently describes Phase 1 roadmap; rewrite as finished product showcase. |
| `docs/UI_DESIGN.md`, `docs/UI_COMPONENT_SPEC.md` | Phase 6 Design & Component Specs | **C. MOVE TO INTERNAL/ARCHIVE** | Move to `docs/archive/` or internal | Internal historical specs; superseded by implementation. |
| `docs/SCHEDULING_*.md`, `docs/DEPLOYMENT_*.md` | Phase 7 Architecture & Verification Specs | **C. MOVE TO INTERNAL/ARCHIVE** | Move to `docs/archive/` or internal | Detailed engineering trajectory; should not clutter top-level docs. |
| `docs/PRODUCT_QA_*.md`, `docs/PHASE_8C_QA_REPORT.md`, `docs/FINAL_RELEASE_AUDIT_DESIGN.md` | Phase 8 QA & Audit Reports | **C. MOVE TO INTERNAL/ARCHIVE** | Move to `docs/archive/` or internal | Exhaustive QA matrices; keep in archive to demonstrate rigor without cluttering. |
| `docs/ARCHITECTURE.md` | System Architecture (High-level) | **A. KEEP PUBLIC (NEW)** | Create in Phase 9B | Clean, unified 2-page architecture summary for external engineers. |
| `docs/API.md` | API Reference & Contracts | **A. KEEP PUBLIC (NEW)** | Create in Phase 9B | Clean OpenAPI-style contract reference for developers. |
| `docs/DEPLOYMENT.md` | Production Deployment Guide | **A. KEEP PUBLIC (NEW)** | Create in Phase 9B | Step-by-step Neon + Vercel + Cron setup guide. |
| `LICENSE` | Open-source MIT license | **A. KEEP PUBLIC (NEW)** | Create in Phase 9B | Standard OSS permissiveness for portfolio code. |
| `AGENTS.md` | Next.js agent instruction block | **D. REMOVE IF UNNECESSARY** | Retain in repo | Auto-regenerated by Next.js App Router compiler; retain cleanly. |
| `CLAUDE.md` | 1-line tool pointer (`@AGENTS.md`) | **D. REMOVE IF UNNECESSARY** | Remove in Phase 9B | Scaffolding artifact that adds no engineering value to public GitHub repo. |
| `lib/.gitkeep`, `types/.gitkeep`, `components/.gitkeep` | Empty folder placeholders | **D. REMOVE IF UNNECESSARY** | Remove in Phase 9B | Folders are now populated or unused. |
| `.env.local`, `.env` | Local secrets (`DATABASE_URL`, `CRON_SECRET`) | **E. MUST NEVER BE COMMITTED** | Strictly Ignored | Prevent credential leakage. |

---

## 5. Target Professional Repository Structure

```
PulseCheck/
├── app/
│   ├── api/
│   │   ├── cron/check/               # Cron check route & test suites
│   │   └── endpoints/                # REST endpoints, metrics, history routes & tests
│   ├── favicon.ico
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                      # Dashboard root page
├── components/                       # 17 focused React UI components
├── db/
│   ├── index.ts                      # Drizzle database client
│   └── schema.ts                     # Schema definition (endpoints, checks, relations)
├── docs/
│   ├── ARCHITECTURE.md               # Clean, high-level system architecture
│   ├── API.md                        # Complete REST API reference
│   ├── DEPLOYMENT.md                 # Production deployment & external cron guide
│   └── archive/                      # Historical engineering phase specs & audit logs
│       ├── DEPLOYMENT_SCHEDULING_DESIGN.md
│       ├── DEPLOYMENT_SCHEDULING_SPEC.md
│       ├── DEPLOYMENT_VERIFICATION_DESIGN.md
│       ├── DEPLOYMENT_VERIFICATION_FINAL_AUDIT.md
│       ├── DEPLOYMENT_VERIFICATION_SPEC.md
│       ├── FINAL_RELEASE_AUDIT_DESIGN.md
│       ├── PHASE_8C_QA_REPORT.md
│       ├── PRODUCT_QA_DESIGN.md
│       ├── PRODUCT_QA_SPEC.md
│       ├── RELIABILITY_TESTING_DESIGN.md
│       ├── RELIABILITY_TESTING_SPEC.md
│       ├── SCHEDULING_DESIGN.md
│       ├── SCHEDULING_SPEC.md
│       ├── UI_COMPONENT_SPEC.md
│       └── UI_DESIGN.md
├── drizzle/                          # Generated SQL migrations
├── public/                           # Production assets & demo screenshots
├── services/                         # Checker, monitor, metrics, and scheduler engines & tests
├── types/                            # Domain TypeScript definitions
├── .env.example                      # Documented environment template
├── .gitignore                        # Standard Node/Next.js/secret ignore rules
├── AGENTS.md                         # Next.js compiler agent rule
├── LICENSE                           # MIT License
├── README.md                         # Polished project showcase
├── drizzle.config.ts
├── eslint.config.mjs
├── next.config.ts
├── package-lock.json
├── package.json
├── postcss.config.mjs
└── tsconfig.json
```

---

## 6. README Professionalization Design

The target README must enable a reviewer or hiring manager to understand the project's engineering depth within **30–60 seconds**.

### 6.1 Section Breakdown

| Section | Required Contents | What Must NOT Be Included | Verification Prerequisite |
| :--- | :--- | :--- | :--- |
| **Header & Title** | `PulseCheck` title, 1-line value proposition ("Self-hosted API monitoring and observability dashboard with automated health probing, rolling 24h reliability metrics, and external cron scheduling"). Minimal build/test/license badges. | Marketing hyperbole, animated rainbow badges, unverified claims. | Passes Vitest, lint, and build. |
| **Live Demo & Preview** | Direct URL to live deployment (when deployed), clean screenshot of the dashboard in dark theme with active metrics and Recharts timeseries. | Broken links, mock Figma frames, local `localhost:3000` URLs. | Deployed instance or crisp verified capture. |
| **Problem & Solution** | The operational need: microservices and webhooks fail silently; teams need deterministic uptime tracking and latency visibility without heavyweight APM overhead. | Long personal anecdotes or AI generation prompts. | Matches product functional scope. |
| **Key Capabilities** | Bulleted list of actual features: Real HTTP/HTTPS probing, 5000ms timeout budget via AbortController, tiered health classification (`UP`, `DEGRADED`, `DOWN`), mathematical 24h rolling metrics (Uptime, Error rate, Average latency, P95), responsive dark-neutral UI, keyboard focus trapping. | Unimplemented features (e.g. SMS alerting, distributed worker clusters). | Validated against `services/*.ts`. |
| **Architecture** | Clean ASCII diagram depicting external cron $\rightarrow$ `POST /api/cron/check` $\rightarrow$ process execution guard $\rightarrow$ worker pool ($\le 5$ concurrency) $\rightarrow$ Neon PostgreSQL $\rightarrow$ Next.js App Router dashboard. | Vague cloud icons or inaccurate distributed lock claims. | Aligned with `services/scheduler.ts`. |
| **Tech Stack** | Next.js 16 (App Router), React 19, TypeScript strict mode, PostgreSQL (Neon serverless), Drizzle ORM, Tailwind CSS, Recharts, Vitest. | Libraries not installed in `package.json`. | Cross-checked with `package.json`. |
| **API Overview** | Summary table of routes (`/api/endpoints`, `/api/endpoints/:id/check`, `/api/endpoints/:id/metrics`, `/api/endpoints/:id/history`, `/api/cron/check`). | Full JSON dumps (link to `docs/API.md` instead). | Matches `app/api/**/route.ts`. |
| **Mathematical Precision** | Clear documentation of metrics formulas: Uptime %, Error Rate %, Average Latency (excluding failed/null checks), and Nearest-Rank P95 latency. Explicit note: "Null latency is never treated as 0ms". | Fabricated math or claims of AI-driven anomaly detection. | Matches `services/metrics.ts`. |
| **Local Setup** | 4-step quickstart: clone, `npm install`, configure `.env.local`, `npm run dev`, `npm test`. | Missing steps or assumptions about global package installs. | Verified in clean workspace. |
| **Deployment** | Clear explanation of production deployment: Vercel / Node server + external HTTP cron trigger (e.g. GitHub Actions, cron-job.org) hitting `/api/cron/check` with Bearer auth. | Claims of built-in internal cron daemons. | Aligned with Phase 7E verification. |
| **Known Architectural Boundaries** | Transparent engineering trade-offs: Process-local execution guard (not distributed lock), external trigger dependency, single-tenant UI, query-level 50-item history limit. | Calling intentional trade-offs "bugs". | Documented in `FINAL_RELEASE_AUDIT_DESIGN.md`. |
| **License** | MIT License citation. | Proprietary restrictions without cause. | Presence of `LICENSE` file. |

---

## 7. Documentation Strategy

To keep the repository clean and developer-centric, the public documentation is consolidated into **three authoritative guides** located in `docs/`:

```
docs/
├── ARCHITECTURE.md    # How PulseCheck works under the hood
├── API.md             # Complete REST API reference
├── DEPLOYMENT.md      # How to deploy to Neon + Vercel with scheduled monitoring
└── archive/           # Clean consolidation of internal development phase specs
```

### 7.1 `docs/ARCHITECTURE.md`
- **Purpose:** Provide an in-depth architectural breakdown for software engineers, tech leads, and architecture interviewers.
- **Intended Reader:** Senior engineers, technical evaluators, open-source contributors.
- **Required Sections:**
  1. System Topology & Data Flow.
  2. Health Checking & Probing Model (`AbortController`, `performance.now()`, classification logic).
  3. Database Schema & Relational Design (Drizzle ORM, indexes, cascade deletions).
  4. Telemetry & Metrics Calculation Engine (Uptime, error rate, nearest-rank P95 algorithm, null latency guarantees).
  5. Scheduling & Concurrency Architecture (`MAX_CONCURRENCY = 5`, sliding worker queue, in-memory execution guard, timing-safe auth).
  6. Frontend Design System (Dark-neutral technical palette, responsive layout breakpoints, zero synthetic telemetry).
  7. Accessibility Engineering (Native cyclic focus traps, visible focus rings, color-independent status badges).

### 7.2 `docs/API.md`
- **Purpose:** Serve as an authoritative API reference for developers integrating with PulseCheck or configuring external schedulers.
- **Intended Reader:** Frontend developers, DevOps engineers, external scheduler integrators.
- **Required Sections:**
  1. Authentication (`Authorization: Bearer <CRON_SECRET>` for cron; unauthenticated local REST routes).
  2. Endpoints:
     - `GET /api/endpoints` (List endpoints)
     - `POST /api/endpoints` (Register endpoint)
     - `DELETE /api/endpoints/:id` (Delete endpoint with cascading checks)
     - `POST /api/endpoints/:id/check` (Trigger on-demand manual probe)
     - `GET /api/endpoints/:id/metrics` (24h rolling reliability metrics)
     - `GET /api/endpoints/:id/history` (Recent check audit log, `limit` parameter)
     - `POST /api/cron/check` (Authenticated scheduled monitoring batch trigger)
  3. Request schemas, query parameters, response examples, and HTTP error codes (400, 401, 404, 405, 409, 500).

### 7.3 `docs/DEPLOYMENT.md`
- **Purpose:** Provide a zero-ambiguity deployment runbook for hosting PulseCheck in production.
- **Intended Reader:** DevOps engineers, cloud administrators, self-hosters.
- **Required Sections:**
  1. Prerequisites (Neon PostgreSQL account, Vercel/Node hosting, external cron runner).
  2. Environment Variables (`DATABASE_URL`, `CRON_SECRET`).
  3. Database Migrations (`npm run db:migrate`).
  4. Production Build & Start (`npm run build`, `npm start -p 3100`).
  5. Configuring Scheduled Monitoring (Setting up GitHub Actions cron, cron-job.org, or Vercel Cron to dispatch authenticated `POST /api/cron/check`).
  6. Monitoring Health Verification (Validating HTTP 200 responses and check persistence).

---

## 8. GitHub Presentation Strategy

### 8.1 Repository Metadata
- **Repository Name:** `PulseCheck` (or `pulsecheck`)
- **Description:** "Lightweight, self-hosted API monitoring and observability dashboard. Active HTTP health probing, rolling 24h reliability metrics, and external cron scheduling with bounded concurrency."
- **Website/Demo:** Deployed production URL (when live).
- **GitHub Topics:**  
  `api-monitoring`, `observability`, `uptime-monitor`, `nextjs`, `typescript`, `postgresql`, `drizzle-orm`, `recharts`, `tailwindcss`, `health-check`

### 8.2 Badges
Only high-signal, verifiable badges:
- **Build Status:** Passing (`npm run build`)
- **Tests:** Passing (`198 passed`)
- **TypeScript:** Strict Mode
- **License:** MIT

*(Avoid vanity badges like visitor counters, arbitrary code quality grades, or complex dynamic status shields that frequently break.)*

### 8.3 Screenshots & Media
Store visual assets cleanly in `public/screenshots/`:
- `dashboard-overview.png`: Desktop 1440px view showing summary cards, endpoint table, search filter, and status badges.
- `endpoint-detail.png`: Detail view showing 24h metrics, Recharts latency curve with threshold line, and history audit table.
- `mobile-responsive.png`: Responsive mobile portrait view (375px) demonstrating the `EndpointMobileCard` stack.

---

## 9. Security & Secret Hygiene Audit

### 9.1 Environment Secret Audit
- **Files Checked:** `.gitignore`, `.env.example`, `.env.local` (local only, untracked).
- **Audit Findings:**
  - `.gitignore` explicitly ignores `.env`, `.env.local`, and `.env.*.local`.
  - `.env.example` contains only empty placeholder keys (`DATABASE_URL=`, `CRON_SECRET=`).
  - No secret values, Neon connection strings, database passwords, or bearer tokens exist in any tracked repository file or documentation document.
  - Runtime code uses `crypto.timingSafeEqual` over buffers to prevent timing side-channel attacks on `CRON_SECRET`.
  - Client API responses sanitize database exceptions and return generic internal error messages without leaking table names or stack traces.

### 9.2 Requirements for Public Release
- Confirm `.env.local` remains untracked.
- Verify `git status` before any staging operation to guarantee zero credential files are staged.
- Ensure all example commands in `README.md` and `docs/DEPLOYMENT.md` use placeholder tokens (`your-cron-secret-here`, `postgresql://user:pass@host/db`).

---

## 10. Git Hygiene Assessment

### 10.1 Working Tree Status
- **Modified Tracked Files:** 8 frontend files from Phase 8C remediation (`app/page.tsx`, `components/add-endpoint-modal.tsx`, `components/delete-endpoint-modal.tsx`, `components/endpoint-mobile-card.tsx`, `components/endpoint-row.tsx`, `components/summary-card.tsx`, `components/system-overview.tsx`, `components/toast.tsx`).
- **Untracked Production Files:**
  - `app/api/cron/check/` (Cron route handler and 3 comprehensive test suites).
  - `services/scheduler.ts` (Core scheduler engine).
  - `services/scheduler.*.test.ts` (Scheduler reliability and deployment integration tests).
  - `services/deployment.static.test.ts` (Static deployment test).
- **Untracked Documentation:**
  - 15 internal phase markdown documents in `docs/`.

### 10.2 Recommendations for Phase 9B
1. **Stage & Commit Core Functionality:** Group Phase 8C frontend accessibility/focus fixes and Phase 7 scheduler/cron files into clean, professional semantic Git commits:
   - `feat(scheduler): add external cron endpoint and bounded worker pool`
   - `test(reliability): add concurrency, failure isolation, and deployment test suites`
   - `fix(ui): improve keyboard accessibility, focus trapping, and error handling`
2. **Consolidate Internal Docs:** Move internal phase markdown files to `docs/archive/` so that the Git tree presents clean, customer-facing documentation at the top level while preserving development history.
3. **Remove Scaffolding:** Delete unused `.gitkeep` files and `CLAUDE.md`.

---

## 11. Deployment Preparation Requirements

Before deploying PulseCheck to production, the repository must clearly define:

| Requirement | Implementation State | Documentation Location |
| :--- | :--- | :--- |
| **Build Command** | `npm run build` (Next.js Turbopack compiler) | `package.json`, `README.md`, `docs/DEPLOYMENT.md` |
| **Start Command** | `npm start` (Next.js production runtime) | `package.json`, `README.md`, `docs/DEPLOYMENT.md` |
| **Node Version** | Node.js `>= 20.x` (LTS recommended) | `package.json` (`engines`), `README.md` |
| **Database Config** | `DATABASE_URL` with SSL mode (`sslmode=require`) | `.env.example`, `docs/DEPLOYMENT.md` |
| **Cron Secret** | `CRON_SECRET` for securing `/api/cron/check` | `.env.example`, `docs/DEPLOYMENT.md` |
| **Database Migrations** | `npm run db:migrate` (Drizzle Kit migration runner) | `package.json`, `docs/DEPLOYMENT.md` |
| **Scheduled Worker** | External HTTP POST dispatcher calling `/api/cron/check` every 1–5 min | `docs/DEPLOYMENT.md`, `docs/ARCHITECTURE.md` |

---

## 12. Portfolio Positioning

PulseCheck demonstrates several critical software engineering proficiencies that should be highlighted in portfolio presentation:

1. **Systems Reliability & Concurrency Control:**
   - Rather than naive unbounded `Promise.all()`, PulseCheck implements a sliding worker queue capping concurrent probes at $\le 5$ (`MAX_CONCURRENCY`), preventing socket starvation and local file-descriptor exhaustion.
2. **Deterministic Mathematical Telemetry:**
   - Metrics are computed using pure mathematical functions (`services/metrics.ts`) with strict invariants: uptime percentage, error rate, average latency (strictly excluding timeouts and failed probes), and nearest-rank 95th percentile (P95). Null latency is never treated as 0ms.
3. **Resilient Failure Classification:**
   - Differentiates target HTTP failures (4xx/5xx, timeouts, DNS unresolvable) from platform/infrastructure failures (database write errors). Target failures are recorded as completed monitoring outcomes (`status: 'down'`) without crashing the scheduler loop.
4. **Accessible, Zero-Dependency Frontend Engineering:**
   - Custom native cyclic focus trapping (`Tab`/`Shift+Tab`) implemented without external heavyweight dialog libraries. Fully responsive from 1440px desktop to 320px narrow mobile.
5. **Deployment Compatibility:**
   - Avoids long-running in-memory daemons that fail in serverless/container environments. Uses a stateless HTTP cron endpoint protected by constant-time bearer authentication and an in-memory execution guard.

---

## 13. Proposed Change List for Phase 9B

| ID | Path | Change | Reason | Risk | Phase / Priority |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **CHG-01** | `README.md` | Rewrite to reflect completed product showcase | Replace outdated Phase 1 roadmap with working product documentation. | Low | **Phase 9B (Required)** |
| **CHG-02** | `LICENSE` | Add standard MIT License file | Enable open-source use and legal clarity. | Low | **Phase 9B (Required)** |
| **CHG-03** | `docs/ARCHITECTURE.md` | Create unified 2-page system architecture guide | Provide clear engineering overview for reviewers. | Low | **Phase 9B (Required)** |
| **CHG-04** | `docs/API.md` | Create REST API reference documentation | Document request/response contracts for endpoints & cron. | Low | **Phase 9B (Required)** |
| **CHG-05** | `docs/DEPLOYMENT.md` | Create deployment runbook & external cron guide | Provide instructions for hosting on Neon + Vercel. | Low | **Phase 9B (Required)** |
| **CHG-06** | `docs/archive/` | Move 15 internal phase markdown files to `docs/archive/` | Reduce top-level docs clutter while preserving history. | Low | **Phase 9B (Recommended)** |
| **CHG-07** | `app/api/cron/**` | Stage and track cron route & test files in Git | Ensure production cron entrypoint is tracked in source control. | Low | **Phase 9B (Required)** |
| **CHG-08** | `services/scheduler*` | Stage and track scheduler engine & test files in Git | Ensure production scheduler and reliability tests are tracked. | Low | **Phase 9B (Required)** |
| **CHG-09** | `CLAUDE.md`, `*.gitkeep` | Remove scaffolding files | Clean development debris from repository root and folders. | Low | **Phase 9B (Recommended)** |
| **CHG-10** | `public/screenshots/` | Add dashboard preview captures | Provide visual proof of working UI for README. | Low | **Phase 9B (Recommended)** |

---

## 14. Explicit Non-Changes

To maintain stability and adhere to project boundaries, Phase 9B will explicitly **NOT**:
1. Modify database schema (`db/schema.ts`) or create new migrations.
2. Modify existing API contracts or response payload structures.
3. Modify business logic in `services/checker.ts`, `services/monitor.ts`, `services/metrics.ts`, or `services/scheduler.ts`.
4. Modify existing frontend components or styling (`components/*.tsx`, `app/page.tsx`).
5. Install new runtime dependencies or altering `package.json` package versions.
6. Introduce distributed locks (Redis, ZooKeeper) or message queues.
7. Rewrite Git historical commits.

---

## 15. Phase 9B Handoff

Upon review and approval of this design document, the workflow advances to:

$$\text{Phase 9B — Repository Professionalization & Documentation Implementation}$$

### Execution Order in Phase 9B:
1. Create `LICENSE` (MIT).
2. Author `docs/ARCHITECTURE.md`, `docs/API.md`, and `docs/DEPLOYMENT.md`.
3. Create `docs/archive/` and consolidate internal phase design/spec/audit files.
4. Rewrite `README.md` to communicate the completed, verified application.
5. Capture and place clean dashboard screenshots in `public/screenshots/`.
6. Clean up scaffolding (`CLAUDE.md`, `.gitkeep` files).
7. Execute full validation suite: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
8. Review Git status and present staging plan for final review.
