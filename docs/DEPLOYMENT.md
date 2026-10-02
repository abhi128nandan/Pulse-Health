# PulseCheck Deployment Guide

This guide details how to configure, build, run, and automate PulseCheck in production.

---

## 1. System Requirements & Architecture

PulseCheck is a standard Next.js (App Router) full-stack application backed by a PostgreSQL database:
- **Runtime:** Node.js `>= 20.x` (LTS recommended), npm `>= 10.x`.
- **Database:** PostgreSQL `>= 15.x` (Neon serverless PostgreSQL, AWS RDS, Supabase, or standard self-hosted PostgreSQL) with SSL enabled (`sslmode=require`).
- **Scheduling Model:** Stateless execution. PulseCheck exposes an authenticated HTTP endpoint (`POST /api/cron/check`) designed to be triggered periodically by an external scheduler (such as GitHub Actions, cron-job.org, AWS EventBridge, or a Kubernetes cron job).

---

## 2. Environment Variables

Create `.env.local` for local execution or configure these environment variables in your deployment hosting provider:

| Variable | Description | Example / Format |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://<user>:<password>@<host>:<port>/<dbname>?sslmode=require` |
| `CRON_SECRET` | High-entropy secret for authenticating scheduled checks | Generate with `openssl rand -hex 32` |

> [!CAUTION]
> Never commit `.env.local` or expose raw database credentials or secrets in source control.

---

## 3. Database Migrations

Before launching the application, apply the Drizzle schema migrations to provision the `endpoints` and `checks` tables:

```bash
npm run db:migrate
```

To inspect database records interactively:
```bash
npm run db:studio
```

---

## 4. Production Build & Execution

### 4.1 Compile the Production Bundle
Compile the Next.js App Router application using Turbopack:
```bash
npm run build
```
This generates an optimized standalone production build in `.next/`.

### 4.2 Start the Production Server
```bash
npm start
```
By default, Next.js listens on port 3000 (`http://localhost:3000`). To specify a custom port:
```bash
npx next start -p 3100
```

---

## 5. Setting Up Scheduled Monitoring

PulseCheck does not run an internal daemon (`setInterval`), ensuring zero memory leaks and complete compatibility with serverless and autoscaling container environments. Monitoring runs are initiated by dispatching an authenticated `POST` request to `/api/cron/check`.

### 5.1 Request Contract
- **Method:** `POST`
- **URL:** `https://<your-domain>/api/cron/check`
- **Header:** `Authorization: Bearer <CRON_SECRET>`
- **Recommended Cadence:** Every 1 to 5 minutes.

### 5.2 Option A: GitHub Actions Cron (Recommended Free Setup)
You can configure a GitHub Actions workflow in your repository (or an external ops repository) to ping your PulseCheck instance:

Create `.github/workflows/pulsecheck-cron.yml`:
```yaml
name: PulseCheck Scheduled Monitoring

on:
  schedule:
    # Runs every 5 minutes (standard POSIX cron syntax)
    - cron: '*/5 * * * *'
  workflow_dispatch: # Allows manual trigger from GitHub Actions tab

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Monitoring Run
        run: |
          curl -X POST https://your-pulsecheck-domain.com/api/cron/check \
            -H "Authorization: Bearer ${{ secrets.PULSECHECK_CRON_SECRET }}" \
            --fail --silent --show-error
```

### 5.3 Option B: External Webhook Schedulers
You can also use external ping services:
- **cron-job.org:** Create a cron job pointing to `https://<your-domain>/api/cron/check` with HTTP method `POST` and header `Authorization: Bearer <CRON_SECRET>`.
- **AWS EventBridge / CloudWatch:** Target an API Gateway or dispatch via an AWS Lambda function every 1 minute.
- **Linux Crontab (Self-Hosted Server):**
  ```bash
  */5 * * * * curl -s -X POST http://127.0.0.1:3000/api/cron/check -H "Authorization: Bearer $(cat /etc/pulsecheck.secret)" > /dev/null
  ```

---

## 6. Verification Status

To ensure complete transparency regarding production readiness, this repository distinguishes verified deployment environments from designed compatibility:

### 6.1 Verified in Repository Test Harness
- **Local Production Server:** Fully tested and verified via `next build` and `next start -p 3100`.
- **Live PostgreSQL Transport:** Fully verified with real Neon serverless PostgreSQL connections over SSL.
- **HTTP Cron Transport:** Live TCP socket calls to `/api/cron/check` over network interfaces verified for authentication, execution guard acquisition, and check persistence.
- **Concurrency Cap:** Worker pool strictly verified under burst load to maintain $\le 5$ simultaneous sockets.

### 6.2 Compatible / Designed To Support
- **Vercel / Next.js Hosting:** Compatible with Vercel deployment (serverless functions and edge caching).
- **Container / Docker Platforms:** Compatible with Dockerized Node.js containers (AWS ECS, Google Cloud Run, Fly.io, Railway, Render).

---

## 7. Security & Operational Hardening

1. **HTTPS Enforcement:** Always place PulseCheck behind an HTTPS reverse proxy (Cloudflare, Caddy, Nginx, or Vercel edge) so that `Authorization: Bearer` headers are encrypted in transit.
2. **Execution Guard Invariant:** PulseCheck includes an in-memory process guard that cleanly skips overlapping check runs within the same process with `200 OK` (`{ skipped: true }`). Note that if running in a horizontally scaled cluster across multiple Node containers without a distributed lock (e.g. Redis), simultaneous cron requests dispatched to different containers will execute independently.
3. **Target Failure Isolation:** If a monitored API goes down, it is recorded as a monitoring outcome (`status: 'down'`) and does not crash the server or return application 500 errors.
