# PulseCheck

PulseCheck is an API monitoring and observability dashboard designed to track endpoint availability, measure HTTP response latency, and provide operational visibility into service health. Built as a lightweight, reliable observability system, PulseCheck regularly validates target APIs and calculates key reliability metrics.

## Problem

Modern distributed applications depend on numerous internal and external HTTP APIs. Engineering teams need immediate visibility into whether their endpoints are reachable, responding with expected HTTP status codes, and maintaining acceptable latency under real-world conditions. Without dedicated monitoring, silent degradations, intermittent timeouts, and cascading downtime often go unnoticed until end users report outages.

## Planned Features

> [!NOTE]
> The following capabilities represent the planned roadmap and are actively under development. The current repository state establishes the core foundation.

- **API Endpoint Registration**: Manage target URLs, HTTP methods, expected status codes, and check intervals.
- **Active HTTP Monitoring**: Periodic automated health checks measuring DNS resolution, connection time, and round-trip response latency.
- **Timeout & Error Handling**: Configurable check timeouts and comprehensive failure classification (network errors, HTTP 4xx/5xx, timeouts).
- **Health Classification**: Real-time evaluation of endpoint states into distinct tiers (`UP`, `DEGRADED`, `DOWN`).
- **Historical Timeseries Storage**: Persistent check logs stored in PostgreSQL for trend analysis and historical auditing.
- **Reliability Metrics**: Automated computation of availability uptime percentages, error rates, average latency, and P95 latency distributions.
- **Observability Dashboard**: Responsive web interface with real-time status indicators and timeseries charts.

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router, React 19)
- **Language**: [TypeScript](https://www.typescriptlang.org/) (Strict type checking)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Database & ORM**: [PostgreSQL](https://www.postgresql.org/) with [Drizzle ORM](https://orm.drizzle.team/)
- **Validation**: [Zod](https://zod.dev/)
- **Testing**: [Vitest](https://vitest.dev/)
- **Data Visualization**: [Recharts](https://recharts.org/)
- **Package Manager**: npm

## Architecture

The project is structured as a modular full-stack application leveraging Next.js App Router server components and route handlers, avoiding external server runtimes:

```
[ Scheduled Trigger / Worker / Cron ]
                │
                ▼
  [ HTTP Health Checking Engine ]  ──(HTTP Probe)──>  [ Target External APIs ]
                │
                ▼
    [ PostgreSQL via Drizzle ]
                │
                ▼
  [ Aggregation & Metrics Service ]
                │
                ▼
[ Next.js Dashboard UI (App Router + Recharts) ]
```

*Current state:* The repository contains the foundational environment, configuration, and directory layout. The database schema, monitoring engine, and UI components will be introduced sequentially in upcoming phases.

## Project Structure

```
Pulse_Health/
├── app/                  # Next.js App Router (pages, layouts, API routes)
├── components/           # Reusable UI and dashboard components
├── db/                   # Database connection and Drizzle ORM schemas
├── lib/                  # Shared utilities and helper functions
├── services/             # Core business logic (health checker, metrics engine)
├── types/                # TypeScript interfaces and domain schemas
├── public/               # Static assets
├── drizzle.config.ts     # Drizzle Kit migration and database config
└── package.json          # Project scripts and pinned dependencies
```

## Development

### Prerequisites

- Node.js >= 20.x (Node 24 recommended)
- npm >= 10.x
- PostgreSQL database instance

### Getting Started

1. Clone the repository and navigate to the project directory:
   ```bash
   git clone <repository-url>
   cd Pulse_Health
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env.local
   ```
   Configure your local connection string in `.env.local`.

4. Run the development server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

### Available Scripts

- `npm run dev`: Launch local Next.js development server.
- `npm run build`: Compile an optimized production build.
- `npm run start`: Run production server.
- `npm run lint`: Run ESLint checks.
- `npm test`: Run test suite using Vitest.
- `npm run db:generate`: Generate Drizzle SQL migration files from schema.
- `npm run db:migrate`: Execute pending database migrations.
- `npm run db:studio`: Launch Drizzle Studio database management interface.

## Environment Variables

The project requires environment configuration via `.env.local` (which is excluded from source control). An annotated template is provided in [`.env.example`](file:///.env.example):

- `DATABASE_URL`: PostgreSQL connection string (supports Neon, Supabase, or local Postgres).
- `CRON_SECRET`: Secret token used to authenticate automated health-check execution requests.

## Roadmap

- **Phase 1 — Foundation** (Current): Tooling, directory architecture, TypeScript, Drizzle config, linting, and testing foundation.
- **Phase 2 — Database**: PostgreSQL schema design via Drizzle ORM (monitors, checks, incident events) and migrations.
- **Phase 3 — HTTP Monitoring Engine**: Request dispatcher, timeout handling, latency stopwatch, and response parsing.
- **Phase 4 — Metrics Engine**: Computation of uptime percentage, error rates, average latency, and P95 latency percentiles.
- **Phase 5 — Dashboard**: Operational status board, health charts (Recharts), and endpoint detail views.
- **Phase 6 — Scheduling**: Cron-driven execution and automated polling workers.
- **Phase 7 — Testing & Deployment**: Integration test coverage, end-to-end verification, and deployment.

## Future Improvements

To maintain focus and deliver a robust working software core within a 3-day development cycle, certain production-scale concerns are explicitly scoped for post-MVP enhancements:

- User authentication and role-based access control (RBAC).
- Outbound alerting notifications (Slack, Discord, PagerDuty, Email).
- Hardened SSRF (Server-Side Request Forgery) protection and internal IP filtering.
- Distributed worker queues (e.g., BullMQ / background job runners) for high-scale check execution.
- Incident lifecycle management with resolution workflows.
