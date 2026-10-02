# Phase 8A — Product QA & Polish Design Specification

**Project**: PulseCheck — API Monitoring & Observability Dashboard  
**Document**: Product QA & Polish Design  
**Phase**: Phase 8A (Design Only)  
**Role**: Principal QA Architect & Senior Staff Frontend/SRE Engineer  
**Date**: October 2, 2026  
**Status**: **APPROVED DESIGN FOR REVIEW**  

---

## 1. Document Status & Version History

| Version | Date | Author | Status | Change Description |
| :--- | :--- | :--- | :--- | :--- |
| **1.0.0** | 2026-10-02 | Reliability & Product QA Working Group | **READY FOR REVIEW** | Initial comprehensive product QA & polish design following Phase 7E verification. |

This specification defines the complete test harness, scenario matrix, accessibility criteria, metrics correctness audit, and polish design for PulseCheck. In accordance with Phase 8A directives, **no production code, database schemas, API contracts, or dependencies are modified in this phase**.

---

## 2. Phase Objective

The objective of Phase 8A is to design a rigorous, end-to-end product-quality QA and polish strategy for the existing PulseCheck application.

Rather than introducing architectural complexity, third-party libraries, or unneeded features, this phase establishes a systematic methodology to identify, categorize, and verify the remediation of real product-quality issues across the user-facing surface of PulseCheck. The resulting product must feel:
* **Reliable**: Telemetry and metrics reflect real-world monitoring without silent data fabrication.
* **Consistent**: Predictable visual tokens, interactive behaviors, and state transitions.
* **Professional**: Clean, calm, high-density developer-tool aesthetic without distracting SaaS flair or neon decorations.
* **Responsive**: Flawless functionality and layouts across mobile (320px–375px), tablet (768px–1024px), and desktop (1440px+).
* **Accessible**: Full keyboard navigability, WCAG 2.1 AA color contrast, screen-reader semantics, and non-color-dependent status indicators.
* **Production-Ready**: Zero React hydration mismatches, zero browser console warnings/errors, and robust network resilience.

---

## 3. Current Product Baseline

PulseCheck has completed Phase 7E with an operational, deployment-verified backend pipeline and a functional App Router frontend:

* **Framework & Core**: Next.js 16.3.7 (App Router, Turbopack), React 19.2.8, TypeScript 5 (Strict Mode).
* **Data Layer**: PostgreSQL (Neon serverless pool via `pg` v8.23.0), Drizzle ORM v0.45.3.
* **Styling & Visualization**: Tailwind CSS v4, Recharts v3.10.1, Lucide/Heroicon inline SVGs.
* **Test Baseline**: 198 tests passed across 13 test files (`npm test` 100% green).
* **Scheduling & Ingress**: External HTTP cron trigger (`POST /api/cron/check`), `CRON_SECRET` constant-time timing-safe comparison, process-local mutual exclusion guard, bounded concurrency ceiling ($\le 5$).
* **Verified Boundaries**: Both in-process route handlers and real external socket requests against a live production server (`next start -p 3100`) verified against real PostgreSQL.

---

## 4. Product QA Principles

The QA design is governed by seven non-negotiable engineering principles:

### Principle A: No Fake Telemetry
Every number, status badge, timeseries point, and percentile displayed on the frontend must originate from real HTTP health checks persisted in the PostgreSQL database. Synthetic demo data, placeholder random numbers, and mock arrays are strictly forbidden in production builds.

### Principle B: No Silent Data Fabrication
* Missing or failed latency (`latencyMs === null`) must **never** be rendered as `0 ms` or coerced to zero in mathematical computations.
* Endpoints without checks must state `NO DATA` / `--` rather than inventing `100%` uptime or `0ms` latency.
* Missing percentiles (P95) on zero-check endpoints must render as `--`.

### Principle C: Clear Failure Attribution
The interface must maintain an unmistakable distinction between:
1. **Monitored Target Failure**: The external target returned HTTP 500, timed out, or had a DNS error. PulseCheck operated correctly; the monitored service is unhealthy.
2. **PulseCheck Platform Failure**: The database is unreachable, the network dropped, or an API call rejected with HTTP 500.

### Principle D: Consistent Status Semantics
Four canonical health states exist across the entire platform:
* `UP` (Green / Emerald): HTTP 2xx within latency SLA threshold.
* `DEGRADED` (Amber): HTTP 2xx exceeding latency SLA threshold.
* `DOWN` (Rose / Red): HTTP 4xx/5xx, network error, connection timeout, or DNS failure.
* `NO DATA` (Zinc / Slate): Registered endpoint awaiting its initial probe.

### Principle E: Developer-Tool Visual Language
PulseCheck adheres to a high-density, calm, technical dashboard design:
* Dark mode palette based on Tailwind `zinc-950` (#09090b), `zinc-900` (#18181b), and `zinc-800` (#27272a).
* Monospace typography for URLs, timestamps, latency values, and HTTP codes.
* **Forbidden**: Multi-colored animated gradient meshes, heavy glassmorphism, floating cards, bouncing physics, or decorative blobs.

### Principle F: Responsive Correctness
All views must be fully operational without clipped text, horizontal window scrolling, overlapping action buttons, or unreadable charts across 320px, 375px, 768px, 1024px, and 1440px viewports.

### Principle G: Accessibility (A11y)
The dashboard must comply with WCAG 2.1 AA standards:
* Color is never the sole indicator of state (each badge combines icon, label, and color).
* Visible focus rings on all interactive elements.
* Complete keyboard navigability (Tab, Enter, Escape, Space).
* Dialogs implement proper focus trapping and restoration.

---

## 5. Scope

The QA design covers the entire user-facing surface and frontend-to-backend integration:

1. **Dashboard Overview**: Summary KPI cards, search toolbar, status filter tabs, responsive endpoint table, loading skeletons, and empty states.
2. **Endpoint Registration**: Modal dialog, input validation, protocol restriction, threshold bounds, duplicate URL conflict handling, and error banners.
3. **Manual Check Workflow**: "Check Now" triggers, visual probing feedback, duplicate-click prevention, toast messaging, and live state updates.
4. **Endpoint Deep-Dive Detail**: Breadcrumb navigation, identity header, 24h reliability metrics grid, Recharts latency area chart with SLA line, and 50-check audit log table.
5. **Deletion Lifecycle**: Confirmation dialog, cascade warning, cancellation, execution, and list synchronization.
6. **Cross-Cutting Dimensions**: Responsive breakpoints, WCAG accessibility, error resilience, metrics accuracy, API contract audit, render performance, and browser console hygiene.

---

## 6. Non-Goals

To prevent scope creep and maintain architectural integrity, the following are explicitly **out of scope**:
* Adding user authentication, multi-tenancy, or login screens.
* Adding WebSocket, Server-Sent Events (SSE), or polling daemons.
* Altering the database schema or creating Drizzle migrations.
* Modifying backend service logic (`checker.ts`, `monitor.ts`, `scheduler.ts`, `metrics.ts`).
* Redesigning the external-cron scheduling architecture.
* Introducing third-party UI component libraries (e.g. Radix, Shadcn, MUI, Chakra).
* Introducing external state management libraries (e.g. Redux, Zustand).

---

## 7. Test Environment & Harness

QA scenarios must be executed against a deterministic, reproducible environment:

```
┌──────────────────────────────────────────────────────────────┐
│                    QA Test Environment                       │
│                                                              │
│  ┌───────────────────────┐        ┌───────────────────────┐  │
│  │ Local Node.js Target  │        │   PostgreSQL (Neon)   │  │
│  │    Fixture Server     │        │     Real Database     │  │
│  │  (http://127.0.0.1)   │        │     (Drizzle ORM)     │  │
│  └───────────▲───────────┘        └───────────▲───────────┘  │
│              │ TCP Probes                     │ SQL Queries  │
│  ┌───────────┴────────────────────────────────┴───────────┐  │
│  │              PulseCheck Next.js Application            │  │
│  │              (Production Server: port 3100)            │  │
│  └───────────────────────────▲────────────────────────────┘  │
│                              │ HTTP / App Router             │
│  ┌───────────────────────────┴────────────────────────────┐  │
│  │            Browser Test Harness (Playwright / DOM)     │  │
│  │     Viewports: 320px, 375px, 768px, 1024px, 1440px     │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

* **Application Process**: Production build running via `npx next start -p 3100` with production environment flags.
* **Deterministic Fixture Server**: Ephemeral Node.js HTTP server running on `http://127.0.0.1:3101` serving configured endpoints:
  - `/up`: Responds immediately with HTTP 200 `{ "status": "ok" }`.
  - `/degraded`: Responds with HTTP 200 after artificial delay (e.g. 250ms).
  - `/down`: Responds with HTTP 500 `{ "error": "Internal Server Error" }`.
  - `/status-404`: Responds with HTTP 404 `{ "error": "Not Found" }`.
  - `/timeout`: Holds connection open without responding for $> 5000\text{ms}$.
* **Browser Viewports**:
  - `Desktop`: 1440px $\times$ 900px
  - `Tablet Landscape`: 1024px $\times$ 768px
  - `Tablet Portrait`: 768px $\times$ 1024px
  - `Standard Mobile`: 375px $\times$ 667px (iPhone SE / 8)
  - `Narrow Mobile`: 320px $\times$ 568px

---

## 8. Dashboard Overview QA Design

### Purpose
Ensure that the primary landing interface delivers instantaneous, accurate situational awareness for an engineer during normal operations or active incidents.

### Key Scenarios & Verification Rules
1. **Global Health Counts Accuracy**:
   - Total Monitored = total rows returned by `GET /api/endpoints`.
   - Operational (UP) = count of endpoints whose `latestCheck.status === 'up'`.
   - Degraded = count of endpoints whose `latestCheck.status === 'degraded'`.
   - Failing (DOWN) = count of endpoints whose `latestCheck.status === 'down'`.
   - If no checks have been evaluated yet, Operational, Degraded, and Failing must display `--` (not `0`), with subtext stating `"Requires probe evaluation"`.
2. **Search Filtering**:
   - Real-time client-side filter matching both endpoint `name` (case-insensitive) and `url` (case-insensitive).
   - Typing in search updates the table rows instantly.
   - Clear button (`✕`) appears when input has text; clicking clears the input and restores full list.
   - Counter updates to: `"Showing {filteredCount} of {totalCount}"`.
3. **Status Filter Tabs**:
   - Tabs: `All`, `UP`, `DEGRADED`, `DOWN`, `NO DATA`.
   - Selecting a tab isolates endpoints with matching `latestCheck.status` (or `latestCheck === null` for `NO DATA`).
   - Active tab visually highlighted with `bg-zinc-800 text-zinc-100`.
4. **Empty State Handling**:
   - When database has 0 endpoints: Show `<EmptyState type="no-endpoints" />` with `"+ Add Endpoint"` primary action button.
   - When filters produce 0 matches: Show `<EmptyState type="no-filtered-results" />` with `"Clear filters"` action button.
5. **Loading States**:
   - On initial load: Render 4 wireframe summary skeletons and 4 table row skeletons with animated pulses (`animate-pulse`). No content jumps or flickering.

---

## 9. Endpoint Registration QA Design

### Purpose
Ensure that adding new monitored endpoints is robust, validates inputs before network transmission, prevents malformed database records, and handles conflict errors cleanly.

### Key Scenarios & Validation Specifications
1. **Client-Side Field Validation**:
   - **Service Name**: Required, trimmed of leading/trailing whitespace, maximum length 100 characters. Blank input triggers `"Service name is required"`.
   - **Target URL**: Required, trimmed, valid URL structure, protocol restricted to `http:` or `https:`.
     - Invalid protocol (e.g. `ftp://`, `ws://`, `file://`) triggers `"URL must use HTTP or HTTPS protocol"`.
     - Malformed string triggers `"Please enter a valid HTTP or HTTPS URL"`.
     - Length $> 2048$ characters rejected.
   - **Latency Threshold**: Required, positive integer $> 0$, maximum $60,000\text{ms}$ (1 minute). Decimal numbers, negatives, non-numeric strings, or $0$ trigger `"Threshold must be a positive integer"`.
2. **Duplicate URL Conflict (HTTP 409)**:
   - When submitting a URL that already exists in the database: Backend returns HTTP 409 `{ "error": "An endpoint with this URL already exists" }`.
   - Modal catches 409 and displays inline error banner above form fields without closing the modal or clearing entered text.
3. **Submission Lifecycle**:
   - Submit button enters loading state with spinning SVG indicator and text `"Registering..."`.
   - Input fields and submit button disabled during in-flight POST request to prevent double submissions.
4. **Post-Registration State (Anti-Vibe-Coding Rule #4)**:
   - On successful HTTP 201 response, modal closes automatically.
   - New endpoint prepends to the table list.
   - **Crucial Rule**: New endpoint must start in `◌ NO DATA` with latency `--`. It must **NOT** trigger an automatic background probe upon creation.

---

## 10. Manual Check Workflow QA Design

### Purpose
Verify the reliability of the on-demand "Check Now" feature, which allows engineers to validate connectivity immediately after a deployment or incident mitigation.

### Key Scenarios & Verification Rules
1. **Debounce & In-Flight Protection**:
   - Clicking `"Check Now"` immediately disables the button and displays an animated spinner with `"Probing..."`.
   - Rapid clicking or double-clicking must not dispatch duplicate HTTP requests to `/api/endpoints/:id/check`.
2. **Target Failure vs. Platform Failure Handling**:
   - **Target Down (HTTP 500 / Timeout / DNS)**:
     - `/api/endpoints/:id/check` returns HTTP 200 with saved check row `{ status: 'down', errorType: 'http', ... }`.
     - App state updates row badge to `✕ DOWN`.
     - Toast notification displays: `"{Endpoint Name} probe: DOWN (HTTP 500)"` or `"{Endpoint Name} probe: DOWN (timeout)"`.
     - Does **not** display a generic "Internal Server Error" toast.
   - **PulseCheck Backend Failure**:
     - Database unreachable or network disconnect yields HTTP 500 `{ "error": "Failed to persist health check" }`.
     - Toast notification displays error: `"Probe failed: Failed to persist health check"`.
     - Button returns to idle state without freezing.
3. **Live UI Synchronization**:
   - Table row updates its status badge, latest latency, and relative timestamp immediately without requiring full page refresh.
   - If the endpoint is currently open in the detail view, the recent history table prepends the new check row, and the 24h metrics recalculate.

---

## 11. Endpoint Detail View QA Design

### Purpose
Verify that the deep-dive observability view accurately plots timeseries telemetry, renders historical checks, and visualizes latency against configured SLA thresholds.

### Key Scenarios & Verification Rules
1. **Master-Detail Navigation**:
   - Clicking an endpoint row in the dashboard transitions smoothly into `<EndpointDetail />`.
   - Clicking `"Back to Overview"` returns to the dashboard, preserving search query and active filter tabs.
2. **Metrics Grid (24-Hour Rolling)**:
   - **24h Availability Uptime %**: Displays `((UP + DEGRADED) / total) * 100` formatted to 1 decimal place (`98.5%`). If 0 checks, displays `--`.
   - **24h Error Rate %**: Displays `(DOWN / total) * 100` formatted to 1 decimal place (`1.5%`). If 0 checks, displays `--`.
   - **Average Latency**: Displays rounded integer ms (`142 ms`). If no successful checks exist, displays `--`.
   - **P95 Latency**: Displays rounded integer ms (`310 ms`). If no successful checks exist, displays `--`.
   - **Total Checks Evaluated**: Displays integer count (`1,420 checks`).
3. **Latency Timeseries Chart (Recharts)**:
   - Plots chronological check timestamps on the X-axis (oldest $\rightarrow$ newest, left to right).
   - Plots round-trip latency (ms) on the Y-axis.
   - **SLA Threshold Reference Line**: Renders a horizontal dashed stroke across the chart at `y = latencyThresholdMs` labeled `"SLA Threshold ({X} ms)"`.
   - **Missing/Failed Points Handling (Anti-Vibe-Coding Rule #3)**: Checks with `latencyMs === null` (timeouts, DNS failures) must **never** be plotted at `0 ms`. The chart must break the line or show an explicit failure marker on the timeline.
   - **Interactive Tooltip**: Hovering over a data point displays formatted time, status badge, HTTP code, latency (with delta $+X\text{ms}$ above threshold if degraded), and diagnostic error message if present.
4. **History Audit Table**:
   - Lists up to 50 most recent checks in reverse chronological order (newest first).
   - Columns: `Timestamp`, `Status`, `HTTP Code`, `Latency`, `Diagnostics`.
   - Diagnosed errors display formatted labels (`DNS Error (ENOTFOUND)`, `Connection Timeout (5000ms)`).

---

## 12. Deletion Flow QA Design

### Purpose
Ensure that decommissioned endpoints can be safely removed, with clear user warnings regarding permanent data loss and automated database cascade cleanup.

### Key Scenarios & Verification Rules
1. **Destructive Confirmation Modal**:
   - Triggering delete opens `<DeleteEndpointModal />`.
   - Modal clearly names the endpoint and shows its target URL in monospace font.
   - Warning note explicitly informs: `"All historical health checks and timeseries telemetry associated with this endpoint will be permanently deleted via database cascade."`
2. **Cancellation**:
   - Pressing `"Cancel"`, clicking the modal backdrop, or pressing `Escape` closes the modal immediately without sending a network request.
3. **Execution & Cascade Cleanup**:
   - Clicking `"Delete Endpoint"` sends `DELETE /api/endpoints/:id`.
   - Submit button shows loading state (`"Deleting..."`).
   - Upon HTTP 200, modal closes, endpoint is removed from table state, and success toast displays: `"Endpoint deleted successfully."`
   - If the deleted endpoint was currently selected in the detail view, navigation automatically resets to the overview.
   - Database foreign key cascade verified: zero orphaned check records remain in `checks`.

---

## 13. Responsive Layout QA Design

### Purpose
Guarantee that the user experience is equally clean, responsive, and functional on a developer's smartphone, tablet, laptop, and ultra-wide monitor.

### Viewport Matrix & Expected Behaviors

| Viewport Category | Resolution | Layout Transformations & Constraints |
| :--- | :--- | :--- |
| **Desktop Ultra/Standard** | `1440px+` | Full tabular layout (`<EndpointTable />`). 6 distinct columns: Endpoint, Status, Latency/Threshold, 24h Uptime, 24h P95, Actions. Fixed width max-w-7xl centered. |
| **Tablet Landscape** | `1024px` | Table remains visible with horizontal scroll container if needed. URL truncated cleanly with ellipsis. Metric cards in 4-column grid. |
| **Tablet Portrait** | `768px` | Breakpoint transition: Summary cards transition from 4-column to 2-column grid (`grid-cols-2`). Table transitions to responsive view. |
| **Standard Mobile** | `375px` | **Adaptive Transformation**: Table is hidden (`hidden md:block`); mobile card list is rendered (`<EndpointMobileCard />`). Each card displays name, status, threshold, and action button without overlapping. Header brand text shortened. |
| **Narrow Mobile** | `320px` | No horizontal page scrolling (`overflow-x: hidden` on viewport). Modal margins collapse cleanly (`p-3`). Add endpoint button displays icon only. |

---

## 14. Accessibility (WCAG 2.1 AA) QA Design

### Purpose
Ensure PulseCheck meets modern accessibility standards, enabling seamless operation via keyboard, high-contrast visual clarity, and assistive technologies.

### Key Accessibility Verification Specifications
1. **Color Independence**:
   - Status must **never** be conveyed by color alone.
   - Every status badge combines:
     - Geometric Icon: `●` (UP), `▲` (DEGRADED), `✕` (DOWN), `◌` (NO DATA).
     - Text Label: `"UP"`, `"DEGRADED"`, `"DOWN"`, `"NO DATA"`.
     - Distinct Contrast Palette:
       - Emerald: text `#34d399` on dark `#064e3b` background (contrast ratio $> 4.5:1$).
       - Amber: text `#fbbf24` on dark `#78350f` background (contrast ratio $> 4.5:1$).
       - Rose: text `#fb7185` on dark `#881337` background (contrast ratio $> 4.5:1$).
       - Zinc: text `#a1a1aa` on dark `#27272a` background (contrast ratio $> 4.5:1$).
2. **Keyboard Navigation & Focus Management**:
   - `Tab` navigates through all interactive controls in logical DOM order:
     Header Add Button $\rightarrow$ Search Input $\rightarrow$ Filter Tabs $\rightarrow$ Table Rows $\rightarrow$ Action Buttons.
   - Visible focus indicators: High-contrast focus rings (`focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2`).
3. **Modal Dialog Semantics**:
   - Dialog element has `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` referencing the dialog title.
   - Opening modal sets focus to the first interactive field (`Service Name`).
   - Focus is trapped within the modal while open; `Tab` cannot escape to background DOM elements.
   - Pressing `Escape` closes the modal and returns focus to the initiating button.
4. **Screen Reader Announcements (`aria-live`)**:
   - Toast container uses `role="status"` and `aria-live="polite"` so screen readers announce probe completions without interrupting ongoing speech.
   - Icon-only buttons possess explicit `aria-label` tags (e.g. `aria-label="Delete endpoint Authentication Service"`).

---

## 15. Error Handling & Sanitization QA Design

### Purpose
Ensure that unexpected operational errors fail safely, present helpful diagnostic feedback to users, and prevent internal security or infrastructural leaks.

### Verification Specifications
1. **Sanitization of Diagnostic Messages**:
   - Under no circumstances may SQL syntax errors, database connection strings, database usernames/passwords, or internal server file paths appear in:
     - User-facing toast notifications.
     - Modal error banners.
     - Table diagnostic columns.
     - API JSON response payloads.
2. **Network Disconnection Resilience**:
   - If user triggers `"Check Now"` while offline or with backend down: UI must capture the `TypeError: Failed to fetch`, display a red error toast `"Network error attempting to check endpoint"`, and restore the button to an interactive state.
3. **Missing Resource Handling (HTTP 404)**:
   - If an endpoint was deleted in another tab/process, subsequent check or delete requests return HTTP 404 `{ "error": "Endpoint not found" }`.
   - UI informs user and removes the stale item from the list.

---

## 16. Metrics Correctness QA Design

### Purpose
Formally audit and verify that the mathematical formulas for reliability, error rates, average latency, and P95 latency comply with the authoritative specification without rounding errors or null-value distortions.

### Mathematical Invariants & Verification Rules

```
Uptime %     = (Successful Checks / Total Checks) × 100
Error Rate % = (Failed Checks / Total Checks) × 100
Avg Latency  = Sum(Valid Latencies) / Count(Valid Latencies)
P95 Latency  = 95th Percentile of Sorted Valid Latencies (Nearest Rank Method)
```

1. **Success vs. Failure Classification**:
   - `UP` counts as **successful**.
   - `DEGRADED` counts as **successful** (service responded, albeit slowly).
   - `DOWN` counts as **failed**.
   - **Invariant**: $\text{Uptime \%} + \text{Error Rate \%} \equiv 100.0\%$ (within floating-point rounding of 0.1%).
2. **Null Latency Isolation**:
   - Checks with `latencyMs === null` (e.g. timeout, DNS resolution failure) must be strictly excluded from the divisor and numerator when calculating Average Latency and P95.
   - They must **never** be counted as `0 ms` (which would falsely deflate average latency).
3. **Zero-Check Boundary**:
   - When an endpoint has 0 checks in the rolling 24-hour window:
     - `uptime`: `0` (UI renders `--`).
     - `errorRate`: `0` (UI renders `--`).
     - `averageLatencyMs`: `null` (UI renders `--`).
     - `p95LatencyMs`: `null` (UI renders `--`).
     - `totalChecks`: `0`.
   - Never render `NaN%` or `Infinity%`.

---

## 17. UI / API Contract Gap Audit

### Purpose
Examine the exact boundary between frontend data consumption and backend API endpoints, documenting existing architectural gaps identified during Phase 6B/7E.

### Contract Analysis

| API Route | HTTP Method | Contract Fields Returned | Frontend Consumption | Identified Gap / Audit Finding |
| :--- | :---: | :--- | :--- | :--- |
| `/api/endpoints` | `GET` | `id`, `name`, `url`, `latencyThresholdMs`, `createdAt` | Populates table list on mount (`setEndpoints`). | **Gap 1**: Does **not** include `latestCheck` or `metrics`. On initial dashboard load, every endpoint starts in `NO DATA` with `--` until clicked or probed manually. |
| `/api/endpoints` | `POST` | `id`, `name`, `url`, `latencyThresholdMs`, `createdAt` | Appends new endpoint to state. | None. Returns HTTP 201 on success, 409 on duplicate URL. |
| `/api/endpoints/:id` | `DELETE`| `{ "success": true }` | Removes endpoint from state. | None. Triggers PostgreSQL `ON DELETE CASCADE`. |
| `/api/endpoints/:id/check` | `POST` | Full check object (id, status, statusCode, latencyMs, errorType, etc.) | Updates latest check and triggers toast. | None. Returns HTTP 200 for target health check outcomes; 404 if deleted; 500 on DB failure. |
| `/api/endpoints/:id/metrics` | `GET` | `uptime`, `errorRate`, `averageLatencyMs`, `p95LatencyMs`, `totalChecks` | Populates `<MetricsGrid />`. | **Gap 2**: Fixed 24h rolling window; does not support dynamic window queries (`?window=7d`). |
| `/api/endpoints/:id/history` | `GET` | Array of check records (`limit=50`). | Populates `<LatencyChart />` and `<HistoryTable />`. | None. Returns 50 most recent checks. |

*Note for Phase 8A*: In accordance with the phase rules, **no backend API routes are changed during this phase**. Documenting these gaps informs the QA test expectations (e.g. verifying that initial unselected rows display `NO DATA` correctly as designed).

---

## 18. Frontend Performance QA Design

### Purpose
Ensure that high check volumes, rapid user interactions, and chart rendering do not degrade frame rates or cause memory leaks.

### Performance Specifications & Checks
1. **Network Request Economy**:
   - Opening the dashboard must issue exactly **1** initial network request (`GET /api/endpoints`). It must not issue N background calls on mount.
   - Selecting an endpoint issues exactly **2** parallel requests (`GET /api/endpoints/:id/metrics` and `GET /api/endpoints/:id/history?limit=50`).
   - Deselecting or selecting another endpoint aborts or discards in-flight responses from previous selections (`isCancelled` flag check).
2. **Chart Rendering Performance**:
   - Recharts timeseries chart must render 50 data points in $< 50\text{ms}$.
   - Chart tooltips must follow mouse movements at 60fps without perceptible lag.
3. **Client-Side Filtering Performance**:
   - Search input filtering across 100 endpoints must execute synchronously in $< 5\text{ms}$ without UI freezing.

---

## 19. Browser & Console Hygiene QA Design

### Purpose
Ensure that PulseCheck executes cleanly in modern browsers with zero runtime exceptions, zero hydration errors, and clean DOM nesting.

### Verification Standards
1. **React Hydration Integrity**:
   - Zero React hydration mismatch errors (`Error: Hydration failed because the initial UI does not match that which was rendered on the server`).
   - Timestamps formatted with client locale must be deferred or isolated to prevent SSR mismatch.
2. **HTML Nesting & DOM Standards**:
   - No `<div>` tags directly inside `<tbody>` or `<tr>`.
   - No `<button>` nested inside another `<button>`.
   - Interactive table row cells with separate buttons must use `e.stopPropagation()` to prevent unwanted parent row selection.
3. **Console Hygiene**:
   - During standard navigation, registration, manual checking, and deletion: **Zero console errors** and **zero console warnings** allowed.

---

## 20. Visual Consistency QA Design

### Purpose
Verify that all UI components adhere strictly to the shared design system tokens, preventing ad-hoc styles and visual dissonance.

### Design System Token Audit Checklist
* **Color Palette**:
  - Background Canvas: `bg-[#09090b]` (`zinc-950`).
  - Card & Surface Fill: `bg-[#121215]` / `bg-zinc-900/80`.
  - Borders: `border-zinc-800` / `border-zinc-750`.
  - Body Text: `text-zinc-100` (primary), `text-zinc-400` (secondary), `text-zinc-500` (muted/metadata).
* **Typography**:
  - Sans: Standard modern sans-serif for titles, card labels, and buttons.
  - Monospace: `font-mono` for all URLs, latency numbers, millisecond units, timestamps, and HTTP status codes.
* **Component Rounding**:
  - Cards, tables, modals: `rounded-lg` (8px).
  - Badges, buttons, inputs: `rounded-md` (6px).
  - Indicator pills: `rounded-full` (9999px).

---

## 21. Real Data & Fixture Strategy

### Purpose
Provide deterministic real-world test scenarios to exercise all application branches without synthetic or fake telemetry.

### Deterministic Test Matrix Fixtures

| Target Scenario | Target URL | Simulated Behavior | Expected UI Status | Expected Latency Display | Expected Metrics |
| :--- | :--- | :--- | :---: | :---: | :---: |
| **Healthy 200** | `http://127.0.0.1:3101/up` | Responds 200 in 15ms | `● UP` | `15 ms` (Green/Neutral) | Uptime 100%, Error 0%, Avg 15ms |
| **Degraded Target**| `http://127.0.0.1:3101/degraded` | Responds 200 in 250ms (threshold: 100ms) | `▲ DEGRADED` | `250 ms` (Amber, `+150ms`) | Uptime 100%, Error 0%, Avg 250ms |
| **HTTP 500 Failure**| `http://127.0.0.1:3101/down` | Responds 500 in 20ms | `✕ DOWN` | `20 ms` (Rose, HTTP 500) | Uptime 0%, Error 100%, Avg `--` |
| **HTTP 404 Target**| `http://127.0.0.1:3101/status-404` | Responds 404 in 10ms | `✕ DOWN` | `10 ms` (Rose, HTTP 404) | Uptime 0%, Error 100%, Avg `--` |
| **Hanging Target** | `http://127.0.0.1:3101/timeout` | Drops connection after 5000ms | `✕ DOWN` | `--` (Timeout, null latency) | Uptime 0%, Error 100%, Avg `--` |
| **DNS Failure** | `http://invalid-subdomain.local`| Immediate node `ENOTFOUND` | `✕ DOWN` | `--` (DNS Error, null latency) | Uptime 0%, Error 100%, Avg `--` |
| **Unprobed Target**| `http://127.0.0.1:3101/up` | Newly registered; no check run | `◌ NO DATA` | `--` (Awaiting check) | Uptime `--`, Error `--`, Avg `--` |

---

## 22. Severity Classification Model

Issues identified during QA execution are classified strictly into four priority tiers:

| Severity Level | Definition | SLA / Release Blocker | Examples |
| :---: | :--- | :--- | :--- |
| **P0** | **Blocks Core Functionality** | **Absolute Blocker**: Cannot release under any circumstances. | Application crashes on load; "Check Now" throws uncaught exception; database checks fail to persist; data corruption. |
| **P1** | **Serious Product / UX Defect** | **Blocker**: Must be fixed before production sign-off. | Metric calculation formula wrong (e.g. null latency counted as 0ms); duplicate URL creates orphaned records; mobile view unclickable; keyboard focus trapped permanently. |
| **P2** | **Noticeable Polish Issue** | **High Priority**: Remediate in polish cycle. | Tooltip flickering; minor alignment shift on breakpoint; missing clear button in search input; toast text truncation on narrow screens. |
| **P3** | **Minor Cosmetic / Documentation** | **Normal**: Address as time permits. | 1px border contrast variance; minor padding discrepancy; non-breaking documentation typo. |

*Directive*: No subjective percentage scores or letter grades will be assigned. System readiness is strictly binary based on zero open P0/P1 issues.

---

## 23. Evidence Requirements

Every scenario verified during product QA must produce concrete, verifiable evidence:
1. **DOM & Component State Evidence**: Captured HTML hierarchy, element attributes (`aria-*`, `role`), and rendered text.
2. **Network Payload Evidence**: Request URL, HTTP method, request headers, response status code, and JSON payload.
3. **Database Telemetry Evidence**: SQL query verification confirming exact row counts, column values, and foreign key integrity.
4. **Console Log Evidence**: Verification of browser console containing zero uncaught runtime errors or hydration warnings.

---

## 24. Traceability Matrix

The following matrix assigns stable, unique identifiers (`QA-001` through `QA-050`) to every required product verification scenario:

| ID | Area | Scenario | Expected Result | Evidence Source | Severity |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **QA-001** | Dashboard | Initial load with 0 registered endpoints | Renders `<EmptyState type="no-endpoints" />`; Total Monitored = 0; Up/Degraded/Down = `--`. | DOM inspection + API payload | **P1** |
| **QA-002** | Dashboard | Initial load with registered endpoints | Renders table rows; Total Monitored = endpoint count; unprobed endpoints show `NO DATA`. | DOM inspection | **P1** |
| **QA-003** | Dashboard | Global KPI card calculation | Operational, Degraded, and Failing counts match client-evaluated endpoint checks. | DOM inspection + State check | **P1** |
| **QA-004** | Dashboard | Loading skeleton state | Renders 4 summary skeletons and 4 row skeletons with `animate-pulse` while fetching. | Visual inspection | **P2** |
| **QA-005** | Dashboard | Search filter by endpoint name | Typing partial name filters table immediately; non-matching rows hidden. | DOM filter test | **P1** |
| **QA-006** | Dashboard | Search filter by target URL | Typing partial URL filters table rows; matches monospace URL text. | DOM filter test | **P1** |
| **QA-007** | Dashboard | Search clear button | Clicking `✕` button clears search input and restores full endpoint list. | DOM event test | **P2** |
| **QA-008** | Dashboard | Status filter tab: UP | Displays only endpoints with `latestCheck.status === 'up'`. | DOM filter test | **P1** |
| **QA-009** | Dashboard | Status filter tab: DEGRADED | Displays only endpoints with `latestCheck.status === 'degraded'`. | DOM filter test | **P1** |
| **QA-010** | Dashboard | Status filter tab: DOWN | Displays only endpoints with `latestCheck.status === 'down'`. | DOM filter test | **P1** |
| **QA-011** | Dashboard | Status filter tab: NO DATA | Displays only endpoints with `latestCheck === null`. | DOM filter test | **P1** |
| **QA-012** | Dashboard | Filter with zero matching results | Renders `<EmptyState type="no-filtered-results" />` with `"Clear filters"` button. | DOM inspection | **P2** |
| **QA-013** | Registration | Open modal via Header button | Clicking `"+ Add Endpoint"` opens modal; focus moves to Service Name input. | DOM focus test | **P1** |
| **QA-014** | Registration | Blank form submission validation | Form rejects; inline error: `"Service name is required"` and `"Target URL is required"`. | DOM validation test | **P1** |
| **QA-015** | Registration | Invalid protocol validation | URL with `ftp://` or `ws://` rejected: `"URL must use HTTP or HTTPS protocol"`. | Form validation test | **P1** |
| **QA-016** | Registration | Malformed URL validation | Malformed URL string rejected: `"Please enter a valid HTTP or HTTPS URL"`. | Form validation test | **P1** |
| **QA-017** | Registration | Non-positive threshold validation | Threshold `<= 0` or non-integer rejected: `"Threshold must be a positive integer"`. | Form validation test | **P1** |
| **QA-018** | Registration | Threshold ceiling validation | Threshold `> 60000` rejected: `"Threshold must not exceed 60,000 ms"`. | Form validation test | **P2** |
| **QA-019** | Registration | Duplicate URL submission (409) | Server returns 409; modal displays inline error: `"An endpoint with this URL already exists"`. | Network 409 capture | **P1** |
| **QA-020** | Registration | Successful registration (201) | Server returns 201; modal closes; endpoint prepended in `NO DATA` state. | Network 201 + DOM | **P0** |
| **QA-021** | Registration | No automatic probe on creation | Newly created endpoint remains in `NO DATA`; zero background checks triggered. | Network log audit | **P1** |
| **QA-022** | Manual Check | "Check Now" button trigger | Disables button, renders spinner, text transitions to `"Probing..."`. | DOM state capture | **P1** |
| **QA-023** | Manual Check | Double-click prevention | Rapid clicking dispatches exactly 1 POST request to `/api/endpoints/:id/check`. | Network trace | **P1** |
| **QA-024** | Manual Check | Healthy target probe (UP) | Target responds 200; row updates to `● UP`; green toast: `"Endpoint probe: UP (X ms)"`. | Network + Toast DOM | **P0** |
| **QA-025** | Manual Check | Degraded target probe (DEGRADED)| Target responds slow 200; row updates to `▲ DEGRADED`; amber toast notification. | Network + Toast DOM | **P1** |
| **QA-026** | Manual Check | Target HTTP 500 failure (DOWN) | Target responds 500; row updates to `✕ DOWN`; error toast: `"... probe: DOWN (HTTP 500)"`. | Network + Toast DOM | **P0** |
| **QA-027** | Manual Check | Target connection timeout | Probe times out after 5s; row updates to `✕ DOWN (timeout)`; latency rendered as `--`. | Network + DOM check | **P0** |
| **QA-028** | Manual Check | Target DNS failure (`ENOTFOUND`)| DNS failure captured; row updates to `✕ DOWN (dns)`; latency rendered as `--`. | Network + DOM check | **P1** |
| **QA-029** | Manual Check | Platform database failure | Check persistence fails; returns 500; error toast: `"Probe failed: Server error..."`. | Network 500 capture | **P1** |
| **QA-030** | Detail View | Navigation to detail view | Clicking table row opens `<EndpointDetail />` with title, URL, threshold, and metrics. | DOM inspection | **P1** |
| **QA-031** | Detail View | Breadcrumb back navigation | Clicking `"Back to Overview"` returns to table; preserves active filters and search. | DOM state check | **P1** |
| **QA-032** | Detail View | 24h Uptime calculation | Displays `((UP + DEGRADED) / total) * 100` formatted to 1 decimal place. | DOM vs Math check | **P1** |
| **QA-033** | Detail View | 24h Error Rate calculation | Displays `(DOWN / total) * 100` formatted to 1 decimal place. | DOM vs Math check | **P1** |
| **QA-034** | Detail View | 24h Average Latency calculation| Averages non-null successful check latencies; excludes failed/null checks. | DOM vs Math check | **P1** |
| **QA-035** | Detail View | 24h P95 Latency calculation | Evaluates 95th percentile of valid latencies; renders rounded integer ms. | DOM vs Math check | **P1** |
| **QA-036** | Detail View | Zero check telemetry display | Endpoint with 0 checks renders `--` for Uptime, Error Rate, Avg Latency, and P95. | DOM check | **P1** |
| **QA-037** | Detail View | Latency timeseries chart rendering| Recharts renders 50 check points; X-axis = timestamp, Y-axis = latency (ms). | Canvas / SVG check | **P1** |
| **QA-038** | Detail View | Latency SLA threshold reference line| Horizontal line plotted at `y = latencyThresholdMs` with legible label. | SVG element check | **P2** |
| **QA-039** | Detail View | Null latency chart handling | Checks with null latency do not render at 0ms; broken line or marker rendered. | Chart data point check| **P1** |
| **QA-040** | Detail View | History table diagnostics | Displays up to 50 checks; HTTP error codes and error types clearly formatted. | Table rows check | **P1** |
| **QA-041** | Delete Flow | Delete modal confirmation | Clicking trash icon opens `<DeleteEndpointModal />` with endpoint identity & cascade note. | Modal DOM check | **P1** |
| **QA-042** | Delete Flow | Delete modal cancellation | Clicking `"Cancel"` or backdrop dismisses modal; endpoint remains intact. | DOM check | **P2** |
| **QA-043** | Delete Flow | Delete execution & cascade | Clicking `"Delete"` sends DELETE; removes endpoint from UI; purges check rows in DB. | Network + DB check | **P0** |
| **QA-044** | Responsive | 1440px Desktop layout | Standard 6-column tabular layout; zero overflow; optimal spacing. | Viewport audit | **P1** |
| **QA-045** | Responsive | 768px Tablet layout | 2-column summary cards grid; table adjusts without text clipping. | Viewport audit | **P1** |
| **QA-046** | Responsive | 375px Mobile layout | Table converts to mobile card list; buttons and text wrap gracefully. | Viewport audit | **P0** |
| **QA-047** | Responsive | 320px Narrow Mobile layout | Zero horizontal page scrolling; modal padding collapses cleanly. | Viewport audit | **P1** |
| **QA-048** | Accessibility | Keyboard navigation & focus | Tab navigates all controls; visible focus rings on buttons and inputs. | Keyboard audit | **P1** |
| **QA-049** | Accessibility | Modal focus trap & Escape key | Tab trapped inside open modal; Escape key closes modal and restores trigger focus. | Keyboard audit | **P1** |
| **QA-050** | Accessibility | Color-independent status badges | Status badges combine geometric icon, text label, and color tokens. | A11y visual audit | **P1** |

---

## 25. Phase 8B Handoff Requirements

Upon approval of this design specification, Phase 8B (Product QA & Polish Implementation) will execute the test harness and implement targeted polish fixes in accordance with these rules:
1. **Targeted Remediation Only**: Only issues identified through the Traceability Matrix may be remediated.
2. **Zero Architecture Drift**: Do not redesign database schemas, scheduler queues, or backend services.
3. **No Unneeded Dependencies**: All polish must be executed using existing Tailwind CSS, React, and TypeScript capabilities.
4. **Baseline Preservation**: All existing 198 tests in the test suite must remain 100% green.

---

## 26. Phase 8A Acceptance Criteria

Phase 8A is formally complete when all of the following conditions are satisfied:

- [x] `docs/PRODUCT_QA_DESIGN.md` exists and is fully authored.
- [x] All major product flows (Dashboard, Registration, Manual Check, Detail, Deletion) are rigorously specified.
- [x] Responsive layout requirements across 320px, 375px, 768px, 1024px, and 1440px are explicitly defined.
- [x] Accessibility specifications (WCAG 2.1 AA, keyboard focus, color independence, aria semantics) are detailed.
- [x] Telemetry and metrics mathematical invariants (Uptime, Error Rate, Avg Latency, P95, Null Latency) are defined.
- [x] Real-data deterministic fixture strategy is documented without mock telemetry.
- [x] API contract gaps are explicitly identified and documented.
- [x] Runtime console and browser hygiene criteria are established.
- [x] Four-tier severity model (P0–P3) is defined without subjective percentages.
- [x] Stable 50-scenario Traceability Matrix (`QA-001` through `QA-050`) is constructed.
- [x] Zero production code was modified during this phase.
- [x] Zero database schemas or migrations were created.
- [x] Zero dependencies were added or altered in `package.json`.
- [x] Zero git commits were made.
