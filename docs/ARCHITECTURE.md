# PulseCheck Architecture

PulseCheck is a lightweight, self-hosted API monitoring and observability system built with Next.js (App Router), TypeScript, and PostgreSQL. It actively probes HTTP/HTTPS endpoints, computes rolling 24-hour reliability metrics, and supports scheduled monitoring via an external cron trigger with bounded worker concurrency.

---

## 1. System Overview & Topology

The system operates across three primary planes:
1. **Interactive Dashboard Plane:** Next.js App Router client components rendering real-time health badges, interactive search/filters, master/detail views, and Recharts latency curves.
2. **Monitoring & Persistence Plane:** Probing engine enforcing strict timeouts, classifying responses, and persisting atomic check observations to PostgreSQL.
3. **Execution & Scheduling Plane:** Authenticated REST endpoints receiving manual and external cron triggers, managed by an in-memory execution guard and a bounded sliding-window worker pool.

```
[ External Scheduler / Cron ]          [ Browser / Operator ]
              │                                   │
              ▼                                   ▼
    POST /api/cron/check                 GET /api/endpoints
              │                          POST /api/endpoints/[id]/check
              ▼                                   │
   ┌──────────────────────────────────────────────┴────────────────┐
   │ Next.js App Router API Routes                                 │
   └──────────────────────┬────────────────────────────────────────┘
                          │
                          ▼
   ┌───────────────────────────────────────────────────────────────┐
   │ Execution Guard (isExecutionActive in-memory guard)           │
   └──────────────────────┬────────────────────────────────────────┘
                          │
                          ▼
   ┌───────────────────────────────────────────────────────────────┐
   │ Worker Pool (MAX_CONCURRENCY = 5 sliding queue)               │
   └──────────────────────┬────────────────────────────────────────┘
                          │
                          ▼
   ┌───────────────────────────────────────────────────────────────┐
   │ Checker Engine (services/checker.ts)                          │
   │  - Protocol validation (HTTP/HTTPS only)                      │
   │  - High-resolution timing (performance.now())                 │
   │  - 5000ms AbortController timeout                            │
   │  - Response classification (UP, DEGRADED, DOWN)               │
   └──────────────┬───────────────────────────────┬────────────────┘
                  │                               │
                  ▼ (Probe HTTP Request)          ▼ (Persist Check Result)
        [ Target External APIs ]        ┌──────────────────────────┐
                                        │ Neon PostgreSQL          │
                                        │  - endpoints table       │
                                        │  - checks table (CASCADE)│
                                        └──────────────────────────┘
```

---

## 2. Core Probing & Classification Engine (`services/checker.ts`)

Every health check is executed as an active HTTP/HTTPS probe:
- **Protocol Restriction:** Only `http:` and `https:` protocols are accepted. Invalid protocols return immediately with `status: 'down'`, `errorType: 'invalid_url'`, and `latencyMs: null` without dispatching network I/O.
- **Latency Measurement:** Round-trip response latency is measured with microsecond accuracy via `performance.now()` surrounding native `fetch()`, rounded to the nearest integer millisecond.
- **Timeout Budget:** Every probe enforces a strict 5000ms timeout budget using native `AbortController` signal cancellation (`DEFAULT_TIMEOUT_MS = 5000`). If a target hangs beyond 5 seconds, the request is aborted and categorized as `status: 'down'`, `errorType: 'timeout'`, with `statusCode: null` and measured elapsed latency ($\ge 5000\text{ms}$).
- **Tiered Classification:**
  - **`UP`**: Status code 2xx/3xx AND measured response latency $\le$ endpoint threshold.
  - **`DEGRADED`**: Status code 2xx/3xx AND measured response latency $>$ endpoint threshold.
  - **`DOWN`**: HTTP 4xx/5xx, connection timeout, DNS resolution failure (`ENOTFOUND`, `EAI_AGAIN`), connection refusal (`ECONNREFUSED`), or network reset.
- **Failure Isolation:** Monitored target failures (such as HTTP 500 or network timeouts) are treated as **monitoring outcomes**, not platform exceptions. They are recorded cleanly as `status: 'down'` and never throw unhandled runtime errors.

---

## 3. Persistence & Data Model (`db/schema.ts`)

PulseCheck persists configuration and check observations in PostgreSQL via Drizzle ORM:

### 3.1 Tables
- **`endpoints`**:
  - `id`: Auto-incrementing primary key serial.
  - `name`: Service display name (1–100 characters).
  - `url`: Target URL (unique index, max 2048 characters).
  - `latency_threshold_ms`: Target latency threshold in milliseconds (default: 500ms, range: 1–60000ms).
  - `created_at`: Creation timestamp (`defaultNow()`).
- **`checks`**:
  - `id`: Auto-incrementing primary key serial.
  - `endpoint_id`: Foreign key referencing `endpoints.id` with `ON DELETE CASCADE`.
  - `checked_at`: Timestamp of check execution (`defaultNow()`).
  - `status_code`: HTTP response status code (nullable integer; `null` on network/timeout/DNS errors).
  - `latency_ms`: Measured response latency in milliseconds (nullable integer).
  - `success`: Boolean flag (`true` for `up` and `degraded`; `false` for `down`).
  - `status`: Enum value: `'up' | 'degraded' | 'down'`.
  - `error_type`: Diagnostic error code (`'http' | 'timeout' | 'dns' | 'network' | 'invalid_url' | null`).
  - `error_message`: Sanitized error description (`text | null`).

### 3.2 Relational Integrity & Cascading
All check observations are tied to their parent endpoint. When an endpoint is deleted, PostgreSQL's relational engine automatically purges all associated historical records via foreign key cascading deletion (`ON DELETE CASCADE`), ensuring zero orphaned telemetry.

### 3.3 Timeseries Indexing
An index on `(endpoint_id, checked_at DESC)` ensures $O(\log N)$ retrieval for rolling 24-hour metrics aggregation and recent check history pagination.

---

## 4. Telemetry & Metrics Service (`services/metrics.ts`)

Availability and performance metrics are computed over a rolling 24-hour window using pure mathematical functions decoupled from database reads:

$$\text{Uptime Percentage} = \frac{\text{Successful Checks (UP + DEGRADED)}}{\text{Total Checks}} \times 100$$

$$\text{Error Rate Percentage} = \frac{\text{Failed Checks (DOWN)}}{\text{Total Checks}} \times 100$$

$$\text{Average Latency} = \frac{\sum \text{latency of successful checks with non-null latency}}{\text{count of successful checks with non-null latency}}$$

$$\text{P95 Latency} = \text{Nearest Rank Index } \lceil 0.95 \times N \rceil - 1 \text{ of sorted valid successful latencies}$$

### Null Latency Invariant
Checks with `latency_ms = null` (e.g. invalid URL formats) and failed checks (`status = 'down'`, such as timeouts and HTTP 5xx errors) are **strictly excluded** from average latency and P95 latency calculations. Null latency is **never coerced to 0ms**, preventing artificial deflation of latency averages.

---

## 5. Scheduling & Concurrency Architecture (`services/scheduler.ts`)

PulseCheck is designed to operate seamlessly in serverless and containerized deployment environments without long-running in-memory daemon processes.

### 5.1 Sliding Worker Queue
Rather than launching unbounded concurrent requests (`Promise.all()`), PulseCheck implements a bounded worker pool:
- Hard concurrency bound: $\le 5$ simultaneous active sockets (`MAX_CONCURRENCY = 5`).
- Sliding queue pull: When a worker finishes probing an endpoint, it immediately pulls the next endpoint from the queue without waiting for sibling workers in the batch.
- Prevents local file-descriptor exhaustion, TCP socket starvation, and outbound rate-limiting.

### 5.2 Process-Local Execution Guard
An in-memory guard (`isExecutionActive`) ensures that overlapping triggers hitting the same Node.js process do not run concurrently:
- If a scheduled run is already in progress, subsequent triggers immediately return **HTTP 200** with `{ success: true, skipped: true, reason: 'Previous scheduled check run is still active' }`.
- Guard acquisition and release are managed in the route handler, with guaranteed release in a `finally` block to prevent deadlocks on infrastructure crashes.

### 5.3 Timing-Safe Authentication
The `/api/cron/check` endpoint requires an `Authorization: Bearer <CRON_SECRET>` header. Token verification uses `crypto.timingSafeEqual()` over byte buffers to eliminate side-channel timing attack vectors.

---

## 6. Frontend Architecture (`app/page.tsx`, `components/`)

The dashboard UI is a dense, developer-focused observability console built with Next.js App Router and Tailwind CSS:
- **Zero Synthetic Telemetry:** Newly registered endpoints mount with `NO DATA` status until explicitly probed. No default or fabricated latency metrics are rendered.
- **Client-Side Filter State:** Search query strings and active status tabs (`ALL`, `UP`, `DEGRADED`, `DOWN`, `NO DATA`) are retained in client state when navigating into and out of master/detail views.
- **Accessibility & Focus Trapping:** Both `AddEndpointModal` and `DeleteEndpointModal` feature zero-dependency native cyclic focus trapping (`Tab` and `Shift+Tab`) and restore keyboard focus to the initiating button upon dismissal (`Escape` or cancel).
- **Responsive Layout:** Automatically adapts from a 6-column tabular layout on desktop (1440px) to a stacked card layout on mobile viewports (375px / 320px) without horizontal scrolling.

---

## 7. Known Architectural Limitations

PulseCheck makes deliberate architectural trade-offs:
1. **Process-Local Guard (Single-Instance):** The execution guard is in-memory within a single Node.js process. In multi-instance horizontally scaled deployments without an external distributed lock (e.g. Redis), multiple instances receiving simultaneous cron triggers could execute checks independently.
2. **External Scheduler Dependency:** PulseCheck relies on external HTTP requests (`POST /api/cron/check`) to trigger periodic monitoring; it does not maintain an internal `setInterval` timer daemon.
3. **Query-Level History Limit:** History is retrieved with a query limit of 50 records (`limit = 50`, capped at 100). There is no automated database-level retention or partitioning cleanup job in PostgreSQL; records accumulate until parent endpoints are deleted.
4. **Single-Tenant Scope:** The dashboard console operates in a single-tenant model without user accounts or role-based access control (RBAC).
5. **No Native Alerting:** PulseCheck is an observability dashboard and probing engine; outbound alerting channels (email, webhooks, PagerDuty, Slack) are not currently included.
