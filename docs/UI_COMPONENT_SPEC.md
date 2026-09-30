# PulseCheck — UI Component & Frontend Implementation Specification
**Phase 6B: Component Architecture & Data Contracts**  
**Document Version:** 1.0.0  
**Target:** Implementation Phase (Phase 6C)  
**Strict Directives:** No mock telemetry, no invented metrics ("Net Health" eliminated), accurate latency representation (null latency != 0ms), multi-factor accessible status, and explicit API contract validation.

---

## 1. Page Structure

PulseCheck employs a single-page Master-Detail layout with a modal registration dialog. This structure preserves operational context, minimizes navigation latency, and avoids deep multi-page nesting.

```
AppShell
├── AppHeader (Height: 56px, Fixed/Sticky top)
│   ├── Brand & Identity ("PulseCheck")
│   ├── Global Telemetry Pulse Indicator
│   └── Primary Action ("+ Add Endpoint" Button)
│
└── MainContent Canvas (Max-width: 1280px, Centered, Padding: 24px/16px)
    ├── SystemOverview (Summary KPI Metric Grid)
    │   ├── SummaryCard: Total Monitored
    │   ├── SummaryCard: Operational (UP)
    │   ├── SummaryCard: Degraded (Slow)
    │   └── SummaryCard: Failing (DOWN)
    │
    ├── EndpointManagement (Primary Operational Section)
    │   ├── EndpointToolbar (Search filter + Health status filter tabs)
    │   └── EndpointTable (Dense tabular list of monitored APIs)
    │       ├── EndpointTableHeader
    │       └── EndpointRow (Repeated per endpoint)
    │           ├── EndpointIdentityCell (Name + Monospace URL)
    │           ├── StatusBadge (Icon + Label + Color)
    │           ├── LatencyDisplay (Current response vs. Threshold)
    │           ├── CheckButton ("Check Now" on-demand probe)
    │           └── ActionMenu (Contextual delete/inspect triggers)
    │
    └── EndpointDetailPanel (Contextual Deep-Dive View)
        ├── EndpointDetailHeader (Title, Target URL, Threshold, Check Now, Delete)
        ├── MetricsGrid (24h Uptime %, 24h Error Rate %, Avg Latency, P95 Latency)
        ├── LatencyChart (Recharts timeseries: Latency vs. Threshold reference line)
        └── HistoryTable (Recent checks log with status code and error diagnostics)

Modals & Overlays
├── AddEndpointModal (Focus-trapped dialog for registering endpoints)
├── ConfirmDeleteModal (Destructive confirmation dialog)
└── ToastContainer (Ephemeral operational notifications)
```

---

## 2. App Header

### Dimensions & Layout
- **Height**: Fixed `56px` (`h-14`).
- **Horizontal Padding**: `16px` (`px-4`) on mobile, `24px` (`px-6`) on desktop.
- **Positioning**: Sticky top (`sticky top-0 z-40`), canvas background (`bg-zinc-950/80 backdrop-blur-md`), 1px bottom border (`border-b border-zinc-800`).

### Visual Elements
1. **Brand Treatment**:
   - Monospace/Sans text: `PulseCheck`.
   - Typography: `15px`, font weight `600`, tracking `-0.02em`, color `text-zinc-100`.
   - Icon: Inline SVG pulse waveform mark (`18px x 18px`, `text-indigo-400`).
2. **Telemetry Status Indicator**:
   - Small status pill: `text-xs text-zinc-400 font-mono flex items-center gap-1.5`.
   - Visual: 6px static circle dot (`bg-emerald-500 rounded-full`). No constant distracting animations or decorative pulsing.
   - Text: `System Active`.
3. **Primary Action ("+ Add Endpoint")**:
   - Variant: Primary Solid Button.
   - Background: `bg-zinc-100 text-zinc-950 hover:bg-zinc-200 active:bg-zinc-300`.
   - Typography: `13px`, font weight `500`.
   - Padding: `px-3.5 py-1.5`, `rounded-md`.
   - Icon: Plus symbol (`w-4 h-4 mr-1.5`).

### Responsive & Accessibility Behavior
- **Mobile (< 768px)**: Brand title shortens if viewport < 360px. Button shows icon + "Add" instead of full "+ Add Endpoint".
- **Keyboard Navigation**: Tab-navigable with clear focus ring (`focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950`).

---

## 3. Summary Metrics

The System Overview ribbon provides immediate global situational awareness across all registered APIs.

### Metric Cards Specification

| Card Label | Primary Value | Subtext / Context | Visual Variant | Data Source & Contract Status |
|---|---|---|---|---|
| **Total Monitored** | Integer count (e.g. `14`) | Registered APIs under probe | Neutral (`text-zinc-100`) | Directly available: `endpoints.length` from `GET /api/endpoints`. |
| **Operational** | Integer count (e.g. `11`) | Latency <= Threshold | Emerald (`text-emerald-400`) | **API enhancement required** (See Section 22). Derived on client from latest checks. |
| **Degraded** | Integer count (e.g. `2`) | Latency > Threshold | Amber (`text-amber-400`) | **API enhancement required** (See Section 22). Derived on client from latest checks. |
| **Failing** | Integer count (e.g. `1`) | HTTP 4xx/5xx, Timeout, DNS | Rose (`text-rose-400`) | **API enhancement required** (See Section 22). Derived on client from latest checks. |

### Component States
- **Loading State**: Render 4 skeletal wireframe rectangles (`h-24 rounded-lg bg-zinc-900 border border-zinc-800 animate-pulse`).
- **Empty State (0 Endpoints)**: Display `0` for Total Monitored, and `--` for Operational, Degraded, and Failing with subtext `No endpoints registered`.
- **Unavailable State**: If data retrieval fails, render `--` in muted zinc (`text-zinc-500`) with tooltip: `Telemetry unavailable`.

---

## 4. Endpoint List

The primary operational dashboard component displays all registered endpoints.

### Field Definitions & Data Dependencies

| Display Field | Source API | Source Property | Formatting / Render | Null / Empty Behavior | Error Behavior |
|---|---|---|---|---|---|
| **Service Name** | `GET /api/endpoints` | `endpoint.name` | Bold text (`font-medium text-zinc-100 text-sm`) | Required string | Truncate with ellipsis after 240px |
| **Target URL** | `GET /api/endpoints` | `endpoint.url` | Monospace muted (`font-mono text-xs text-zinc-400 truncate`) | Required string | Truncate with title tooltip |
| **Current Status** | Latest check | `check.status` | `<StatusBadge status={status} />` | Render `◌ NO DATA` if no check history exists | Render `Error` badge if probe crashed |
| **Current Latency** | Latest check | `check.latencyMs` | Monospace ms (e.g. `142 ms`) | Render `--` if `latencyMs === null` (Never 0 ms) | Render `--` |
| **Latency Threshold** | `GET /api/endpoints` | `endpoint.latencyThresholdMs` | `Threshold: {ms} ms` (`font-mono text-xs text-zinc-500`) | Defaults to `500 ms` | Fallback to `500 ms` |
| **24h Uptime** | `GET /api/endpoints/:id/metrics` | `metrics.uptime` | Fixed 1 decimal (`99.8%`) | Render `--` if `totalChecks === 0` | Render `--` |
| **24h P95 Latency** | `GET /api/endpoints/:id/metrics` | `metrics.p95LatencyMs` | Monospace ms (`P95: {ms} ms`) | Render `--` if no valid latency points exist | Render `--` |
| **Check Now** | Action Trigger | Direct interaction | `<CheckButton endpointId={id} />` | Always enabled unless actively probing | Disabled on client error |

---

## 5. Endpoint Row

### Dimensions & Typography
- **Row Height**: `52px` (`h-[52px]`) for desktop table; dense padding (`py-3 px-4`).
- **Borders**: 1px subtle divider (`border-b border-zinc-800/80`).
- **Interactive States**:
  - **Idle**: Canvas surface (`bg-zinc-950` or `bg-zinc-900/40`).
  - **Hover**: Subtle lift (`hover:bg-zinc-900/90 transition-colors duration-150`).
  - **Selected / Active**: High-contrast outline (`bg-zinc-900 border-l-2 border-l-indigo-500`).
  - **Focus-Visible**: Keyboard focus ring (`focus-visible:ring-1 focus-visible:ring-indigo-500`).

### Row Health & Operational States
1. **UP**: Badge shows `● UP`, latency text in neutral zinc (`text-zinc-300`).
2. **DEGRADED**: Badge shows `▲ DEGRADED`, latency text in amber (`text-amber-400 font-semibold`) with delta tooltip (`+184ms over threshold`).
3. **DOWN**: Badge shows `✕ DOWN`, latency text shows `--`, secondary chip displays error cause (`HTTP 503`, `Timeout`, `DNS Failure`).
4. **NO DATA**: Badge shows `◌ NO DATA` (`text-zinc-500`), latency displays `--`, subtext: `Awaiting initial probe`.
5. **CHECKING**: Check button shows spinner; row status shows subtle loading indicator.
6. **ERROR**: If backend query fails, row displays warning indicator with retry button.

### Mobile Transformation (< 768px)
The table headers collapse into a **Stacked Operational Card**:
```
+----------------------------------------------------------------+
|  Production Auth Gateway                          [ Check Now ]|
|  https://auth.internal.api/v1                                  |
|                                                                |
|  Status: ● UP         Latency: 124 ms       Threshold: 300 ms   |
|  24h Uptime: 99.9%    24h P95: 185 ms                          |
+----------------------------------------------------------------+
```

---

## 6. Status Badge

Status is communicated with triple-factor redundancy: **Shape + Text Label + Color Tokens**. Status is never conveyed through color alone.

### Specification Matrix

| State | Icon Shape | Label | Text Token | Background Token | Border Token | Accessible ARIA Label |
|---|---|---|---|---|---|---|
| **UP** | `●` Filled Circle (`w-2 h-2`) | `UP` | `text-emerald-400` | `bg-emerald-500/10` | `border-emerald-500/25` | `aria-label="Health status: Operational"` |
| **DEGRADED** | `▲` Triangle (`w-2.5 h-2.5`) | `DEGRADED` | `text-amber-400` | `bg-amber-500/10` | `border-amber-500/25` | `aria-label="Health status: Degraded latency"` |
| **DOWN** | `✕` Octagon Cross (`w-2.5 h-2.5`)| `DOWN` | `text-rose-400` | `bg-rose-500/10` | `border-rose-500/25` | `aria-label="Health status: Service Down"` |
| **NO DATA** | `◌` Dotted Circle (`w-2 h-2`) | `NO DATA` | `text-zinc-400` | `bg-zinc-500/10` | `border-zinc-500/25` | `aria-label="Health status: Awaiting check"` |

### Physical Dimensions
- Padding: `px-2 py-0.5`.
- Typography: `11px`, `font-mono`, `font-semibold`, tracking `0.04em`.
- Radius: `rounded-md` (`4px`).
- Gap: `gap-1.5` between icon and label.

---

## 7. Latency Display

Latency must clearly communicate actual response time in comparison to the configured threshold.

### Numerical Rules
1. **Never Show Null as Zero**: If `latencyMs === null` (failed check, timeout, DNS error), render `--` in muted zinc (`text-zinc-500`). Never render `0 ms`.
2. **Units Required**: Explicitly render `ms` suffix in muted text.
3. **Threshold Context**: Always present the baseline threshold alongside or under the latency measurement.

### Visual Variations
- **Normal Latency (`latencyMs <= latencyThresholdMs`)**:
  - Layout: `124 ms` (`text-zinc-200 font-mono text-sm`).
  - Secondary label: `Threshold: 500 ms` (`text-zinc-500 font-mono text-xs`).
- **Exceeding Threshold (`latencyMs > latencyThresholdMs`)**:
  - Layout: `684 ms` (`text-amber-400 font-mono font-semibold text-sm`).
  - Secondary label: `Threshold: 500 ms (+184 ms)` (`text-amber-500/80 font-mono text-xs`).
- **Null Latency (Connection Failed / Timeout)**:
  - Layout: `--` (`text-zinc-500 font-mono text-sm`).
  - Secondary label: `No response` (`text-rose-400/90 font-mono text-xs`).
- **Probing State**:
  - Layout: `Probing...` (`text-zinc-400 font-mono text-xs animate-pulse`).

---

## 8. Endpoint Detail Panel

The Endpoint Detail view provides deep operational diagnosis. It appears as an expandable panel or dedicated view when selecting an endpoint.

### Hierarchy & Above-the-Fold Prioritization
```
1. Back Navigation & Action Header (Above fold)
   ├── Breadcrumbs: "Endpoints / [Service Name]"
   ├── Target URL chip (copyable) & Latency Threshold badge
   └── Primary Actions: [ Check Now ] [ Delete Endpoint ]
2. Operational Health Ribbon (Above fold)
   └── Current Health Badge (UP / DEGRADED / DOWN) + "Last evaluated: 2m ago"
3. 24-Hour Reliability Metrics (Above fold)
   └── 4-Card KPI Grid: Uptime %, Error Rate %, Avg Latency, P95 Latency
4. Latency vs. Threshold Timeseries Chart (Immediately below KPIs)
   └── Interactive 24-hour Recharts line visualization with SLA reference line
5. Recent Check Audit Table (Scrollable diagnostic history)
   └── Chronological inspection log with status codes and raw error diagnostic strings
```

---

## 9. Detail Metrics

The Detail Metrics component renders the 24-hour rolling reliability calculation returned by `GET /api/endpoints/:id/metrics`.

### Metric Fields & Boundaries

| Metric Token | Label | Formatted Value | Meaning / Bounds | Missing / Unavailable Value |
|---|---|---|---|---|
| `uptime` | `24h Uptime` | `{val.toFixed(2)}%` (e.g. `99.95%`) | Successful probes / total probes * 100 | `--` (if `totalChecks === 0`) |
| `errorRate` | `24h Error Rate` | `{val.toFixed(2)}%` (e.g. `0.05%`) | Failed (DOWN) probes / total * 100 | `--` (if `totalChecks === 0`) |
| `averageLatencyMs`| `Average Latency` | `{Math.round(val)} ms` | Mean latency of successful checks | `--` (if no valid latencies) |
| `p95LatencyMs` | `P95 Latency` | `{Math.round(val)} ms` | Nearest-Rank 95th percentile latency | `--` (if no valid latencies) |
| `totalChecks` | `Total Checks` | `{val.toLocaleString()}` checks | Sample count over last 24 hours | `0 checks` |

*Constraint*: No "Net Health", "Composite Score", or artificial synthetic metrics may be rendered.

---

## 10. Latency Chart

The timeseries visualization plots check results from `GET /api/endpoints/:id/history`.

### Visual Specifications (Recharts)
- **Container Height**: Fixed `260px` (`h-[260px]`).
- **X-Axis**: `dataKey="checkedAt"`.
  - Format: 24-hour timestamps formatted as `HH:mm`.
  - Stroke: `#3f3f46` (`zinc-700`). Tick font: `11px font-mono #71717a`.
- **Y-Axis**: `dataKey="latencyMs"`.
  - Unit: `ms`.
  - Scale: Linear, starting at `0`, top margin dynamic: `max(peakLatency, threshold * 1.4)`.
  - Tick count: 4 ticks.
- **Reference Line (Threshold SLA)**:
  - Fixed horizontal reference line: `y={endpoint.latencyThresholdMs}`.
  - Stroke: `#f59e0b` (`amber-500`), dashed: `strokeDasharray="4 4"`, stroke width: `1.5`.
  - Label: `Threshold: {ms}ms` positioned top-right in amber text.
- **Latency Line & Area**:
  - Type: Monotone (`type="monotone"`).
  - Stroke: Indigo `#6366f1` (`strokeWidth={2}`).
  - Fill: Subtle linear gradient (`#6366f1` at 15% opacity to 0% at bottom).

### Handling Null Latencies & Failed Checks
- **Strict Rule**: When `latencyMs === null` (probes that failed due to timeout, DNS error, or HTTP error):
  - **Do NOT plot at 0 ms** (this misleadingly implies zero response time).
  - **Do NOT silently interpolate** (this hides the outage duration).
  - **Representation**: Disconnect the line (broken segment) and plot a distinct red marker (`✕` at the baseline) accompanied by an error tooltip indicating `Probe Failed: [Error Type]`.

### Tooltip Specification
- Background: `bg-zinc-900 border border-zinc-700 rounded-md p-2.5 shadow-xl`.
- Content:
  - Timestamp: `YYYY-MM-DD HH:mm:ss` (`text-zinc-400 font-mono text-xs`).
  - Status: Badged (`UP`, `DEGRADED`, `DOWN`).
  - Latency: `latencyMs !== null ? `${latencyMs} ms` : 'No response'`.
  - Delta: `latencyMs > threshold ? `${latencyMs - threshold} ms above threshold` : null`.
  - Status Code: `statusCode ? `HTTP ${statusCode}` : 'Connection Error'`.

---

## 11. History Table

The Check History table displays recent audit observations from `GET /api/endpoints/:id/history`.

### Columns & Density

| Column | Width | Alignment | Content & Formatting |
|---|---|---|---|
| **Timestamp** | `180px` | Left | Relative time (`12s ago`) with absolute ISO date on hover tooltip (`font-mono text-xs text-zinc-300`). |
| **Status** | `110px` | Left | `<StatusBadge status={check.status} />` |
| **HTTP Code** | `90px` | Left | Monospace chip: `200 OK` (neutral), `500 Server Error` (rose), `--` (connection failed). |
| **Latency** | `110px` | Right | `latencyMs !== null ? `${latencyMs} ms` : '--'` (amber if > threshold, muted if null). |
| **Diagnostics / Error** | Fluid | Left | `errorType` badge (`timeout`, `dns`, `network`, `http`) + truncated `errorMessage`. Tooltip on hover. |

- **Density**: Compact table rows (`36px` height).
- **Zebra / Borders**: Subtle row separator (`border-b border-zinc-800/60`).
- **Pagination / Limit**: Displays up to 50 checks (backend default).

---

## 12. Add Endpoint Modal

Triggered by the header action button. Implements accessible focus trapping and real-time backend constraint validation.

### Form Inputs & Constraints

```
+--------------------------------------------------------------+
| Register New Endpoint                                   [ ✕ ]|
| Configure an HTTP/HTTPS API for active health observation.   |
+--------------------------------------------------------------+
|                                                              |
| Service Name *                                               |
| [ Stripe Webhook Dispatcher                                ] |
| 1–100 characters. e.g. Customer Authentication Gateway       |
|                                                              |
| Target URL *                                                 |
| [ https://api.stripe.com/v1/health                         ] |
| Must be valid HTTP or HTTPS address. Max 2048 chars.         |
|                                                              |
| Latency Threshold (ms) *                                     |
| [ 500                                                      ] |
| Default: 500 ms. Probes exceeding this are marked DEGRADED.  |
|                                                              |
+--------------------------------------------------------------+
| [ Cancel ]                               [ Register Endpoint ]|
+--------------------------------------------------------------+
```

### Operational Workflow
1. User clicks **"Register Endpoint"**.
2. **Client-Side Validation (Zod)** validates inputs against `createEndpointSchema`.
3. If invalid: Display specific inline error message under violating input. Focus remains on first invalid field.
4. If valid: Submit `POST /api/endpoints`.
   - Submit button enters loading state: shows spinner + `Registering...`, inputs disabled.
5. On `409 Conflict`: Display error banner: `An endpoint with this URL already exists.` Highlight URL input border red.
6. On `201 Created`:
   - Close modal dialog immediately.
   - Show toast notification: `Endpoint registered successfully`.
   - Refresh endpoint list.
   - **Crucial Rule**: Do NOT automatically dispatch a health check. The new endpoint enters the `◌ NO DATA` state awaiting user check.

---

## 13. "Check Now" Interaction Specification

The manual probe action allows on-demand verification via `POST /api/endpoints/:id/check`.

```
[ IDLE ]
Button: [ ⟳ Check Now ]
Visual: Border button, text-zinc-300, border-zinc-700, hover:bg-zinc-800.
              │
              ▼ (User Clicks Button)
[ PROBING / LOADING ]
Button: [ ◌ Probing... ] (Spinning SVG circle)
State: Disabled. Pointer events none. Prevents duplicate network dispatches.
Row status updates to: "Probing..."
              │
              ├──────────────────────────────────────────────┐
              ▼ (HTTP 200: Probe Executed)                   ▼ (HTTP 4xx/5xx / Network Crash)
[ MONITORING SUCCESS ]                         [ PULSECHECK APPLICATION ERROR ]
Row updates immediately with persisted data:   Button resets to Idle.
- If target was UP: ● UP (124 ms)              Display alert toast:
- If target was DEGRADED: ▲ DEGRADED (680 ms)  "Probe dispatch failed: [Error details]"
- If target was DOWN: ✕ DOWN (HTTP 500/Timeout)
Toast: "Check completed: [Status]"
```

*Note*: If the target API returns `503 Service Unavailable`, `POST /api/endpoints/:id/check` returns HTTP 200 with `status: "down"`. This is an operational monitoring success, NOT a PulseCheck application error.

---

## 14. Delete Endpoint Flow

Triggered via the endpoint row menu or detail view header.

### Destructive Modal Confirmation
- **Headline**: `Delete Monitored Endpoint?`
- **Warning Body**: `Are you sure you want to delete "${endpoint.name}" (${endpoint.url})? This action cannot be undone. All associated check history and timeseries metrics will be permanently deleted via database cascade.`
- **Actions**:
  - `[ Cancel ]`: Dismisses dialog without action.
  - `[ Delete Endpoint ]`: Destructive red button (`bg-rose-600 hover:bg-rose-700 text-white`).
- **On Submit**: Calls `DELETE /api/endpoints/:id`.
  - Button displays spinner + `Deleting...`.
  - On `204 No Content`: Dismiss dialog, show toast `Endpoint deleted`, remove row from table.
  - On `500 Server Error`: Keep modal open, show error alert `Failed to delete endpoint`.

---

## 15. Loading States

PulseCheck uses structural skeleton wireframes to prevent content shifting.

| Component | Loading State UI | Duration / Animation |
|---|---|---|
| **Dashboard Initial** | Top KPI skeleton (4 boxes) + Table skeleton (5 rows). | `animate-pulse bg-zinc-800/40 rounded-md` |
| **Endpoint List** | Table rows show grey pulsing pills for name, url, badge, latency. | `animate-pulse` |
| **Metrics Grid** | 4 card placeholders with pulsing text blocks. | `animate-pulse` |
| **Latency Chart** | Grey framed rectangle (`h-[260px]`) with centered spinner. | `animate-pulse` |
| **History Table** | 5 table rows with pulsing placeholder cells. | `animate-pulse` |
| **Check Now** | Button icon swaps to rotating SVG spinner; label = `Probing...`. | Button disabled |
| **Modal Submission** | Primary button swaps to rotating SVG spinner; form inputs disabled. | Form inputs disabled |

---

## 16. Empty States

Empty states provide explicit instructions and never render misleading zero values.

### State Matrix

| Context | Headline | Explanation | Action Trigger |
|---|---|---|---|
| **A. No Endpoints** | `No Monitored Endpoints` | `PulseCheck is not currently probing any APIs. Add your first HTTP/HTTPS target to start monitoring uptime and latency SLAs.` | Primary Button: `[ + Add First Endpoint ]` |
| **B. Awaiting Initial Probe** | `Awaiting Initial Check` | `This endpoint has been registered, but no health checks have been performed yet.` | Secondary Button: `[ ⟳ Run Initial Check ]` |
| **C. No Checks in 24h Window** | `No Telemetry in Selected Period`| `No health checks were recorded for this endpoint in the last 24 hours.` | Metrics show `--`; chart displays empty grid line |
| **D. No Latency Values** | `No Valid Latency Telemetry` | `All recent checks resulted in connection failures or timeouts. Average and P95 latency cannot be computed.` | Display `-- ms` with explanatory tooltip |

---

## 17. Error States (System vs. Target API)

A fundamental architectural principle of PulseCheck is separating internal application errors from monitored target outages.

```
┌────────────────────────────────────────────────────────────────────────┐
│ ERROR CLASSIFICATION                                                   │
├──────────────────────────────────┬─────────────────────────────────────┤
│ 1. PULSECHECK APPLICATION ERROR  │ 2. MONITORED TARGET API OUTAGE      │
├──────────────────────────────────┼─────────────────────────────────────┤
│ Examples:                        │ Examples:                           │
│ - Database connection exhausted  │ - Monitored API returns HTTP 500    │
│ - Network drop to PulseCheck API │ - Monitored API times out (>5000ms) │
│ - Endpoint registration 400/409  │ - Monitored API DNS fails (ENOTFOUND│
├──────────────────────────────────┼─────────────────────────────────────┤
│ Visual Treatment:                │ Visual Treatment:                   │
│ - Red alert banner / Toast       │ - Standard Status Badge: ✕ DOWN     │
│ - Form input validation error    │ - Latency displays: --              │
│ - "Retry Operation" trigger      │ - History log documents code/error  │
│ - Does not alter target telemetry│ - Metrics accurately reflect error  │
└──────────────────────────────────┴─────────────────────────────────────┘
```

---

## 18. Responsive Specification

| Component | Desktop (`>= 1024px`) | Tablet (`768px – 1023px`) | Mobile (`< 768px`) |
|---|---|---|---|
| **App Header** | Brand + Pulse + full `+ Add Endpoint` button. | Same as desktop. | Compact: Brand + Icon `+` button. |
| **Summary Metrics** | 4 cards in single horizontal row (`grid-cols-4`). | 2x2 grid (`grid-cols-2`). | Stacked 1 column (`grid-cols-1`). |
| **Endpoint List** | Full multi-column tabular data grid. | Table hides P95; shows status, latency, check. | Transforms into Stacked Operational Cards. |
| **Endpoint Detail** | Master-Detail side-by-side or wide view. | Full-width view. | Full-width single column. |
| **Latency Chart** | `260px` height, full timeseries tick marks. | `220px` height, tick interval 4 hours. | `180px` height, simplified tick marks (6h). |
| **History Table** | All 5 columns visible. | Diagnostic message truncated to 20 chars. | Shows Time, Status, Code; Error in expander. |
| **Add Endpoint Modal**| Fixed `480px` centered modal dialog. | Fixed `480px` centered modal dialog. | Bottom sheet or full-width sheet (`w-full`). |

---

## 19. Design Tokens & Visual Specs

```css
/* Surface Tokens */
--canvas-bg:           #09090b;  /* zinc-950 */
--surface-bg:          #121215;  /* zinc-900 / surface */
--surface-hover:       #18181b;  /* zinc-900 elevated */
--border-subtle:       #27272a;  /* zinc-800 */
--border-strong:       #3f3f46;  /* zinc-700 */

/* Typography Tokens */
--text-primary:        #f4f4f5;  /* zinc-100 */
--text-secondary:      #a1a1aa;  /* zinc-400 */
--text-muted:          #71717a;  /* zinc-500 */
--font-sans:           Inter, system-ui, sans-serif;
--font-mono:           JetBrains Mono, ui-monospace, monospace;

/* Health Tokens */
--status-up-text:      #34d399;  /* emerald-400 */
--status-up-bg:        rgba(52, 211, 153, 0.10);
--status-up-border:    rgba(52, 211, 153, 0.25);

--status-degraded-text:#fbbf24;  /* amber-400 */
--status-degraded-bg:  rgba(251, 191, 36, 0.10);
--status-degraded-border: rgba(251, 191, 36, 0.25);

--status-down-text:    #f87171;  /* rose-400 */
--status-down-bg:      rgba(248, 113, 113, 0.10);
--status-down-border:  rgba(248, 113, 113, 0.25);

/* Radii */
--radius-badge:        4px;      /* rounded */
--radius-button:       6px;      /* rounded-md */
--radius-card:         8px;      /* rounded-lg */
```

---

## 20. Component Hierarchy Tree

```
<AppShell>
  ├── <AppHeader>
  │     ├── <BrandLogo />
  │     ├── <SystemStatusIndicator />
  │     └── <Button onClick={openAddModal}>+ Add Endpoint</Button>
  │
  ├── <DashboardView>
  │     ├── <SystemOverview>
  │     │     ├── <SummaryCard label="Total Monitored" value={total} />
  │     │     ├── <SummaryCard label="Operational" value={upCount} variant="up" />
  │     │     ├── <SummaryCard label="Degraded" value={degradedCount} variant="degraded" />
  │     │     └── <SummaryCard label="Failing" value={downCount} variant="down" />
  │     │
  │     ├── <EndpointToolbar>
  │     │     ├── <SearchInput value={query} onChange={setQuery} />
  │     │     └── <FilterTabs active={filter} onChange={setFilter} />
  │     │
  │     └── <EndpointTable>
  │           ├── <TableHeader />
  │           └── <TableBody>
  │                 {endpoints.map(endpoint => (
  │                   <EndpointRow
  │                     key={endpoint.id}
  │                     endpoint={endpoint}
  │                     onSelect={() => setSelected(endpoint.id)}
  │                     onCheck={() => handleCheck(endpoint.id)}
  │                   >
  │                     <StatusBadge status={endpoint.latestStatus} />
  │                     <LatencyDisplay latency={endpoint.latestLatency} threshold={endpoint.threshold} />
  │                     <CheckButton isProbing={probingIds.has(endpoint.id)} />
  │                   </EndpointRow>
  │                 ))}
  │               </TableBody>
  │
  ├── <EndpointDetailPanel isOpen={Boolean(selectedId)} endpointId={selectedId}>
  │     ├── <DetailHeader endpoint={endpoint} onCheck={handleCheck} onDelete={openDeleteModal} />
  │     ├── <MetricsGrid metrics={metrics} isLoading={metricsLoading} />
  │     ├── <LatencyChart history={history} threshold={endpoint.threshold} isLoading={historyLoading} />
  │     └── <HistoryTable checks={history} isLoading={historyLoading} />
  │
  ├── <AddEndpointModal isOpen={isAddOpen} onClose={closeAddModal} onCreated={refreshEndpoints} />
  └── <DeleteModal isOpen={isDeleteOpen} endpoint={deletingEndpoint} onConfirmed={handleDelete} />
</AppShell>
```

---

## 21. API → Component Data Contract

| Component | Endpoint | Method | Required Fields | Loading Handling | Empty State | Error State |
|---|---|---|---|---|---|---|
| **EndpointTable** | `/api/endpoints` | `GET` | `id`, `name`, `url`, `latencyThresholdMs`, `createdAt` | 5 skeletal rows | `<EmptyState type="no-endpoints" />` | Error banner with retry trigger |
| **AddEndpointModal** | `/api/endpoints` | `POST` | Body: `{ name, url, latencyThresholdMs }` | Submit button spinner; fields disabled | N/A | Form validation alert; duplicate error on 409 |
| **DeleteModal** | `/api/endpoints/:id`| `DELETE`| Path: `id` | Submit button spinner | N/A | Destructive alert modal |
| **CheckButton** | `/api/endpoints/:id/check` | `POST` | Path: `id` | Button spinner; text = `Probing...` | N/A | Toast: `Probe failed to dispatch` |
| **MetricsGrid** | `/api/endpoints/:id/metrics` | `GET` | `uptime`, `errorRate`, `averageLatencyMs`, `p95LatencyMs`, `totalChecks` | 4 skeletal metric cards | Render `--` for all percentage/latency values | Muted card state |
| **LatencyChart** | `/api/endpoints/:id/history` | `GET` | `checkedAt`, `latencyMs`, `status`, `statusCode` | Grey chart frame skeleton | Graph canvas with `No check history` note | Broken grid lines with retry notice |
| **HistoryTable** | `/api/endpoints/:id/history` | `GET` | `id`, `checkedAt`, `status`, `statusCode`, `latencyMs`, `errorType`, `errorMessage` | 5 table row skeletons | Row: `No recent checks recorded` | Row: `Failed to load check history` |

---

## 22. API / Data Contract Gaps

During Phase 6B specification analysis, three structural data contract gaps between the Phase 5 backend API and optimal dashboard performance were identified.

### Gap 1: Current Status & Latency on Endpoint List
- **Current API**: `GET /api/endpoints` returns only table configuration (`id`, `name`, `url`, `latencyThresholdMs`, `createdAt`). It does **NOT** return the latest check status or latency.
- **UI Requirement**: The Endpoint List needs to display the current health badge (`● UP`), latest latency (`124 ms`), and latest status code (`200 OK`) on each row.
- **Current Workaround (Without Backend Changes)**: The frontend would have to issue N parallel requests to `GET /api/endpoints/:id/history?limit=1` for every endpoint. For 20 endpoints, this triggers 21 HTTP requests (N+1 query issue).
- **Backend/API Enhancement Required**:
  - Enhance `GET /api/endpoints` to perform a lateral join or subquery returning the most recent check:
    ```ts
    latestCheck: {
      status: 'up' | 'degraded' | 'down',
      latencyMs: number | null,
      statusCode: number | null,
      checkedAt: Date
    } | null
    ```
  - *Status*: Documented gap. **No backend changes are made during Phase 6B**.

### Gap 2: Global Health Status Counts (Operational, Degraded, Down)
- **Current API**: `GET /api/endpoints` gives the total count (`endpoints.length`), but cannot provide how many endpoints are currently `UP`, `DEGRADED`, or `DOWN`.
- **UI Requirement**: System Overview requires 4 top-level summary numbers: Total Monitored, Operational count, Degraded count, Failing count.
- **Current Workaround (Without Backend Changes)**: Requires resolving the latest check of every endpoint on the client.
- **Backend/API Enhancement Required**:
  - Provide a summary aggregation endpoint, e.g. `GET /api/overview` or include a `summary: { total, up, degraded, down }` payload on `GET /api/endpoints`.
  - *Status*: Documented gap. **No backend changes are made during Phase 6B**.

### Gap 3: Time Window Customization for Metrics and History
- **Current API**: `GET /api/endpoints/:id/metrics` is hardcoded to a 24-hour sliding window; `GET /api/endpoints/:id/history` returns the most recent 50 checks.
- **UI Requirement**: Power users may want to switch between `Last 1 Hour`, `Last 24 Hours`, or `Last 7 Days`.
- **Backend/API Enhancement Required**:
  - Support query parameters on metrics and history: `GET /api/endpoints/:id/metrics?window=7d`.
  - *Status*: Documented gap. **No backend changes are made during Phase 6B**.

---

## 23. Accessibility (A11y) Specifications

- **Color Independence**: Status is never communicated by color alone. Every badge pairs a geometric icon (`●`, `▲`, `✕`), an uppercase text label (`UP`, `DEGRADED`, `DOWN`), and high-contrast color tokens.
- **Keyboard Navigation**:
  - Focus indicators: `focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950`.
  - Action buttons and table rows are accessible via `Tab` and activatable via `Enter` or `Space`.
- **Modal Focus Trapping**:
  - Opening `<AddEndpointModal />` traps keyboard focus inside the dialog.
  - Pressing `Escape` closes the modal immediately.
  - Closing returns focus to the trigger button.
- **ARIA Semantics**:
  - `aria-live="polite"` on summary cards and status badge to announce state transitions after a manual probe.
  - `role="status"` on loading skeletons.
  - `aria-label` tags on all icon-only buttons (e.g. `aria-label="Delete endpoint ${name}"`).

---

## 24. Micro-Interactions

Interactions must be subtle, high-performance, and purpose-driven:

| Interaction | Trigger | Transition / Styling | Purpose |
|---|---|---|---|
| **Button Hover** | Cursor enters button | `transition: background-color 150ms ease` | Affordance that element is clickable |
| **Button Active** | Click down | `transform: scale(0.98)` | Tactile confirmation of click dispatch |
| **Row Hover** | Cursor enters table row | `background-color: rgba(24, 24, 27, 0.6)` | Visual row tracking across wide screens |
| **Modal Entrance** | Dialog open trigger | Fade in (`opacity-0` to `opacity-100`) + minor scale (`scale-95` to `scale-100`) over `150ms` | Spatial anchoring |
| **Spinner Rotation** | Action loading | Continuous linear 360-degree rotation (`animate-spin`) | Indicates active server communication |
| **Probing Transition**| Check Now dispatch | Immediate icon swap to spinner | Prevents duplicate user requests |

*Explicitly Forbidden*: Floating cards, parallax mouse tracking, decorative background gradient shifts, bouncy physics.

---

## 25. Anti-Vibe-Coding Rules

To maintain high technical fidelity and prevent superficial design shortcuts, the implementation must adhere strictly to the following rules:

1. **NO Fake Telemetry or Mock Data**: Every chart line, metric number, and badge must reflect real PostgreSQL database checks via Phase 5 APIs.
2. **NO Synthetic "Net Health" Metrics**: Do not calculate or display "Net Health", "Pulse Score", or unverified aggregate formulas.
3. **NO Null Latency as 0 ms**: If `latencyMs` is `null`, never render `0 ms`. Render `--` and plot missing points as broken segments on charts.
4. **NO Auto-Probe on Endpoint Registration**: Adding an endpoint leaves it in `◌ NO DATA` until explicitly checked by the user.
5. **NO Decorative Gradients or Blobs**: No multi-color gradient headlines, glowing neon drop shadows, or decorative background blur blobs.
6. **NO Unnecessary Third-Party UI Libraries**: Build components directly using standard Tailwind CSS, TypeScript, and Recharts. Do not install heavy component frameworks.
7. **NO Hidden Backend Modifications**: Do not silently alter database schemas or API routes during frontend implementation.

---

## 26. Implementation Acceptance Criteria

Before Phase 6C implementation is marked complete, it must satisfy these objective criteria:

- [ ] **Real API Integration**: The dashboard exclusively consumes `/api/endpoints`, `/api/endpoints/:id/check`, `/api/endpoints/:id/metrics`, and `/api/endpoints/:id/history`.
- [ ] **No Fabricated Telemetry**: Zero mock data or placeholder numbers in production runtime.
- [ ] **Accurate Status Tiers**: Statuses strictly follow backend definitions (`UP` = 2xx/3xx within threshold, `DEGRADED` = 2xx/3xx exceeding threshold, `DOWN` = 4xx/5xx, timeout, DNS/network error).
- [ ] **Null Latency Safeguard**: Probes with `latencyMs === null` display `-- ms` and are represented as gaps/markers on timeseries charts (never 0 ms).
- [ ] **Separation of Faults**: Target API outages (`DOWN`) are visually differentiated from PulseCheck internal application errors (HTTP 500 / network drop).
- [ ] **Multi-Factor Accessibility**: Status indicators combine shape, label text, and color. All interactive elements have visible keyboard focus rings.
- [ ] **Responsive Integrity**: Tested at `1440px`, `1024px`, `768px`, and `375px` viewports with zero horizontal overflow.
- [ ] **Double-Request Prevention**: `Check Now` button is immediately disabled upon click to prevent concurrent duplicate probes.
- [ ] **Code Cleanliness**: Strict TypeScript compilation (`tsc --noEmit`), zero ESLint warnings, and passing Next.js production builds.
