# Phase 8B — Product QA & Polish Implementation Specification

**Project**: PulseCheck — API Monitoring & Observability Dashboard  
**Document**: Product QA & Polish Implementation Specification  
**Phase**: Phase 8B (Specification Only)  
**Role**: Senior Staff Software Engineer & Reliability Test Architect  
**Date**: October 2, 2026  
**Status**: **APPROVED IMPLEMENTATION SPECIFICATION**  
**Authoritative Source**: `docs/PRODUCT_QA_DESIGN.md`  

---

## 1. Document Status & Purpose

| Version | Date | Status | Description |
| :--- | :--- | :--- | :--- |
| **1.0.0** | 2026-10-02 | **READY FOR IMPLEMENTATION** | Formal implementation specification translating Phase 8A Design into actionable Phase 8C execution contracts. |

This specification translates every requirement, scenario, and boundary from `docs/PRODUCT_QA_DESIGN.md` into an unambiguous, prescriptive implementation contract for **Phase 8C (Product QA & Polish Implementation)**.

In strict compliance with the project directives:
* **Zero production code was modified during this phase.**
* **Zero database schema or migration files were created.**
* **Zero dependencies were added or altered.**
* **Zero backend API contracts, scheduler behavior, or metrics calculations were changed.**

---

## 2. Source Documents & Architectural Hierarchy

The implementation phase must consult and adhere to these documents in strict order of precedence:
1. `docs/PRODUCT_QA_DESIGN.md` (Authoritative Product QA Design & Scope)
2. `docs/UI_COMPONENT_SPEC.md` (Component Architecture & Contract Specification)
3. `docs/UI_DESIGN.md` (Visual Hierarchy & Developer-Tool UX Standards)
4. `docs/DEPLOYMENT_SCHEDULING_SPEC.md` & `docs/DEPLOYMENT_VERIFICATION_SPEC.md` (Scheduler & API Ingress Contracts)
5. `docs/RELIABILITY_TESTING_SPEC.md` (Failure Isolation & Reliability Invariants)

---

## 3. Phase 8C Objective

Phase 8C is a targeted **remediation, polish, and verification phase**. Its goal is to execute the 50 deterministic QA scenarios (`QA-001` through `QA-050`), verify compliance against all accessibility and responsive standards, and implement strictly scoped frontend refinements to ensure PulseCheck operates as a robust, professional, developer-grade monitoring tool.

---

## 4. Implementation Boundary & Change Constraints

### 4.1 Permitted Production Changes in Phase 8C
* React component presentation, markup, and hierarchy (`components/*.tsx`).
* Client-side state transitions, handlers, and hooks (`app/page.tsx`, `components/*.tsx`).
* Client-side form input validation, trimming, and error banners (`components/add-endpoint-modal.tsx`).
* Native keyboard focus trapping, focus restoration, and ARIA attributes (`role`, `aria-*`).
* CSS / Tailwind utility classes for responsive layouts, typography, borders, and spacing tokens.
* Recharts configuration for chart readability, tooltip presentation, and reference lines.
* Loading, empty, and error state transitions.

### 4.2 Strictly Prohibited Changes in Phase 8C
* **No Database Changes**: Zero changes to `db/schema.ts`, zero migrations, zero Drizzle config edits.
* **No Backend Logic Changes**: `services/scheduler.ts`, `services/checker.ts`, `services/monitor.ts`, `services/endpoints.ts`, and `services/metrics.ts` must remain untouched.
* **No API Contract Changes**: Routes in `app/api/*` must not have their request/response schemas or HTTP status codes altered.
* **No New Dependencies**: `package.json` must remain untouched. No Radix, no Lucide package, no Headless UI, no Redux, no Zustand.
* **No Polling Daemons or WebSockets**: Telemetry remains pull-based and user/cron-triggered.
* **No Synthetic / Fake Telemetry**: Never fabricate uptime, status, or latency values.

---

## 5. Current-State Findings & API Gap Analysis

A rigorous inspection of the current implementation (`app/`, `components/`, `services/`) reveals key findings that govern Phase 8C testing:

### Finding 1: Documented API Gap on Initial List (`GET /api/endpoints`)
* **Current Implementation**: `app/page.tsx:88-92` fetches `/api/endpoints` and maps endpoints with `latestCheck: null` and `metrics: null`.
* **Behavior**: On fresh dashboard load, all endpoints display `◌ NO DATA` and `--` for latency and percentiles until explicitly probed or selected.
* **Contract Rule for 8C**: **DO NOT fabricate status or latency**. Do not fire N background requests on load. Initial state `NO DATA` is the intended behavior under the current Phase 5 API contract.

### Finding 2: Summary Card Calculation
* **Current Implementation**: `app/page.tsx:290-302` filters `evaluatedEndpoints = endpoints.filter(e => e.latestCheck !== null)`. If `evaluatedEndpoints.length === 0`, counts are `null`, rendering `--` with subtext `"Requires probe evaluation"`.
* **Contract Rule for 8C**: This cleanly satisfies Principle B (no silent data fabrication).

### Finding 3: Modal Focus Trapping
* **Current Implementation**: `<AddEndpointModal />` and `<DeleteEndpointModal />` focus the first input/action on mount and listen to `Escape` keydown. However, neither implements cyclic `Tab` focus trapping. Pressing `Tab` repeatedly allows focus to escape the modal into the underlying page DOM.
* **Remediation in 8C**: Implement a native keyboard focus trap in both modals using standard DOM ref listeners (no external libraries).

### Finding 4: Recharts Null Latency Representation
* **Current Implementation**: In `<LatencyChart />`, data points with `latencyMs: null` are formatted with `latencyMs: null`. Custom tooltip renders `"Failed ({data.errorType})"` in rose color.
* **Contract Rule for 8C**: Verify that Recharts does not connect null points across failures with misleading 0ms line drops.

---

## 6. Dashboard Overview Specification (`QA-001` through `QA-012`)

### QA-001: Initial Load with Zero Registered Endpoints
* **Target File**: `components/endpoint-table.tsx`, `components/empty-state.tsx`
* **Input State**: Database contains 0 endpoint records (`GET /api/endpoints` returns `[]`).
* **User Action**: Navigate to `/`.
* **Expected DOM State**:
  - `<SystemOverview />`: Total Monitored = `0`; Operational = `--`; Degraded = `--`; Failing = `--`.
  - `<EmptyState type="no-endpoints" />` is rendered with icon, headline `"No endpoints monitored"`, and primary button `"+ Add Endpoint"`.
* **Expected Network**: Exactly 1 request: `GET /api/endpoints` $\rightarrow$ 200 OK `[]`.
* **Pass/Fail**: PASS if empty state renders without errors and button triggers Add Modal. FAIL if table skeleton hangs or table headers display with no rows.
* **Permitted Remediation**: Ensure `<EmptyState />` has accessible button triggers.

### QA-002: Initial Load with Registered Endpoints
* **Target File**: `components/endpoint-table.tsx`, `components/endpoint-row.tsx`
* **Input State**: Database contains $N$ registered endpoints with no initial checks in memory.
* **User Action**: Navigate to `/`.
* **Expected DOM State**:
  - Summary card "Total Monitored" = $N$.
  - Table renders $N$ rows.
  - Status badge on every unprobed row renders `◌ NO DATA`.
  - Latency column displays `--` with subtext `"No response"`.
  - 24h Uptime and 24h P95 display `--`.
* **Expected Network**: Exactly 1 request: `GET /api/endpoints` $\rightarrow$ 200 OK.
* **Pass/Fail**: PASS if all $N$ rows render with `NO DATA` without initiating background N+1 API calls. FAIL if mock numbers appear.

### QA-003: Global Health Counts Derivation
* **Target File**: `components/system-overview.tsx`, `components/summary-card.tsx`
* **Input State**: Endpoints evaluated via manual probe or detail fetch: 2 UP, 1 DEGRADED, 1 DOWN, 1 NO DATA.
* **User Action**: Observe `<SystemOverview />` cards.
* **Expected DOM State**:
  - Total Monitored = `5`
  - Operational (UP) = `2` (`text-emerald-400`, subtext: `"2 within latency threshold"`)
  - Degraded (Slow) = `1` (`text-amber-400`, subtext: `"1 above latency threshold"`)
  - Failing (DOWN) = `1` (`text-rose-400`, subtext: `"1 HTTP errors or timeouts"`)
* **Pass/Fail**: PASS if counts strictly reflect latest checks. FAIL if NO DATA is counted as UP or DOWN.

### QA-004: Loading Skeletons
* **Target File**: `components/loading-skeleton.tsx`
* **Input State**: `isLoadingEndpoints === true`.
* **Expected DOM State**: 4 summary card skeletons and 4 table row skeletons rendered with `animate-pulse` class. Zero layout shifts when real data arrives.

### QA-005 to QA-007: Search Filtering
* **Target File**: `components/endpoint-toolbar.tsx`
* **QA-005 (Name Search)**: Typing `"Auth"` filters table to show only endpoints whose name contains `"auth"` (case-insensitive).
* **QA-006 (URL Search)**: Typing `"api.stripe"` filters table to show matching URL substrings.
* **QA-007 (Search Clear)**: Clicking `✕` button clears input, sets `searchQuery = ''`, and restores full list.
* **Count Label**: Displays `"Showing {filteredCount} of {totalCount}"`.

### QA-008 to QA-011: Status Filter Tabs
* **Target File**: `components/endpoint-toolbar.tsx`, `app/page.tsx:314-318`
* **Filter Options**: `All`, `UP`, `DEGRADED`, `DOWN`, `NO DATA`.
* **Behavior**: Clicking a filter tab isolates endpoints matching that specific status.
* **Visual State**: Active tab styled with `bg-zinc-800 text-zinc-100 shadow-xs`.

### QA-012: Empty Filter Results
* **Target File**: `components/empty-state.tsx`
* **Input State**: Search query or status filter yields 0 matches.
* **Expected DOM State**: Renders `<EmptyState type="no-filtered-results" />` with text `"No endpoints match your filters"` and button `"Clear filters"`.
* **Action**: Clicking `"Clear filters"` resets `searchQuery = ''` and `statusFilter = 'all'`.

---

## 7. Endpoint Registration Specification (`QA-013` through `QA-021`)

### QA-013: Modal Trigger & Initial Focus
* **Target File**: `components/add-endpoint-modal.tsx`
* **Action**: Click `"+ Add Endpoint"` in header or empty state.
* **Expected Behavior**: Modal opens with backdrop blur; cursor automatically focuses into `Service Name` input.

### QA-014 to QA-018: Input Validation Contracts

| QA ID | Scenario | Input Tested | Expected Client Validation Message | Network Dispatched? |
| :--- | :--- | :--- | :--- | :---: |
| **QA-014** | Blank Fields | Name: `""`, URL: `""` | `"Service name is required"`, `"Target URL is required"` | **NO** |
| **QA-015** | Forbidden Protocol | URL: `ftp://files.org` | `"URL must use HTTP or HTTPS protocol"` | **NO** |
| **QA-016** | Malformed URL | URL: `not-a-valid-url` | `"Please enter a valid HTTP or HTTPS URL"` | **NO** |
| **QA-017** | Non-positive Threshold| Threshold: `0` or `-50` | `"Threshold must be a positive integer"` | **NO** |
| **QA-018** | Threshold Ceiling | Threshold: `60001` | `"Threshold must not exceed 60,000 ms"` | **NO** |

### QA-019: Duplicate URL Conflict (HTTP 409)
* **Target File**: `components/add-endpoint-modal.tsx`
* **Action**: Submit form with URL identical to an existing endpoint.
* **Expected Server Response**: HTTP 409 `{ "error": "An endpoint with this URL already exists" }`.
* **Expected DOM State**: Modal remains open; entered data is preserved; server error banner renders above form fields: `"An endpoint with this URL already exists"`.

### QA-020 & QA-021: Successful Registration Lifecycle
* **Target File**: `components/add-endpoint-modal.tsx`, `app/page.tsx:268-275`
* **Action**: Submit valid form.
* **Expected Server Response**: HTTP 201 `{ id: X, name: "...", url: "...", latencyThresholdMs: 500, createdAt: "..." }`.
* **Post-Creation Invariants**:
  - Modal automatically closes.
  - Green toast notification: `"Endpoint \"{name}\" registered successfully."`
  - New endpoint prepends to the table list.
  - **QA-021 Invariant**: New endpoint starts in `◌ NO DATA`. Zero network requests are sent to `/api/endpoints/:id/check`. No auto-probe.

---

## 8. Manual Check Specification (`QA-022` through `QA-029`)

### QA-022 & QA-023: In-Flight Debounce & State
* **Target File**: `components/check-button.tsx`, `app/page.tsx:175-200`
* **Action**: Click `"Check Now"`.
* **Expected Behavior**: Button disabled immediately; icon swaps to rotating spinner; `probingIds` tracks endpoint ID; rapid double-clicks send exactly **one** POST request to `/api/endpoints/:id/check`.

### QA-024 to QA-028: Probe Outcomes & Failure Attribution

| QA ID | Target Condition | Target Probe Behavior | Response Status | UI Badge | Toast Notification Message |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **QA-024** | Healthy UP | HTTP 200 in 25ms ($< 500\text{ms}$) | 200 OK | `● UP` | Success (Green): `"{Name} probe: UP (25 ms)"` |
| **QA-025** | Degraded | HTTP 200 in 620ms ($> 500\text{ms}$) | 200 OK | `▲ DEGRADED` | Info (Amber): `"{Name} probe: DEGRADED (620 ms)"` |
| **QA-026** | HTTP 500 | Monitored API returns HTTP 500 | 200 OK | `✕ DOWN` | Error (Rose): `"{Name} probe: DOWN (HTTP 500)"` |
| **QA-027** | Timeout | Monitored API hangs $> 5000\text{ms}$ | 200 OK | `✕ DOWN` | Error (Rose): `"{Name} probe: DOWN (timeout)"` |
| **QA-028** | DNS Error | Monitored API domain fails to resolve | 200 OK | `✕ DOWN` | Error (Rose): `"{Name} probe: DOWN (dns)"` |

*Attribution Rule*: For QA-024 through QA-028, the probe was successful from PulseCheck's perspective; `/api/endpoints/:id/check` returns HTTP 200 with saved check details. The target failure is reflected in the check row and toast, not as an HTTP 500 server crash.

### QA-029: PulseCheck Infrastructure Failure
* **Scenario**: Database is disconnected or crashes during check persistence.
* **Response**: `/api/endpoints/:id/check` returns HTTP 500 `{ "error": "Internal server error" }`.
* **Expected Toast**: Error (Rose): `"Probe failed: Internal server error"`. Button returns cleanly to idle state.

---

## 9. Detail View Specification (`QA-030` through `QA-040`)

### QA-030 & QA-031: Master-Detail Navigation
* **Target File**: `app/page.tsx:339-350`, `components/endpoint-detail.tsx`
* **Navigation Invariant**: Clicking an endpoint row unmounts the list view and mounts `<EndpointDetail />`.
* **Back Navigation**: Clicking `"Back to Overview"` returns to `<EndpointTable />`, preserving `searchQuery` and `statusFilter`.

### QA-032 to QA-036: Metrics Correctness Verification
* **Target File**: `components/metrics-grid.tsx`, `services/metrics.ts`
* **Formulas**:
  - $\text{Uptime \%} = \frac{\text{UP} + \text{DEGRADED}}{\text{Total Checks}} \times 100$
  - $\text{Error Rate \%} = \frac{\text{DOWN}}{\text{Total Checks}} \times 100$
  - $\text{Average Latency} = \frac{\sum \text{Valid Latencies}}{\text{Count of Valid Latencies}}$ (Successful non-null only)
  - $\text{P95 Latency} = \text{Nearest rank 95th percentile of valid latencies}$
* **Zero Checks Invariant (QA-036)**: If `totalChecks === 0`, all 4 metrics render `--`.

### QA-037 to QA-039: Latency Chart Verification
* **Target File**: `components/latency-chart.tsx`
* **Chronological Ordering**: X-axis data points ordered chronologically from oldest (left) to newest (right).
* **Reference Line (QA-038)**: Plotted at $y = \text{latencyThresholdMs}$ with dashed stroke and legible text `"SLA Threshold ({X} ms)"`.
* **Null Latency Isolation (QA-039)**: Checks with `latencyMs === null` (timeouts/DNS errors) must **never** be plotted at $0\text{ms}$. In tooltips, display `"Failed (timeout)"` in rose text.

### QA-040: History Audit Log
* **Target File**: `components/history-table.tsx`
* **Ordering**: Descending by `checkedAt` (most recent check at top).
* **Limit**: Up to 50 rows displayed. Diagnostics show detailed error types (e.g. `Connection Timeout`, `HTTP 502 Bad Gateway`).

---

## 10. Deletion Flow Specification (`QA-041` through `QA-043`)

### QA-041: Destructive Confirmation Modal
* **Target File**: `components/delete-endpoint-modal.tsx`
* **Action**: Click trash can icon on endpoint row or in detail header.
* **DOM State**: Modal renders with red warning icon, endpoint name in bold, URL in monospace, and explicit cascade warning text.

### QA-042: Cancellation
* **Action**: Click `"Cancel"`, click outside backdrop, or press `Escape`.
* **DOM State**: Modal closes immediately; zero DELETE requests sent; endpoint remains intact.

### QA-043: Execution & Cascade Cleanup
* **Action**: Click `"Delete Endpoint"`.
* **Expected Request**: `DELETE /api/endpoints/:id` $\rightarrow$ 200 OK `{ "success": true }`.
* **Post-Deletion State**:
  - Modal closes.
  - Endpoint removed from table state.
  - If viewing deleted endpoint in detail view, UI immediately resets to overview.
  - Success toast displays: `"Endpoint deleted successfully."`
  - Database verification: All child rows in `checks` table deleted via PostgreSQL `ON DELETE CASCADE`.

---

## 11. Responsive Layout Specification (`QA-044` through `QA-047`)

```
Breakpoint Matrix:
┌─────────────────┬─────────────────────────────────────────────────────────┐
│ Viewport Width  │ Required Layout Behavior                                │
├─────────────────┼─────────────────────────────────────────────────────────┤
│ 1440px (Desktop)│ 6-column tabular layout; full width cards (QA-044)      │
│ 1024px (Tablet L│ Table visible with horizontal scroll if needed          │
│ 768px (Tablet P)│ Summary cards collapse to grid-cols-2 (QA-045)          │
│ 375px (Mobile)  │ Table hides; <EndpointMobileCard /> list renders (QA-046│
│ 320px (Narrow)  │ Zero horizontal window scrolling; compact modals (QA-047│
└─────────────────┴─────────────────────────────────────────────────────────┘
```

* **Touch Targets**: All mobile buttons and interactive targets must have a minimum clickable area of $36\text{px} \times 36\text{px}$.
* **Text Wrapping**: Monospace URLs must apply `truncate` or `break-all` to prevent blowing out viewport width.

---

## 12. Accessibility (WCAG 2.1 AA) Specification (`QA-048` through `QA-050`)

### QA-048: Keyboard Navigation & Focus Order
* **Tab Flow**: Header Button $\rightarrow$ Search Field $\rightarrow$ Clear Button $\rightarrow$ Filter Tabs $\rightarrow$ Table Rows $\rightarrow$ Row Action Buttons.
* **Focus Styling**: All interactive elements must show visible focus rings: `focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950`.

### QA-049: Modal Focus Trap & Restoration
* **Requirement**:
  1. Opening modal traps keyboard focus within the dialog; `Tab` cannot escape to the background document.
  2. Pressing `Escape` closes the modal immediately.
  3. Closing the modal restores focus to the initiating button element.

### QA-050: Color-Independent Status Badges
* **Target File**: `components/status-badge.tsx`
* **Multi-Factor Accessibility**: Status must never rely solely on color:
  - `UP`: Circle SVG (`●`) + Text `"UP"` + Emerald color.
  - `DEGRADED`: Triangle SVG (`▲`) + Text `"DEGRADED"` + Amber color.
  - `DOWN`: Cross SVG (`✕`) + Text `"DOWN"` + Rose color.
  - `NO DATA`: Dashed Circle SVG (`◌`) + Text `"NO DATA"` + Zinc color.

---

## 13. Error Handling & Sanitization Contract

To prevent information disclosure and maintain security hygiene:
1. **Zero Stack Traces**: No error stack traces, internal file paths (`D:\Pulse_Health\...`), or Node internals may ever appear in toast messages, modal dialogs, or DOM elements.
2. **Zero SQL / Credential Exposure**: Database errors must be caught and presented as clean generic summaries (e.g. `"Failed to persist health check"`). Database URLs and credentials must never appear in error strings.
3. **Safe JSON Parsing**: Client fetch handlers must catch non-JSON error responses (e.g. HTML 502/504 proxy errors) using `.catch(() => ({}))` to prevent `SyntaxError: Unexpected token <` uncaught exceptions.

---

## 14. Metrics Verification Deterministic Fixture

The test suite must verify metrics calculations using deterministic test datasets:

### Test Dataset Alpha (Mixed Health)
* Endpoint configured with `latencyThresholdMs: 500`.
* Check 1: `status = 'up'`, `latencyMs = 120`
* Check 2: `status = 'up'`, `latencyMs = 180`
* Check 3: `status = 'degraded'`, `latencyMs = 600`
* Check 4: `status = 'down'`, `latencyMs = null` (Timeout)
* **Expected Invariants**:
  - Total Checks = `4`
  - Successful Checks = `3` (Check 1, 2, 3)
  - Failed Checks = `1` (Check 4)
  - Uptime % = $\frac{3}{4} \times 100 = 75.00\%$
  - Error Rate % = $\frac{1}{4} \times 100 = 25.00\%$
  - Valid Latencies Array = `[120, 180, 600]` (Check 4 excluded)
  - Average Latency = $\frac{120 + 180 + 600}{3} = 300\text{ms}$
  - P95 Latency = `600ms` (Index $\lceil 0.95 \times 3 \rceil - 1 = 2 \rightarrow 600\text{ms}$)

---

## 15. Chart Verification Contract

* **Component**: `components/latency-chart.tsx`
* **Data Mapping**:
  ```typescript
  interface ChartDataPoint {
    rawTimestamp: string;
    timeLabel: string;
    timestampMs: number;
    latencyMs: number | null;
    status: string;
    statusCode: number | null;
    errorType: string | null;
  }
  ```
* **Null Handling Invariant**:
  - `latencyMs: null` must never be converted to `0`.
  - Recharts Area/Line handles null by creating gaps or broken line segments.
  - Tooltip inspects `isFailed = data.latencyMs === null`. If true, displays `"Failed ({data.errorType || 'No response'})"` in rose.

---

## 16. API Contract Verification Table

| Route | Method | Required Request Body | Success Status | Response Payload Shape | Error Statuses |
| :--- | :---: | :--- | :---: | :--- | :---: |
| `/api/endpoints` | `GET` | None | 200 | `Endpoint[]` (`id, name, url, latencyThresholdMs, createdAt`) | 500 |
| `/api/endpoints` | `POST`| `{ name, url, latencyThresholdMs }` | 201 | `Endpoint` | 400, 409, 500 |
| `/api/endpoints/:id` | `DELETE`| None | 200 | `{ success: true }` | 404, 500 |
| `/api/endpoints/:id/check` | `POST` | None | 200 | `{ success: boolean, check: Check }` | 404, 500 |
| `/api/endpoints/:id/metrics`| `GET` | None | 200 | `EndpointMetrics` (`uptime, errorRate, averageLatencyMs, p95LatencyMs, totalChecks`) | 404, 500 |
| `/api/endpoints/:id/history`| `GET` | `?limit=50` | 200 | `Check[]` (up to 50 items) | 404, 500 |

---

## 17. Performance Verification Contract

1. **Mount Network Request Count**: Exactly **1** HTTP request dispatched on dashboard initial render (`GET /api/endpoints`).
2. **Selection Network Request Count**: Exactly **2** parallel requests dispatched when an endpoint is selected (`GET /api/endpoints/:id/metrics` and `GET /api/endpoints/:id/history?limit=50`).
3. **Cancellation of In-Flight Requests**: Switching selected endpoints rapidly must set `isCancelled = true` on prior effect cycles to prevent stale state overwriting newer selections.

---

## 18. Browser & Console Hygiene Contract

During full test execution and user interaction flows:
* **React Hydration Errors**: Exactly **0**.
* **React DOM Nesting Warnings**: Exactly **0** (e.g. no interactive controls inside interactive controls, no tables without thead/tbody).
* **Uncaught Exceptions**: Exactly **0**.
* **Failed Static Assets**: Exactly **0** (no 404s for icons, fonts, or chunks).

---

## 19. Visual Polish & Design System Tokens

All component styling must adhere to the design system tokens:
* **Backgrounds**: Root canvas `#09090b` (`bg-[#09090b]`), cards/surfaces `#121215` (`bg-[#121215]`), tables `#121215`.
* **Borders**: Dark zinc `border-zinc-800` (subtle separators `border-zinc-800/60`).
* **Accent & Interactive**: Indigo `text-indigo-400`, `ring-indigo-500`, `border-indigo-500`.
* **Status Colors**:
  - Operational: Emerald (`bg-emerald-500/10 text-emerald-400 border-emerald-500/25`).
  - Degraded: Amber (`bg-amber-500/10 text-amber-400 border-amber-500/25`).
  - Failing: Rose (`bg-rose-500/10 text-rose-400 border-rose-500/25`).
  - Unchecked: Zinc (`bg-zinc-800/60 text-zinc-400 border-zinc-700/50`).

---

## 20. QA Execution Order Strategy

Phase 8C execution must follow this strict 12-stage sequential order:

```
[1. Static & Lint Audit] ──► [2. Run Baseline Unit Tests] ──► [3. Next.js Production Build]
                                                                        │
┌───────────────────────────────────────────────────────────────────────┘
▼
[4. Boot Prod Server :3100] ──► [5. Boot Target Fixture :3101] ──► [6. Browser QA (QA-001..QA-043)]
                                                                        │
┌───────────────────────────────────────────────────────────────────────┘
▼
[7. Viewport QA (320-1440px)] ──► [8. A11y & Focus Audit] ──► [9. Network & Error Isolation]
                                                                        │
┌───────────────────────────────────────────────────────────────────────┘
▼
[10. Database State Audit] ──► [11. Console Hygiene Check] ──► [12. Re-run Full Baseline Suite]
```

---

## 21. Evidence Requirements for Sign-Off

To consider any scenario PASSED in Phase 8C, the following evidence must be logged:
1. **DOM Inspector Evidence**: Specific element selector, rendered text content, and ARIA attributes.
2. **Network Activity Log**: Target route, method, response status, duration, and response body.
3. **Database Telemetry**: Direct SQL query results verifying persisted check records and cascade deletions.
4. **Console Log Capture**: Browser console output proving zero errors or hydration warnings.

---

## 22. Issue Remediation Policy (Severity Tiers)

* **P0 Issues (Core Functionality Blockers)**: Must be remediated immediately in Phase 8C.
* **P1 Issues (Serious Product/UX/A11y Defect)**: Must be remediated in Phase 8C before phase sign-off.
* **P2 Issues (Noticeable Polish Issue)**: Remediated within Phase 8C polish cycle if within frontend boundary.
* **P3 Issues (Cosmetic / Documentation)**: Documented; resolved if trivial.

---

## 23. File Ownership & Permitted Edits

| File Path | Permitted to Edit in 8C? | Scope of Permitted Changes |
| :--- | :---: | :--- |
| `app/page.tsx` | **YES** | State handling, selection handlers, toast triggers, filter logic. |
| `components/add-endpoint-modal.tsx` | **YES** | Native focus trapping, validation error copy, accessibility. |
| `components/delete-endpoint-modal.tsx`| **YES** | Native focus trapping, warning copy, accessible button roles. |
| `components/endpoint-table.tsx` | **YES** | Responsive table styling, skeleton alignments, empty state actions.|
| `components/endpoint-row.tsx` | **YES** | Focus outlines, stopPropagation on actions, badge layout. |
| `components/endpoint-mobile-card.tsx` | **YES** | Mobile spacing, touch target padding, label clarity. |
| `components/endpoint-detail.tsx` | **YES** | Back button focus, header metadata layout, metric grid integration.|
| `components/metrics-grid.tsx` | **YES** | Metric card layout, zero-check representation, typography. |
| `components/latency-chart.tsx` | **YES** | Tooltip styling, threshold line label, null latency handling. |
| `components/history-table.tsx` | **YES** | Diagnostics formatting, relative timestamp readability. |
| `components/status-badge.tsx` | **YES** | Multi-factor icons, WCAG contrast tokens. |
| `components/latency-display.tsx` | **YES** | Null latency `--` handling, delta styling. |
| `components/check-button.tsx` | **YES** | In-flight loading animation, disabled cursor state. |
| `components/empty-state.tsx` | **YES** | Action button styling and text copy. |
| `components/toast.tsx` | **YES** | ARIA live regions, dismissal timeout, positioning. |
| `services/*.ts` | **NO** | **PROHIBITED**: Backend logic must remain untouched. |
| `db/schema.ts` | **NO** | **PROHIBITED**: Database schema is frozen. |
| `app/api/*` | **NO** | **PROHIBITED**: API contracts are frozen. |
| `package.json` | **NO** | **PROHIBITED**: Zero dependency changes allowed. |

---

## 24. Phase 8C Acceptance Criteria

Phase 8C is successful only when all of the following conditions are met:
1. All 50 scenarios (`QA-001` through `QA-050`) have been audited against the live application.
2. Open P0 defects = `0`.
3. Open P1 defects = `0`.
4. Zero synthetic or fake telemetry is present.
5. All 5 responsive breakpoints (1440px, 1024px, 768px, 375px, 320px) render cleanly without horizontal overflow.
6. Keyboard navigation and modal focus trapping function without external libraries.
7. Zero React hydration mismatch errors occur.
8. Zero uncaught console errors or warnings occur during normal workflows.
9. Baseline test suite remains 100% green (198/198 tests passing).
10. `npx tsc --noEmit` exits code 0 with zero errors.
11. `npm run lint` exits code 0 with zero errors.
12. `npm run build` exits code 0 with successful compilation.

---

## 25. Phase 8C Implementation Checklist

Before closing Phase 8C, the engineer must verify each item on this checklist:

- [ ] Execute `QA-001` to `QA-012` (Dashboard Overview & Filtering).
- [ ] Execute `QA-013` to `QA-021` (Registration & Validation).
- [ ] Execute `QA-022` to `QA-029` (Manual Check & Error Isolation).
- [ ] Execute `QA-030` to `QA-040` (Endpoint Detail, Metrics & Latency Chart).
- [ ] Execute `QA-041` to `QA-043` (Deletion & Database Cascade).
- [ ] Execute `QA-044` to `QA-047` (Responsive Layout Audit across all 5 viewports).
- [ ] Execute `QA-048` to `QA-050` (WCAG 2.1 AA Accessibility & Keyboard Focus Traps).
- [ ] Verify error sanitization (zero SQL, zero credentials, zero stack traces in UI).
- [ ] Verify metrics mathematical accuracy against deterministic test datasets.
- [ ] Implement required frontend polish fixes exclusively within allowed component files.
- [ ] Run `npm test` and verify 198/198 tests passing.
- [ ] Run `npx tsc --noEmit` and verify exit code 0.
- [ ] Run `npm run lint` and verify exit code 0.
- [ ] Run `npm run build` and verify clean production build.
- [ ] Confirm zero modifications to backend services, API routes, database schemas, or dependencies.
