# PulseCheck

> Lightweight, self-hosted API monitoring and observability dashboard with automated health checks, rolling 24h reliability metrics, and external cron scheduling.

[![Next.js](https://img.shields.io/badge/Next.js-16.3-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-198%20passing-emerald)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Overview

Modern web applications depend on dozens of microservices, webhooks, and third-party APIs. When endpoints degrade or fail intermittently, teams often discover outages only after users complain.

**PulseCheck** provides an active API health checking and observability solution. It continuously validates reachability, enforces strict timeout budgets, tracks response latency, and calculates mathematical uptime and latency percentiles over a rolling 24-hour window.
---

## Features

- **Active HTTP/HTTPS Probing:** Dispatches real HTTP requests measuring latency with microsecond accuracy via `performance.now()`.
- **Strict Timeout Budget:** Enforces a 5000ms timeout budget using native `AbortController` cancellation.
- **Tiered Health Classification:**
  - `UP`: Response 2xx/3xx within target latency threshold.
  - `DEGRADED`: Response 2xx/3xx exceeding target latency threshold.
  - `DOWN`: Response 4xx/5xx, connection timeout, DNS failure, or network refusal.
- **Rolling 24-Hour Telemetry:** Computes availability uptime %, error rate %, average latency, and nearest-rank P95 latency.
- **Bounded Worker Concurrency:** Sliding worker queue caps concurrent active probes at $\le 5$ (`MAX_CONCURRENCY`), preventing socket exhaustion.
- **Process-Local Execution Guard:** In-memory execution guard prevents overlapping scheduled runs within the same process.
- **Developer-Focused UI:** Dark neutral technical aesthetic with real-time filtering, master/detail navigation, native cyclic focus trapping, and full responsiveness (1440px desktop down to 320px mobile).
- **PostgreSQL Persistence:** Atomic check records stored with Drizzle ORM and automatic cascading deletion on endpoint removal.
---

## Architecture

PulseCheck is designed to run statelessly in serverless and containerized environments. Periodic monitoring is initiated via an external HTTP cron trigger:

```
[ External Scheduler / Cron ]          [ Operator / Browser ]
              │                                   │
              ▼                                   ▼
    POST /api/cron/check                 GET /api/endpoints
  (Bearer Token Auth)                    POST /api/endpoints/:id/check
              │                                   │
              ▼                                   ▼
   ┌───────────────────────────────────────────────────────────────┐
   │ Next.js App Router (API Routes & UI Components)               │
   └──────────────────────────────┬────────────────────────────────┘
                                  │
                                  ▼
   ┌───────────────────────────────────────────────────────────────┐
   │ Execution Guard (isExecutionActive in-memory guard)           │
   └──────────────────────────────┬────────────────────────────────┘
                                  │
                                  ▼
   ┌───────────────────────────────────────────────────────────────┐
   │ Worker Pool (MAX_CONCURRENCY = 5 sliding queue)               │
   └──────────────────────────────┬────────────────────────────────┘
                                  │
                                  ▼
   ┌───────────────────────────────────────────────────────────────┐
   │ Probing Engine (services/checker.ts)                          │
   │  - Protocol validation (HTTP/HTTPS only)                      │
   │  - High-resolution stopwatch (performance.now())              │
   │  - 5000ms AbortController cancellation                       │
   │  - Classification: UP | DEGRADED | DOWN                       │
   └──────────────┬───────────────────────────────┬────────────────┘
                  │                               │
                  ▼ (HTTP Health Probe)           ▼ (Persist Check Result)
        [ Target External APIs ]        ┌──────────────────────────┐
                                        │ Neon PostgreSQL          │
                                        │  - endpoints table       │
                                        │  - checks table (CASCADE)│
                                        └──────────────────────────┘
```

Detailed architectural documentation is available in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Framework** | [Next.js 16](https://nextjs.org/) (App Router, Turbopack, React 19) |
| **Language** | [TypeScript](https://www.typescriptlang.org/) (Strict Mode) |
| **Database & ORM** | [PostgreSQL](https://www.postgresql.org/) (Neon serverless) with [Drizzle ORM](https://orm.drizzle.team/) |
| **Styling** | [Tailwind CSS 4](https://tailwindcss.com/) |
| **Visualization** | [Recharts 3](https://recharts.org/) |
| **Validation** | [Zod](https://zod.dev/) |
| **Testing** | [Vitest](https://vitest.dev/) (198 tests across 13 test files) |

---

## Metrics & Mathematical Invariants

Metrics are calculated over a rolling 24-hour window using pure domain functions:

- **Uptime Percentage:**
  $$\text{Uptime} = \frac{\text{Successful Checks (UP + DEGRADED)}}{\text{Total Checks}} \times 100$$
- **Error Rate Percentage:**
  $$\text{Error Rate} = \frac{\text{Failed Checks (DOWN)}}{\text{Total Checks}} \times 100$$
- **Average Latency:**
  Arithmetic mean of successful checks with valid numeric latency.
- **P95 Latency:**
  Nearest-rank 95th percentile ($\lceil 0.95 \times N \rceil - 1$) of sorted valid latency observations from successful checks.

> **Null Latency Invariant:** Checks with `latency_ms = null` (e.g. invalid URL formats) and failed checks (`status = 'down'`, such as timeouts and HTTP 5xx errors) are strictly excluded from average and P95 latency calculations. Null latency is **never converted to 0ms**, preventing misleading deflation of latency numbers.

---

## Quick Start

### 1. Prerequisites
- Node.js `>= 20.x`
- npm `>= 10.x`
- PostgreSQL database (e.g. Neon, Supabase, or local Postgres)

### 2. Installation
```bash
git clone https://github.com/abhi128nandan/Pulse-Health.git PulseCheck
cd PulseCheck
npm install
```

### 3. Environment Setup
```bash
cp .env.example .env.local
```
Configure your connection string and cron secret in `.env.local`:
```env
DATABASE_URL=postgresql://<user>:<password>@<host>/<dbname>?sslmode=require
CRON_SECRET=your-secure-random-secret
```

### 4. Database Migrations
Run Drizzle Kit migrations to create the required tables:
```bash
npm run db:migrate
```

### 5. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Available Scripts

| Script | Purpose |
| :--- | :--- |
| `npm run dev` | Starts local Next.js development server with hot reload |
| `npm test` | Runs the full Vitest suite (unit, integration, and reliability tests) |
| `npm run build` | Compiles optimized production build via Turbopack |
| `npm start` | Runs Next.js production server |
| `npm run lint` | Runs ESLint analysis |
| `npm run db:migrate` | Applies pending Drizzle SQL migrations to PostgreSQL |
| `npm run db:studio` | Launches Drizzle Studio interactive database GUI |

---

## Documentation

- **[Architecture Guide](docs/ARCHITECTURE.md):** Deep-dive into component lifecycles, concurrency workers, persistence cascading, and design invariants.
- **[REST API Reference](docs/API.md):** Complete request and response specifications for all 7 REST endpoints.
- **[Deployment Runbook](docs/DEPLOYMENT.md):** Step-by-step instructions for production deployment, Neon PostgreSQL provisioning, and setting up external schedulers (GitHub Actions, cron-job.org).

---

## Known Limitations

PulseCheck makes explicit architectural trade-offs:
- **Process-Local Execution Guard:** The scheduler guard is in-memory within a single process. Multi-instance horizontally scaled deployments without a distributed lock (e.g. Redis) can execute cron triggers independently if received simultaneously on multiple instances.
- **External Trigger Dependency:** PulseCheck does not run an internal timer daemon (`setInterval`), relying instead on external HTTP triggers hitting `POST /api/cron/check`.
- **Query-Level History Limit:** Check history is retrieved with a query limit of 50 records (`limit = 50`). There is no automated database-level partitioning or retention cleanup job in PostgreSQL.
- **Single-Tenant Scope:** The dashboard console operates in a single-tenant model without user accounts or role-based access control (RBAC).
- **No Native Alerting:** PulseCheck is an observability dashboard and probe engine; outbound notifications (Slack, Discord, PagerDuty, Email) are not currently built in.

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.