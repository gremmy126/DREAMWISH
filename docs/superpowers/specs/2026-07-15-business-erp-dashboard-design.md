# Business ERP Dashboard Design

## Goal

Add an ERP dashboard inside the existing DREAMWISH Business workspace, using the attached ERPNext dashboard as the information-architecture reference. The DREAMWISH sidebar, top bar, global navigation, authentication shell, and CRM sidebar entry remain unchanged.

The dashboard is a native DREAMWISH screen. It does not embed the ERPNext application or copy ERPNext's internal sidebar. It displays only verified ERP data and provides safe links to open the original ERPNext records when needed.

## Scope

This is the second independently deliverable stage of the approved Business Suite program. Automation connection binding ships first; CRM, AI business context, and Deep Research follow in that order. Local installation is not part of the approved program.

In scope:

- Keep the existing DREAMWISH sidebar and top bar unchanged.
- Change the Business tabs to `개요 · ERP · 메일 · 명함 · 회의 · 리포트`.
- Remove the existing `영업·매출` tab and its mobile-revenue UI.
- Keep Mail, Business Cards, and Meetings unchanged.
- Remove company and sales-facing cards from Business Overview; keep the previously agreed operational cards: customers, follow-ups, open tasks, and today's meetings.
- Add a responsive ERP dashboard based on the attached reference.
- Add a typed ERP dashboard data boundary with explicit connected, disconnected, degraded, and stale states.
- Never display invented ERP values. Missing values render as `연결 후 표시` or `데이터 없음`, not zero.

Out of scope for this first sub-project:

- Changing the global DREAMWISH sidebar.
- Embedding ERPNext in an iframe.
- Installing Docker, ERPNext, Frappe CRM, or Ollama.
- Building the downloadable PowerShell setup wizard.
- Rebuilding the standalone CRM workspace.
- Adding the deep-research worker. Calendar phone-import presentation removal is included in this ERP increment, while Automation connection reconciliation is delivered first by `docs/superpowers/specs/2026-07-15-automation-connection-binding-design.md`.

## Approaches Considered

### 1. Native DREAMWISH ERP dashboard — selected

DREAMWISH renders its own cards, charts, tables, and actions from a stable dashboard contract. This preserves the current product shell, supports responsive layout and accessible empty states, and keeps ERP credentials out of presentation components.

### 2. ERPNext iframe — rejected

An iframe would add a second sidebar inside DREAMWISH, conflict with the requested layout, and introduce mixed-content, cookie, and frame-policy failures for a local ERPNext instance. It also makes responsive behavior and error recovery inconsistent.

### 3. Launch cards only — rejected as the main experience

Opening ERPNext in a new tab is safe and useful for detailed work, but launch cards alone do not provide the requested dashboard. Safe external links remain available as secondary actions.

## Business Workspace Structure

`BusinessHub` remains the Business workspace orchestrator. The ERP dashboard is moved into a dedicated component boundary rather than expanding the already large `BusinessHub.tsx` file.

Implementation boundaries:

- `components/Business/BusinessHub.tsx`: tabs, shared Business loading, and existing Business panels.
- `components/Business/ErpDashboard.tsx`: dashboard state and page composition.
- `components/Business/erp/ErpMetricGrid.tsx`: six summary cards.
- `components/Business/erp/ErpSalesTrend.tsx`: accessible native SVG trend chart.
- `components/Business/erp/ErpSalesBreakdown.tsx`: accessible native SVG donut and legend.
- `components/Business/erp/ErpRecentActivity.tsx`: recent ERP document activity.
- `components/Business/erp/ErpReceivablesTable.tsx`: top five outstanding customers.
- `components/Business/erp/ErpInventoryValue.tsx`: top five inventory values.
- `components/Business/erp/ErpQuickActions.tsx`: safe links into ERPNext.
- `src/lib/erp/erp-dashboard.types.ts`: UI-independent dashboard contract.
- `src/lib/erp/erp-dashboard.service.ts`: validates and normalizes provider results.
- `app/api/business/erp/dashboard/handler.ts`: dependency-injected owner-scoped HTTP handler used by tests and production.
- `app/api/business/erp/dashboard/route.ts`: App Router boundary exporting only the supported `GET` handler.

The component split is deliberate: each unit has one responsibility and can be tested without reading or rendering the entire Business workspace.

## Dashboard Layout

### Header

The header displays:

- Title: `ERP 대시보드`.
- Connection state and last successful refresh time.
- `새로고침` action.
- `ERPNext 열기` action when a verified base URL exists.
- `ERPNext 연결` action when no connection exists. It opens the existing connection-management flow for an ERPNext instance the user already operates. Official ERPNext documentation may appear only as secondary help; this increment does not provide Docker, ERPNext, or local installer buttons and must not claim to install software.

### Summary cards

Six cards follow the reference layout:

1. Total sales for the current month.
2. Total purchases for the current month.
3. Net profit for the current month.
4. Total receivables.
5. Total unpaid payables.
6. Current inventory value.

Each card contains the current value, optional previous-period percentage, trend direction, and an accessible text description. A missing comparison is omitted rather than rendered as `0%`.

Metric semantics are provider-normalized and shared with CRM and AI. Current-month sales are the ERP company's base-currency sum of submitted Sales Invoice `base_net_total`, less submitted return/credit-note net totals, excluding tax, using ERP posting dates and the configured ERP company time zone. Purchases use the equivalent submitted Purchase Invoice net basis. Net profit comes from the ERP accounting report for the same company, period, and base currency. A provider that cannot verify these definitions returns `null` rather than a differently defined approximation.

### Main grid

The middle row contains:

- Monthly sales trend.
- Current-month sales breakdown.
- Recent ERP activity.

The lower row contains:

- Top five receivables with 30-day and 60-day aging values.
- Top five inventory items by valuation.
- Quick actions for quotations, sales orders, sales invoices, payment entries, purchase requests, purchase orders, purchase invoices, items, warehouses, stock lookup, and reports.

The reference uses a wide desktop grid. DREAMWISH adapts it as follows:

- Extra large: six metric cards, then three columns.
- Medium: two or three columns depending on content width.
- Small: one column, horizontally scrollable tables, and touch-sized actions.

## Data Contract

The UI consumes one normalized snapshot:

```ts
type ErpMetricValue = {
  value: number | null;
  changePercent: number | null;
  comparisonLabel: string | null;
};

type ErpDashboardSnapshot = {
  connectionState: "not_configured" | "disconnected" | "connected" | "degraded" | "error";
  connectionMode: "server" | null;
  asOf: string | null;
  stale: boolean;
  company: { externalId: string; name: string } | null;
  accountingPeriod: { start: string; end: string; label: string } | null;
  currency: string | null;
  metrics: {
    monthlySales: ErpMetricValue;
    monthlyPurchases: ErpMetricValue;
    monthlyNetProfit: ErpMetricValue;
    receivables: ErpMetricValue;
    payables: ErpMetricValue;
    inventoryValue: ErpMetricValue;
  };
  salesTrend: Array<{ period: string; value: number | null }>;
  salesBreakdown: Array<{ label: string; value: number | null }>;
  recentActivity: ErpActivity[];
  receivables: ErpReceivable[];
  inventory: ErpInventoryItem[];
  quickActions: ErpQuickAction[];
  warning: string | null;
};
```

Every monetary field uses `number | null`. `null` means unknown or unavailable and must not be coerced to zero. The service rejects negative values where the underlying ERP measure cannot be negative, invalid dates, malformed external URLs, and non-finite numbers.

For `not_configured` or `disconnected`, every metric value and comparison is `null`; company, accounting period, currency, and `asOf` are `null`; all chart, activity, receivable, inventory, and quick-action arrays are empty; and no ERP record link is emitted. A previously verified cache may render only during a temporary provider error with its original `asOf` and `stale: true`. Disconnect or any connection identity change invalidates that cache before the new state becomes readable.

`connectionState` and `connectionMode` come from the shared `src/lib/erp/erp-connection.types.ts` contract. CRM and AI can add request-specific states such as `not_requested`, `not_mapped`, `available`, or `unavailable`, but they do not redefine connection health. Freshness remains the separate `stale` flag.

The verified ERPNext secret is stored once as the canonical same-owner `erpnext` credential managed by Connection Management. The ERP identity document references that exact credential and stores only endpoint/site/company identity, connection revision, capability version, and recovery journal state; it does not copy the API secret. `GET /api/automation/connections` may project the same safe credential candidate for compatible Automation nodes, while Business, CRM, and AI resolve the identity through the ERP adapter. These APIs are projections over one credential authority, not independent connection stores.

The shared connection identity separates `connectionRevision`, which changes when credentials, endpoint, site, or company identity changes, from `capabilityVersion`, which changes when an owner toggles permissions such as `draft_write`. CRM mappings bind to the identity revision only, so a capability-only toggle cannot invalidate an otherwise unchanged customer mapping. Any reconnect or identity change resets `draft_write` to disabled and increments both versions; an AI draft proposal records and rechecks both independently.

This increment permits zero or one active ERPNext connection per owner. A verified reconnect uses an owner/provider-scoped durable workflow journal and monotonic generation fence: credential and identity rows are staged under one operation ID, and only the committed matching generation is publicly resolvable. Recovery runs before connection listing/resolution and resumes or aborts every crash phase; stale compensation cannot overwrite a newer generation. Delete and disconnect use the same staged workflow instead of deleting the credential first. Ambiguous legacy multiple-active records fail closed unless one exact newest credential/metadata pair can be reconciled deterministically. Disconnect never silently falls back to another company. This makes dashboard, CRM currency, and AI reads resolve one unambiguous connection.

The connection document also owns the identity-mutation barrier used by future ERP draft dispatch. Save, reconnect, per-credential deletion, bulk disconnect, and capability changes all begin under the same owner-scoped connection-store lock. An identity mutation that commits its barrier first makes a later dispatch fail closed; a dispatch already fenced first makes the mutation return `409 DRAFT_DISPATCH_IN_FLIGHT` before any credential or identity row changes. Prepared but unsent work may be invalidated by the new connection revision, while an in-flight attempt must reach a fenced terminal state first.

## Data Flow

1. Selecting the `ERP` tab starts a dashboard request.
2. A server-reachable connection calls the owner-scoped DREAMWISH route.
3. The service requests only the data needed for this dashboard from ERPNext/Frappe, normalizes it, and returns a single snapshot.
4. The UI renders the snapshot and preserves the last successful snapshot during a manual refresh.
5. Detailed work opens ERPNext in a new tab using a validated configured base URL and `noopener,noreferrer`.

ERPNext credentials remain server-side. They are never serialized into React props, browser storage, logs, or error messages.

All server-reachable ERPNext traffic uses one DNS-pinned HTTPS transport with certificate/SNI validation, no redirects, bounded JSON responses, and abort propagation. The transport accepts only `GET` and `POST`; `GET` has no body, and `POST` accepts only a bounded JSON object created by an allowlisted provider. Dashboard and CRM reads use only `GET`. A later explicitly approved AI draft provider may use `POST` only for its fixed quotation or sales-order resource path; no user-provided URL, DocType, or HTTP method reaches the transport.

## Empty, Loading, and Error States

- `connectionState === "not_configured"` or `"disconnected"`: show the dashboard structure with unavailable values plus a clear `ERPNext 연결` call to action.
- Loading without cached data: show fixed-size skeletons to prevent layout shift.
- Refresh with cached data: retain the last dashboard and show an inline refresh indicator.
- Partial provider failure: render available sections, mark the snapshot `degraded`, and explain which sections are unavailable.
- Authentication failure: show `ERPNext 연결을 다시 확인해주세요` without exposing credentials or upstream response bodies.
- Timeout/network failure: keep the last successful snapshot, mark it stale, and offer retry.
- Empty real dataset: display zero only when ERPNext explicitly returns a verified zero; otherwise display `데이터 없음`.

## Business Cleanup Included

Because the dashboard replaces the old sales surface, this change also:

- Stops fetching `/api/business/revenue` from `BusinessHub`.
- Removes `Sales`, `ManualRevenueImport`, mobile revenue candidates, and the Business-only `DeviceConnectionPanel` usage.
- Removes sales and company metrics from Overview.
- Removes sales rows from the Business report panel.
- Removes the Calendar screen's `휴대폰에서 가져오기` button, candidate fetch state, and review modal while preserving normal event creation and calendar views.
- Keeps the underlying legacy revenue API and repositories untouched for now to avoid an unrelated destructive migration.
- Keeps the device/calendar-candidate API and stored candidates untouched; this increment removes only the unsupported phone-import presentation.

## Security

- The server route calls `requireOwnerContext` before accessing any connection or ERP data.
- An ERP connection is scoped to one DREAMWISH owner; no global administrator token is shared across accounts.
- ERPNext is reached only through the already verified server-side Connection Management credential. The canonical endpoint requires HTTPS; URLs containing credentials, query strings, or fragments are rejected. This stage does not add a localhost, local-helper, or local-gateway mode.
- External ERP links are created from allowlisted route identifiers, never arbitrary URLs returned by ERP documents.
- The dashboard does not render upstream HTML.
- Upstream messages are mapped to safe user-facing errors and never passed through verbatim.

## Testing

### Unit tests

- Snapshot normalization, currency formatting, trend direction, null handling, URL validation, and stale detection.
- Explicit zero is distinguishable from missing data.
- Partial ERP responses create a degraded snapshot instead of failing the whole dashboard.

### Route tests

- Authentication is required.
- Owner identity comes only from the authenticated request context.
- Cross-owner connection access fails closed.
- Provider timeout and authorization failure return stable safe errors.

### UI contract tests

- Existing sidebar source remains unchanged.
- Calendar phone-import UI and `/api/devices/calendar-candidates` fetch usage are absent while ordinary calendar event creation remains.
- Business tabs include `dashboard` and exclude `sales`.
- Mail, Business Cards, Meetings, and Reports remain available.
- Six ERP metrics, three main panels, three lower panels, connection state, refresh, and safe ERP launch actions render.
- The disconnected view contains no fake financial figures.
- Charts have text alternatives and tables retain semantic headers.
- Responsive classes provide one-column mobile and multi-column desktop layouts.

### Regression verification

- Business and CRM remain separate global workspaces.
- Existing mail, business-card, meeting, owner-isolation, and navigation tests continue to pass.
- The full project test suite and TypeScript check run after the focused ERP dashboard tests.

## Acceptance Criteria

- The global DREAMWISH sidebar and top bar are visually and behaviorally unchanged.
- `비즈니스 > ERP` matches the attached ERPNext reference's information hierarchy while using DREAMWISH design tokens.
- No second ERP sidebar appears inside Business.
- Disconnected users receive an honest connection state, not sample financial data.
- Connected users see normalized real ERP values and safe links to detailed ERPNext records.
- The dashboard remains usable on desktop, tablet, and mobile widths.
- The old `영업·매출` UI and previously rejected mobile-revenue guidance are no longer visible.
