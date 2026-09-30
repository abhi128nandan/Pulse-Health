# PulseCheck — UI/UX Design Specification & Frontend Architecture
**Phase 6A: Design Specification**  
**Document Version:** 1.0.0  
**Target Platform:** Modern Desktop & Responsive Mobile Web  
**Primary Tech Stack:** Next.js (App Router), TypeScript, Tailwind CSS, Recharts  

---

## 1. Product Design Goal

### What PulseCheck Is
PulseCheck is a developer-centric API monitoring and operational observability platform. It allows software engineers, site reliability engineers (SREs), and platform teams to monitor external and internal HTTP/HTTPS endpoints, measure real-world round-trip network latency, classify service health tiers (`UP`, `DEGRADED`, `DOWN`), evaluate rolling 24-hour reliability metrics (Uptime %, Error Rate %, Average Latency, P95 Latency), and audit granular check timeseries histories.

### Target Audience & Core Personas
1. **Backend / API Engineers**: Need to verify whether downstream dependencies or their own microservices are performing within expected latency SLAs.
2. **DevOps & Site Reliability Engineers (SREs)**: Need an immediate, calm, high-density situational overview of production API health without sensory overload.
3. **Engineering Leads**: Need clear, audit-ready uptime and latency percentiles to evaluate SLA compliance.

### What Users Need to Understand Immediately (< 3 Seconds)
When an engineer opens PulseCheck, the interface must answer three questions without scrolling:
1. **Is everything operational right now?** (Global summary metrics: total endpoints, operational count, degraded count, down count).
2. **Which specific API is failing or degraded, and why?** (Prominent status badge, HTTP status code, error type).
3. **Is the degradation a localized spike or a systemic outage?** (Latency vs. SLA threshold, error rate, and P95 latency).

### Primary User Workflows
```
[ Open PulseCheck Dashboard ]
              │
              ▼
[ Global Health Bar: 12 Monitored · 10 Up · 1 Degraded · 1 Down ]
              │
              ▼
[ Identify Unhealthy Target in Endpoint Grid/List ]
              │
              ├──────────────────────────────┐
              ▼                              ▼
    [ One-Click 'Check Now' ]      [ Click Endpoint Row ]
              │                              │
              ▼                              ▼
    [ Probe Persisted Live ]       [ Deep-Dive Detail View ]
                                             │
                                             ├─► Inspect Latency vs SLA Chart
                                             ├─► Review Uptime & P95 Distribution
                                             └─► Trace Recent Check History Log
```

### Frequent User Actions
1. **Scanning Health**: Reviewing endpoint cards/table for non-UP badges.
2. **On-Demand Validation ("Check Now")**: Manually probing an endpoint after a code deployment or incident mitigation.
3. **Inspecting Historical Degradations**: Investigating latency spikes and HTTP error statuses in the timeseries history.
4. **Registering New Endpoints**: Adding endpoints with custom URL and latency SLA thresholds.
5. **De-registering Endpoints**: Removing deprecated or decommissioned services.

---

## 2. Information Hierarchy

The visual hierarchy is structured strictly around operational urgency:

```
┌────────────────────────────────────────────────────────┐
│ LEVEL 1: CRITICAL (Highest Priority — Immediate Scan)   │
│ - Current Health Status (UP, DEGRADED, DOWN)           │
│ - Monitored Health Counts (Total, Up, Degraded, Down)  │
│ - Endpoint Name & URL                                  │
│ - Latest Latency vs. Threshold (e.g. 842ms > 500ms)    │
│ - Active Probe Failures (HTTP 5xx, Timeout, DNS Error) │
└────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│ LEVEL 2: ANALYTICAL (Medium Priority — Context & Trends)│
│ - 24-Hour Availability Uptime %                        │
│ - 24-Hour Failure/Error Rate %                         │
│ - Latency Distribution (Average Latency & P95 Latency) │
│ - Timeseries Latency Chart with SLA Reference Line     │
│ - Total Checks Sample Count                            │
└────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│ LEVEL 3: AUDIT & METADATA (Lower Priority — Diagnostic)│
│ - Check Timestamp (ISO / relative time)                │
│ - Registration Timestamp                               │
│ - Raw Error Messages & Error Types                     │
│ - Endpoint Configuration IDs                           │
└────────────────────────────────────────────────────────┘
```

### Justification for Hierarchy
- **Level 1** must be unmistakable because service downtime costs revenue and violates SLAs. If an endpoint is `DOWN`, color, iconography, and text must immediately draw the engineer's eye.
- **Level 2** gives context to the incident: Is this a transient blip (high uptime, isolated spike) or ongoing systemic failure (dropping uptime, elevated P95)?
- **Level 3** provides debugging details once the problem is identified. It should not clutter the primary scanning view.

---

## 3. Application Structure

PulseCheck employs a **focused, single-page overview with contextual deep-dive views**, minimizing cognitive load and navigation friction.

### Architectural Layout: Master-Detail Architecture
PulseCheck adopts a **Compact Top Navigation Header** combined with an **Adaptive Master/Detail View**:
- **Default View (`/`)**: High-density Overview featuring Global KPI summary cards, filter/search controls, and the Primary Endpoint List.
- **Detail View (`/?endpoint=:id` or modal/inline slide-over panel on desktop, dedicated route on direct link)**: Clicking an endpoint row expands an analytical side-panel (or navigates to `/endpoints/:id`), keeping the mental context grounded while displaying timeseries charts, SLA comparisons, and the check history audit log.
- **Add Endpoint**: Triggered via a focused, accessible modal dialog (`<AddEndpointModal />`).

```
PulseCheck Root (/)
├── Top Navigation Bar (Logo, System Status Pulse, "+ Add Endpoint" CTA)
├── Global Health Summary (KPI Cards: Total, Operational, Degraded, Down)
├── Endpoint Management Section
│   ├── Search & Health Filter Bar (All, Healthy, Degraded, Down)
│   └── Endpoint Data Table / Grid
└── Contextual Deep-Dive View (/endpoints/[id])
    ├── Endpoint Header (Breadcrumb, Target URL, SLA Threshold, Actions)
    ├── KPI Metrics Ribbon (Uptime %, Error Rate %, Avg Latency, P95, Total)
    ├── Latency Timeseries Visualization (Interactive Line/Area Chart with SLA line)
    └── Recent Check History Audit Table (Paginated/scrolling timeseries logs)
```

---

## 4. Dashboard Wireframe

### Desktop View (1440px viewport)
```
+----------------------------------------------------------------------------------------------------+
|  PULSECHECK  [● 12 Monitored]                           [Search Endpoints...]      [+ Add Endpoint] |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|  SYSTEM OVERVIEW (24H ROLLING)                                                                     |
|  +-------------------+  +-------------------+  +-------------------+  +-------------------+        |
|  | TOTAL MONITORED   |  | OPERATIONAL (UP)  |  | DEGRADED (SLOW)   |  | FAILING (DOWN)    |        |
|  | 14 Endpoints      |  | 11 Endpoints      |  | 2 Endpoints       |  | 1 Endpoint        |        |
|  | 98.4% Net Health  |  | < Threshold SLA   |  | > Threshold SLA   |  | HTTP 5xx / Timeout|        |
|  +-------------------+  +-------------------+  +-------------------+  +-------------------+        |
|                                                                                                    |
|  MONITORED ENDPOINTS                                           [Filter: All (14) | Issues (3)]     |
|  +------------------------------------------------------------------------------------------------+
|  | ENDPOINT NAME & URL            | STATUS     | LATENCY / SLA   | 24H UPTIME | 24H P95  | ACTIONS    |
|  +--------------------------------+------------+-----------------+------------+----------+------------+
|  | Production Auth Service       | ● UP       | 124 ms / 300 ms | 99.98%     | 185 ms   | [CheckNow] |
|  | https://auth.api.internal/v1   |            |                 |            |          | [···]      |
|  +--------------------------------+------------+-----------------+------------+----------+------------+
|  | Payments Gateway Probe        | ▲ DEGRADED | 684 ms / 500 ms | 97.40%     | 820 ms   | [CheckNow] |
|  | https://gateway.stripe.com/v1  |            | (+184 ms over)  |            |          | [···]      |
|  +--------------------------------+------------+-----------------+------------+----------+------------+
|  | Legacy Inventory Sync         | ✕ DOWN     | No Response     | 84.12%     | 4,200 ms | [CheckNow] |
|  | https://inventory.corp/health  | HTTP 504   | Timeout (5000ms)|            |          | [···]      |
|  +--------------------------------+------------+-----------------+------------+----------+------------+
|  | Notification Dispatcher       | ● UP       | 42 ms / 250 ms  | 100.00%    | 74 ms    | [CheckNow] |
|  | https://notify.service/ping    |            |                 |            |          | [···]      |
+----------------------------------------------------------------------------------------------------+
```

### Empty State Wireframe (Zero Endpoints)
```
+----------------------------------------------------------------------------------------------------+
|  PULSECHECK                                                                        [+ Add Endpoint] |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|  +----------------------------------------------------------------------------------------------+  |
|  |                                                                                              |  |
|  |                                     [ ⌖ Target Radar Icon ]                                   |  |
|  |                                                                                              |  |
|  |                                  No Monitored Endpoints Found                                 |  |
|  |         PulseCheck has not registered any HTTP/HTTPS APIs for active health probing.         |  |
|  |         Add an endpoint to start measuring uptime, latency SLAs, and error rates.             |  |
|  |                                                                                              |  |
|  |                                      [ + Add First Endpoint ]                                |  |
|  |                                                                                              |  |
|  +----------------------------------------------------------------------------------------------+  |
+----------------------------------------------------------------------------------------------------+
```

---

## 5. Endpoint Detail View

The detail view provides in-depth diagnosis for a single endpoint.

### Desktop Layout Structure
```
+----------------------------------------------------------------------------------------------------+
|  ← Back to Overview   /   Payments Gateway Probe                                                   |
+----------------------------------------------------------------------------------------------------+
|  Payments Gateway Probe                                              [ Delete ]   [ ⟳ Check Now ]  |
|  Target URL: https://gateway.stripe.com/v1                           Last checked: 12 seconds ago  |
|  Threshold SLA: 500 ms                                               Current State: ▲ DEGRADED      |
+----------------------------------------------------------------------------------------------------+
|                                                                                                    |
|  24-HOUR RELIABILITY METRICS                                                                       |
|  +-------------------+  +-------------------+  +-------------------+  +-------------------+        |
|  | 24H AVAILABILITY  |  | 24H ERROR RATE    |  | AVERAGE LATENCY   |  | 95TH PERCENTILE   |        |
|  | 97.4%             |  | 2.6%              |  | 412 ms            |  | 785 ms            |        |
|  | Target: >= 99.0%  |  | 7 failed checks   |  | SLA: 500 ms       |  | Nearest-Rank      |        |
|  +-------------------+  +-------------------+  +-------------------+  +-------------------+        |
|                                                                                                    |
|  ROUND-TRIP LATENCY & SLA DRIFT (LAST 24 HOURS)                                                    |
|  +-----------------------------------------------------------------------------------------------+ |
|  | 1000ms |                                               *                                      | |
|  |        |                                              * *                                     | |
|  |  500ms |- - - - - - - - - - - - - - - - - - - - - - -* - * - - - - SLA Threshold (500ms) - - -| |
|  |        |                             *              *     *                                   | |
|  |  250ms |        *     *             * *            *       *                                  | |
|  |        | * * * * * * * * * * * * * *   * * * * * * *        * * * * *                         | |
|  |    0ms +--------------------------------------------------------------------------------------| |
|  |         18:00       22:00       02:00       06:00       10:00       14:00       18:00         | |
|  +-----------------------------------------------------------------------------------------------+ |
|                                                                                                    |
|  RECENT CHECK HISTORY                                                                              |
|  +-----------------------------------------------------------------------------------------------+ |
|  | TIMESTAMP         | STATUS     | HTTP CODE | LATENCY   | ERROR TYPE | ERROR MESSAGE / DETAILS     | |
|  +-------------------+------------+-----------+-----------+------------+-----------------------------+ |
|  | 17:59:42 (12s ago)| ▲ DEGRADED | 200 OK    | 684 ms    | -          | Latency exceeds SLA (500ms) | |
|  | 17:54:40 (5m ago) | ● UP       | 200 OK    | 210 ms    | -          | Normal operation            | |
|  | 17:49:41 (10m ago)| ✕ DOWN     | 503 Serv. | 82 ms     | http       | HTTP failed with code 503   | |
|  | 17:44:40 (15m ago)| ✕ DOWN     | -         | 5000 ms   | timeout    | Request timed out after 5000| |
|  | 17:39:41 (20m ago)| ● UP       | 200 OK    | 195 ms    | -          | Normal operation            | |
|  +-----------------------------------------------------------------------------------------------+ |
+----------------------------------------------------------------------------------------------------+
```

### Above-the-Fold Priority
1. **Endpoint Identity & State Ribbon**: Name, URL, Status Badge, "Check Now" button.
2. **Four Critical KPIs**: 24h Availability, 24h Error Rate, Average Latency, P95 Latency.
3. **Interactive Latency Chart**: Placed immediately below KPIs so latency trends vs. SLA threshold are clear without scrolling.

---

## 6. Add Endpoint Experience

Registration must be quick, friction-free, and validated both client-side and server-side.

### Component Format: Modal Dialog
- **Modal Header**: `Register New Endpoint`
- **Backdrop**: Semi-transparent dark overlay (`bg-black/60` with `backdrop-blur-xs`), dismissing on Escape or outer click.
- **Form Controls**:
  1. **Name**:
     - *Label*: `Service or Endpoint Name`
     - *Placeholder*: `e.g. Stripe Webhook Gateway`
     - *Constraints*: Required, 1–100 characters.
  2. **URL**:
     - *Label*: `Probe Target URL`
     - *Placeholder*: `https://api.example.com/v1/health`
     - *Constraints*: Required, valid HTTP or HTTPS protocol, max 2048 chars.
     - *Helper Text*: `Must be a reachable HTTP/HTTPS address. PulseCheck dispatches GET probes.`
  3. **Latency SLA Threshold (ms)**:
     - *Label*: `Latency SLA Threshold (ms)`
     - *Default*: `500`
     - *Constraints*: Required positive integer, range 1 to 60,000 ms.
     - *Helper Text*: `Responses exceeding this duration are classified as DEGRADED.`

### Interaction States & Backend Alignment
```
[ User Clicks "+ Add Endpoint" ]
              │
              ▼
[ Modal Opens, Auto-focuses "Name" input ]
              │
              ▼
[ User Enters Values & Clicks "Register Endpoint" ]
              │
              ├─► Client-side Zod validation fails?
              │     └─► Inline error message under violating input. Focus trapped.
              │
              ├─► Submitting:
              │     └─► Button shows spinner + "Registering...", inputs disabled.
              │
              ├─► Server returns 409 Conflict (Duplicate URL)?
              │     └─► Input border highlights red; Alert: "An endpoint with this URL already exists."
              │
              ├─► Server returns 400 Bad Request?
              │     └─► Display server validation details banner.
              │
              └─► Server returns 201 Created:
                    ├─► Close modal dialog immediately.
                    ├─► Trigger toast notification: "Endpoint registered successfully".
                    └─► Refresh endpoint table and trigger an initial automatic probe.
```

---

## 7. Design System

PulseCheck uses a **Calm Neutral Dark Mode** by default, mirroring industry-standard developer platforms (Linear, Vercel, Datadog).

### Color Palette (Semantic Tokens)

```
TOKEN                    HEX / VALUE      USAGE / PURPOSE
─────────────────────────────────────────────────────────────────────────────
--bg-canvas              #09090b (zinc-950) Base page canvas background
--bg-surface             #121215 (zinc-900) Card and table backgrounds
--bg-surface-elevated    #18181b (zinc-900+) Hover rows, modal surfaces
--bg-surface-subtle      #27272a (zinc-800) Chip backgrounds, input canvas

--border-subtle          #27272a (zinc-800) Standard card & divider lines
--border-strong          #3f3f46 (zinc-700) Input borders, active states
--border-focus           #6366f1 (indigo-500) Focus rings (WCAG 3:1 contrast)

--text-primary           #f4f4f5 (zinc-100) Primary headings, active metrics
--text-secondary         #a1a1aa (zinc-400) Body text, table labels, table cells
--text-muted             #71717a (zinc-500) Helper text, timestamps, units

--status-up-text         #34d399 (emerald-400) Healthy operational text
--status-up-bg           rgba(52, 211, 153, 0.10) Healthy pill background
--status-up-border       rgba(52, 211, 153, 0.25) Healthy border outline
--status-up-solid        #10b981 (emerald-500) Dot indicator

--status-degraded-text   #fbbf24 (amber-400) Degraded / High latency text
--status-degraded-bg     rgba(251, 191, 36, 0.10) Degraded pill background
--status-degraded-border rgba(251, 191, 36, 0.25) Degraded border outline
--status-degraded-solid  #f59e0b (amber-500) Triangle indicator

--status-down-text       #f87171 (rose-400) Critical failure / Down text
--status-down-bg         rgba(248, 113, 113, 0.10) Down pill background
--status-down-border     rgba(248, 113, 113, 0.25) Down border outline
--status-down-solid      #ef4444 (rose-500) Cross indicator
```

### Typography Hierarchy
PulseCheck relies on clean system font stacks or Google Font `Inter` paired with a fixed-width monospace font (`JetBrains Mono` or `ui-monospace`) for numerical data and URLs.

| Element | Size / Line Height | Weight | Tracking | Family |
|---|---|---|---|---|
| **Display KPI Number** | `28px / 34px` | SemiBold (600) | `-0.02em` | System Sans / Inter |
| **Page Title (H1)** | `20px / 26px` | SemiBold (600) | `-0.015em` | System Sans / Inter |
| **Section Header (H2)**| `15px / 20px` | Medium (500) | `-0.01em` | System Sans / Inter |
| **Body Primary** | `13px / 18px` | Regular (400) | `normal` | System Sans / Inter |
| **Body Secondary** | `12px / 16px` | Regular (400) | `normal` | System Sans / Inter |
| **Code / URL / Latency**| `12px / 16px` | Medium (500) | `normal` | `JetBrains Mono` / Monospace |
| **Micro Badge / Caps** | `11px / 14px` | SemiBold (600) | `+0.04em` | System Sans / Inter |

### Spacing Scale
Built upon an 8-point base grid:
- `space-1`: `4px` (Micro gap between icon and text)
- `space-2`: `8px` (Internal button padding, badge padding)
- `space-3`: `12px` (Dense card padding, input vertical padding)
- `space-4`: `16px` (Standard component padding, card margin)
- `space-6`: `24px` (Section gaps, modal padding)
- `space-8`: `32px` (Major layout vertical rhythm)

### Border Radius
Subtle, engineered radii:
- Badges & Buttons: `rounded-md` (`6px`)
- Cards, Modals, Tables: `rounded-lg` (`8px`)
- Full pill indicators: `rounded-full` (`9999px`)

### Shadows & Depth
- **Surface Elevation**: Achieved through **1px crisp borders (`border-zinc-800`)**, not muddy drop-shadows.
- **Modal Elevation**: `box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);`

---

## 8. Component Inventory

| Component Name | Purpose | Key Props / Content | States |
|---|---|---|---|
| `AppHeader` | Global branding, live pulse, and primary CTA. | Brand mark, status indicator, `onAddEndpoint` | Default, Loading |
| `SummaryCard` | Displays top-level KPI metric. | `label`, `value`, `subtext`, `variant` (neutral, up, degraded, down) | Default, Skeleton |
| `EndpointRow` | Primary row in endpoint table. | `endpoint`, `latestCheck`, `onCheckNow`, `onSelect` | Default, Hover, Probing, Error |
| `StatusBadge` | Accessible status pill. | `status: 'up' \| 'degraded' \| 'down'` | Active, Muted |
| `CheckButton` | Button to trigger on-demand probe. | `onClick`, `isProbing` | Idle, Hover, Loading (Spinner), Disabled |
| `LatencyDisplay` | Displays latency in relation to SLA. | `latencyMs: number \| null`, `thresholdMs: number` | Normal, Over-SLA (Amber), Failed (Null) |
| `LatencyChart` | Recharts timeseries visualization. | `data: Check[]`, `thresholdMs: number` | Loading, Populated, Empty |
| `HistoryTable` | Detailed timeseries audit log. | `checks: Check[]`, `limit: number` | Default, Empty, Loading |
| `AddEndpointModal`| Dialog to register new API targets. | `isOpen`, `onClose`, `onSuccess` | Open, Validating, Submitting, Conflict |
| `DeleteModal` | Confirmation modal for endpoint deletion. | `endpointName`, `onConfirm`, `onClose` | Open, Submitting |
| `EmptyState` | Helpful zero-data display. | `icon`, `title`, `description`, `action` | Display |

---

## 9. Status Design

PulseCheck strictly enforces **multi-factor accessibility**: health status is NEVER communicated by color alone. Every status instance pairs:
1. **A dedicated SVG Icon shape** (Circle for UP, Triangle for DEGRADED, Octagon/Cross for DOWN).
2. **A semantic label in ALL CAPS** (`UP`, `DEGRADED`, `DOWN`).
3. **A distinct tokenized color & container border**.

```
HEALTH TIER   ICON SHAPE           TEXT LABEL   BG COLOR              TEXT COLOR         BORDER COLOR
────────────────────────────────────────────────────────────────────────────────────────────────────────
UP            ● Solid Circle       UP           rgba(52,211,153,0.1)  #34d399 (Emerald)  rgba(52,211,153,0.3)
DEGRADED      ▲ Alert Triangle     DEGRADED     rgba(251,191,36,0.1)  #fbbf24 (Amber)    rgba(251,191,36,0.3)
DOWN          ✕ Octagonal Cross    DOWN         rgba(248,113,113,0.1) #f87171 (Rose)     rgba(248,113,113,0.3)
UNKNOWN       ◌ Dashed Circle      NO DATA      rgba(161,161,170,0.1) #a1a1aa (Zinc)     rgba(161,161,170,0.3)
```

### Contextual Appearances
- **Endpoint List Table**: Status appears as a high-contrast pill with icon, text, and optional error chip (e.g. `✕ DOWN [HTTP 503]`).
- **Endpoint Detail Header**: Displayed prominently next to the endpoint title with timestamp of the evaluation.
- **History Table Rows**: The status badge is compact (`h-6`), maintaining tight table row density (`36px` height).

---

## 10. Data Visualization (Latency & SLA Chart)

### Analytical Purpose
The chart directly answers: **"Is this service maintaining its latency SLA over time, and when did spikes occur?"**

```
 1000 ms ─────────────────────────────────────────────────────────
                                          ▲ Spike: 920ms (14:32)
  750 ms ─────────────────────────────────┼───────────────────────
  500 ms - - - - - - - - - - - - - - - - -│- - - - - SLA Threshold (500 ms)
                                        ╭─┴─╮
  250 ms ───────────────╭─╮─────────────╯   ╰─────────────────────
         ───────╭───────╯ ╰─────────────     ─────────────────────
    0 ms ───────┴─────────────────────────────────────────────────
         18:00    22:00    02:00    06:00    10:00    14:00    18:00
```

### Chart Specifications
- **Component**: Recharts `AreaChart` or `LineChart`.
- **X-Axis**: Time of check (`checkedAt`). Formatted as `HH:mm` on tick marks.
- **Y-Axis**: Response time in milliseconds (`latencyMs`). Dynamic domain starting at `0` up to `max(latency, threshold * 1.5)`.
- **Threshold Line**: Fixed horizontal reference line (`ReferenceLine`) at `y = latencyThresholdMs`, colored in amber dashed stroke (`#f59e0b`, `strokeDasharray="4 4"`), labeled with `SLA: {threshold}ms`.
- **Latency Line/Area**:
  - Gradient stroke transitioning smoothly.
  - Dot rendered only on hover or when an evaluation is DEGRADED or DOWN.
- **Custom Tooltip**:
  - Timestamp (formatted with seconds: `YYYY-MM-DD HH:mm:ss`).
  - Status badge (`UP`, `DEGRADED`, `DOWN`).
  - Latency (`{latencyMs} ms` with comparison `+120 ms over SLA`).
  - HTTP Status Code / Error Type.
- **Handling Missing / Null Latency (Failed Checks)**:
  - Down checks with `latencyMs = null` (e.g. DNS failure) are represented on the baseline with a distinct red failure marker/glyph (`✕`) so downtime is visible on the timeseries.

---

## 11. Table / History Design

The Check History table displays recent audit observations from `GET /api/endpoints/:id/history`.

### Column Architecture
1. **Time**: Relative time with absolute timestamp in tooltip (`12s ago` → `2026-09-30 17:59:42`).
2. **Status**: Accessible badge (`UP`, `DEGRADED`, `DOWN`).
3. **HTTP Code**: Badge showing status code (`200`, `404`, `503`) or `-` on connection failure.
4. **Latency**: Monospace font (`124 ms`). Text color turns amber if exceeding threshold.
5. **Diagnostics**: Error type (`timeout`, `dns`, `network`, `http`) and error message.

### Interaction & Styling Rules
- **Row Density**: Compact `36px` to `40px` row heights for maximum information density.
- **Zebra Striping / Dividers**: Subtle borders (`border-b border-zinc-800/60`).
- **Error Details**: Truncated with ellipsis; hovering displays a tooltip with the complete error string.

---

## 12. Empty States

### Case A: No Endpoints Registered
- **Visual**: Subtle radar scan icon.
- **Headline**: `No endpoints under observation`
- **Body**: `PulseCheck monitors external and internal HTTP APIs for availability and latency SLAs. Register your first endpoint to begin collecting telemetry.`
- **Action**: Direct `+ Register Endpoint` primary button.

### Case B: Endpoint Created, No Checks Recorded Yet
- **Headline**: `Awaiting initial probe`
- **Body**: `This endpoint has been registered but has not completed its initial health check.`
- **Action**: Prominent `[ Run First Check ]` button.

### Case C: No Checks in 24-Hour Window
- **Headline**: `No telemetry in the last 24 hours`
- **Metrics Display**: Renders `--` for percentages and `null` indicators rather than deceptive `0.0%` or `0 ms`.

---

## 13. Loading & Mutation States

To prevent layout thrashing and accidental duplicate network requests:

1. **Dashboard Initial Load**: Replaced by skeletal wireframe rectangles mirroring the 4 KPI cards and 5 table rows (`animate-pulse bg-zinc-800/50 rounded`).
2. **"Check Now" Button Interaction**:
   - Button immediately transitions to disabled state.
   - Text switches from `Check Now` to a spinning indicator + `Probing...`.
   - Prevents double-clicking or duplicate concurrent probes.
3. **Modal Submission**:
   - Primary submit button shows spinner and disables all input fields.
4. **Detail Chart Loading**:
   - Replaced by a skeleton frame matching the height of the chart container (`h-64`).

---

## 14. Error States & Fault Classification

PulseCheck strictly separates **System Operational Failures** from **Monitored API Health Failures**:

```
┌────────────────────────────────────────────────────────────────────────┐
│ ERROR TAXONOMY                                                         │
├──────────────────────────────────┬─────────────────────────────────────┤
│ TYPE 1: PULSECHECK INFRASTRUCTURE │ TYPE 2: MONITORED TARGET DEGRADATION│
│ (System Error)                   │ (Operational Observation)           │
├──────────────────────────────────┼─────────────────────────────────────┤
│ - PostgreSQL DB connection down   │ - Target returns HTTP 500 / 503     │
│ - Failed to load endpoints (500) │ - Target probe times out (>5000ms)  │
│ - Network drop between browser   │ - Target DNS failure (ENOTFOUND)    │
│   and PulseCheck API             │ - Target latency > 500ms SLA        │
├──────────────────────────────────┼─────────────────────────────────────┤
│ UI Manifestation:                │ UI Manifestation:                   │
│ - Global Alert Banner            │ - Normal operational UI state       │
│ - "Retry Connection" button      │ - Red/Amber Status Badges           │
│ - Toasts with actionable errors  │ - Telemetry plotted in history      │
└──────────────────────────────────┴─────────────────────────────────────┘
```

---

## 15. Responsive Design Strategy

| Breakpoint | Viewport Width | Layout Adaptations |
|---|---|---|
| **Desktop** | `>= 1024px` | Full data grid; 4 KPI summary cards in a row; full multi-column history table; wide timeseries chart. |
| **Tablet** | `768px – 1023px` | KPI summary cards wrap to 2x2 grid; table columns prioritize Status, Latency, and Check Now; secondary details collapse into expandable row. |
| **Mobile** | `< 768px` | KPI cards stack; Endpoint Table transforms into high-density **Stacked Operational Cards**; chart simplifies tick labels; Top Header moves "+ Add" into floating action button or compact top right icon. |

---

## 16. Accessibility (A11y) Standards

PulseCheck adheres to **WCAG 2.1 Level AA**:
1. **Color Independence**: Status is conveyed via shapes, text strings, and colors simultaneously.
2. **Contrast Ratios**: All foreground text on dark canvas exceeds `4.5:1` contrast ratio (`#f4f4f5` on `#09090b` is `16.5:1`).
3. **Keyboard Navigation**:
   - Full keyboard accessibility for table rows, buttons, and modals.
   - Visible focus indicators: `outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950`.
   - Modals trap focus and close on `Escape`.
4. **Screen Reader Semantic Markup**:
   - Standard HTML5 landmarks (`<header>`, `<main>`, `<section>`, `<table>`).
   - `aria-live="polite"` on the status ribbon when an on-demand check completes.
   - Descriptive `aria-label` tags on icon-only buttons.

---

## 17. Micro-Interactions

Subtle, high-performance interactions built purely with CSS:
- **Button Hover**: `transition: background-color 150ms cubic-bezier(0.4, 0, 0.2, 1), border-color 150ms;`
- **Button Active**: Scale down by `0.98` (`active:scale-[0.98]`) for tactile feedback.
- **Row Hover**: Background shifts from `bg-transparent` to `bg-zinc-900/60`.
- **Status Pulse**: Healthy endpoints feature a calm, subtle ambient ping indicator (`animate-ping opacity-75 duration-1000`).
- **Modal Transition**: Clean fade-in (`opacity-0` to `opacity-100`) with minor scale (`scale-95` to `scale-100`) over `150ms`.

---

## 18. Design Anti-Patterns (What NOT to Do)

1. **NO Flashy Decorative Gradients**: No purple-to-pink gradient text or glowing background orbs.
2. **NO Excessive Glassmorphism**: Avoid unreadable frosted glass layers with low contrast.
3. **NO Rounded Pills for Everything**: Avoid `rounded-3xl` cards that waste screen real estate.
4. **NO Fake Telemetry or Mock Data**: Never display simulated latency spikes or hardcoded mock counters.
5. **NO Unnecessary Animations**: No bouncy physics, no floating elements, no parallax scrolling.
6. **NO Generic Landing Page Heroes**: PulseCheck is a functional dashboard, not a B2B marketing funnel. The top of the screen immediately displays operational data.

---

## 19. Implementation Constraints & Technology Alignment

- **Framework**: Next.js App Router (already pinned at 16.3.7).
- **Styling**: Tailwind CSS with semantic utility classes.
- **Charts**: Recharts (pinned in `package.json`).
- **Icons**: Clean inline SVGs or standard feather/lucide style SVGs (no bloated icon library).
- **Backend Coupling**: The UI must exclusively consume the Phase 5 API routes. No duplicate validation logic that conflicts with `services/endpoints.ts`.

---

## 20. API → UI Data Mapping

| UI View / Component | API Route | HTTP Method | Consumed Fields | Rendered UI Element |
|---|---|---|---|---|
| **Overview Table** | `/api/endpoints` | `GET` | `id`, `name`, `url`, `latencyThresholdMs`, `createdAt` | Endpoint List, Service Name, URL chip, SLA target |
| **Global KPIs** | Derived from endpoints + `/api/endpoints/:id/metrics` | `GET` | `uptime`, `errorRate`, `status` | Summary cards: Total, Operational, Degraded, Down |
| **Add Endpoint** | `/api/endpoints` | `POST` | Body: `{ name, url, latencyThresholdMs }` | Modal Form submission; returns created `Endpoint` |
| **Delete Endpoint** | `/api/endpoints/:id` | `DELETE` | Path parameter: `id` | Row action menu → Confirm Dialog → Table removal |
| **Check Now** | `/api/endpoints/:id/check` | `POST` | Path parameter: `id` | Row action button; returns `CheckResult` & updates badge |
| **Detail Metrics** | `/api/endpoints/:id/metrics` | `GET` | `uptime`, `errorRate`, `averageLatencyMs`, `p95LatencyMs`, `totalChecks` | 4 Detail KPI Cards, P95 badge, Availability Gauge |
| **Latency Chart** | `/api/endpoints/:id/history` | `GET` | `checkedAt`, `latencyMs`, `status`, `latencyThresholdMs` | Timeseries line graph with SLA threshold reference line |
| **History Audit** | `/api/endpoints/:id/history` | `GET` | `id`, `checkedAt`, `statusCode`, `latencyMs`, `status`, `errorType`, `errorMessage` | Chronological audit table with pagination/limit |

---

## 21. Key Architectural & Design Decisions

1. **Decision: Master-Detail Architecture over Multi-page Routing**
   - *Rationale*: Network engineers diagnosing outages frequently jump between services. A responsive master-detail layout avoids repeated page reloads and preserves filter context.

2. **Decision: Triple-Redundancy Status Indicators (Shape + Label + Color)**
   - *Rationale*: Color blindness (especially red-green deuteranopia) is common among engineers. Combining icon shapes (`●`, `▲`, `✕`), textual status labels, and colors prevents misinterpretation during critical production incidents.

3. **Decision: Nearest-Rank P95 Display alongside Average Latency**
   - *Rationale*: Averages obscure high-latency tail events. Providing both Average and P95 latency gives engineers immediate clarity on whether latency degradation affects all users or represents edge-case tail anomalies.

4. **Decision: High Information Density over Expansive Whitespace**
   - *Rationale*: Observability tools require high density. Engineers prefer scanning 15 endpoints on a single screen over scrolling past large cards with low information content.
