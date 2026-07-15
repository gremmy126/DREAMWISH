# CRM Dashboard and Contacts Design

## Goal

Replace the current cosmetic seven-tab CRM workspace with two real screens, `대시보드` and `연락처`, while preserving the existing DREAMWISH global sidebar, top bar, authentication shell, and visual language. The new CRM must use real owner-scoped data, expose contact relationship work clearly, and support an explicit user-approved link from a CRM contact to the corresponding ERPNext customer.

This design complements [Business ERP Dashboard Design](./2026-07-15-business-erp-dashboard-design.md). CRM remains the source of relationship and follow-up information; ERPNext remains the source of orders, invoices, payments, receivables, inventory, and accounting truth.

## Scope

In scope:

- Keep the existing DREAMWISH global sidebar and top bar unchanged.
- Replace the existing CRM tabs with exactly two actual screens: `대시보드 · 연락처`.
- Make tab selection change the rendered screen, not only the selected-tab styling.
- Build a responsive CRM dashboard based on the attached reference's information hierarchy, using DREAMWISH components and tokens.
- Build a full contacts screen with search, filters, pagination, selection, create, edit, delete, relationship history, contact-linked memories, and ERP customer mapping.
- Remove the CRM tabs `거래 · 활동 · 이메일 · 보고서 · 설정`.
- Remove the obsolete `PhoneContactImport` surface and all mobile-app import instructions from CRM.
- Separate dashboard aggregate state from contacts search state so a search never changes dashboard totals.
- Add a dedicated relationship stage instead of inferring the board from deal status or reusing the existing customer status incorrectly.
- Add manual, versioned, owner-scoped CRM-to-ERP customer mapping.
- Show live ERP customer information only after an approved mapping exists.

Out of scope for this increment:

- Changing the global DREAMWISH sidebar or top bar.
- Replacing ERPNext as the accounting system of record.
- Automatically linking customers by matching a name, company, email address, or phone number.
- Synchronizing contacts with a phone, Android application, iPhone application, or developer-mode bridge.
- Rebuilding Calendar, Automation, Business Mail, Business Cards, or Meetings.
- Adding a general-purpose deal engine, email client, custom report builder, or per-employee assignment model.
- Persisting ERP financial values into CRM records or AI memory.
- Installing ERPNext, Docker, Frappe CRM, Dolibarr, Twenty, or Ollama. Installer controls are explicitly excluded from the approved Business Suite program.

## Existing Problems Being Corrected

The current `CRMView` exposes seven tab labels, but `activeTab` does not select distinct page content. The same pipeline, contacts, detail, timeline, and analysis panels remain visible for every tab. The redesign introduces a real rendering boundary:

```text
CRMView
├── activeTab === "dashboard" → CrmDashboard
└── activeTab === "contacts"  → CrmContacts
```

The current customer search also replaces the array used to calculate dashboard metrics. That makes totals change when the user searches. The new implementation uses a dashboard snapshot and a separate paginated contacts query.

The existing `CrmPipelineBoard` is read-only, has no move or creation workflow, and maps a lost deal to discovery. It is not a valid basis for the requested relationship board and is removed from the new CRM composition. Existing underlying deal data and compatibility contracts are not destructively migrated in this increment.

## Information Architecture

### CRM workspace header

The CRM content header contains:

- Title `CRM` and a short description.
- The two local tabs `대시보드` and `연락처`.
- A search input labeled `고객, 회사, 연락처 검색`.
- A `고객 추가` action.

On the dashboard, search provides a non-destructive contact lookup and navigates to the contacts screen when a result is selected. On the contacts screen, it filters the paginated contact list. The header must not duplicate the global DREAMWISH sidebar or top bar.

### Dashboard screen

The dashboard is a read-oriented operational overview. It contains four metric cards, a relationship board, three supporting panels, and a recent-contacts preview.

#### Metric cards

1. `전체 연락처`: total owner-scoped CRM contacts.
2. `진행 중 고객`: contacts in `contacting` or `proposal_review` relationship stages.
3. `이번 달 매출`: current-month ERPNext sales total when a verified ERP connection is available.
4. `후속 연락 필요`: contacts whose `nextContactAt` is due or overdue.

The first, second, and fourth values come from CRM. The third comes from the normalized ERP dashboard provider described in the Business ERP design. `진행 중 고객` excludes `paused`, `inactive`, and every stage still marked `legacy_status`; only explicitly confirmed `contacting` and `proposal_review` contacts count. If ERP is not connected or the metric is unavailable, render `ERP 연결 후 표시` or `데이터 없음`; never insert sample revenue. Comparison percentages appear only when a real comparable period is available.

#### Relationship board

The board has four relationship stages:

1. `신규 리드` (`new_lead`)
2. `상담 중` (`contacting`)
3. `제안·검토` (`proposal_review`)
4. `계약 고객` (`customer`)

Each card may show the contact name, company, relationship value forecast, importance, next follow-up, and a real assigned-person label when one exists. Fields that do not exist are omitted rather than invented. `expectedValue` remains a CRM forecast and is never described as booked ERP revenue. It is displayed or compared only with its verified `expectedValueCurrency`; a missing or mismatched currency prevents financial comparison.

Moving a card changes only `relationshipStage`. The move is optimistic only after the server accepts a version-checked update; on conflict or failure it returns to the prior column and shows a safe retry message. Keyboard users can change stage through an accessible menu even if drag-and-drop is available.

#### AI customer insight

The right-side insight panel summarizes only data available to the authenticated owner. It can use CRM activity, due follow-ups, approved contact memories, and live ERP data for approved mappings. It must label the basis of the insight and distinguish facts from suggestions. When no useful context exists, it shows an honest empty state instead of a generated generic sales claim.

#### Today's follow-ups

The schedule panel is built from CRM `nextContactAt` values and supported CRM task records. It does not claim Calendar synchronization unless that connection is implemented and verified. Selecting an item opens the contact detail at the relevant timeline entry.

#### Recent activity

The recent-activity panel uses real `CrmActivity` records ordered by `createdAt`. It displays the activity type, contact, time, and safe summary. It does not use hard-coded chart percentages or synthetic events.

#### Recent contacts preview

The lower table shows a bounded recent-contact preview with an explicit `연락처 전체 보기` action. It is not the contacts data source and does not share mutable search state with the contacts screen.

### Contacts screen

The contacts screen contains:

- Search by name, company, email, and phone.
- Filters for relationship stage, operational status, importance, follow-up state, and ERP mapping state.
- Stable server-side sort and pagination.
- A semantic contact table on wide screens and equivalent contact cards on small screens.
- A detail panel or full-width mobile detail view.
- Create, edit, and delete actions.
- Relationship-stage editing.
- Activity timeline and note/activity creation.
- Approved and pending contact-linked memories with source, status, edit, and delete controls.
- A manual ERP customer mapping section.

Contact selection remains local to the CRM screen because the current global workspace navigation intentionally canonicalizes workspaces to `/`. A refresh returns to the contact list. Closing a detail panel returns focus to the initiating row or card.

#### Contact editing

The existing `Customer` entity remains the persisted contact entity for compatibility. The UI calls it a contact, but this increment does not create a second duplicate Contact collection.

`companyId` identifies the owner-scoped CRM company and `companyName` remains its denormalized display label. Creating or editing a contact selects an existing company or creates one from a normalized exact name; changing a contact's company changes that membership and does not rename a shared company. New exact normalized matches reuse the company record. Existing ambiguous duplicate companies are not merged automatically.

Editable fields are allowlisted:

- `name`
- `email`
- `phone`
- `companyName`
- `position`
- `memo`
- `tags`
- `status`
- `relationshipStage`
- `importance`
- `nextContactAt`
- `expectedValue`
- `expectedValueCurrency`

Server validation applies normalized email and phone handling, length and array limits, accepted enum values, and optimistic concurrency. Empty optional fields are normalized consistently. The request body cannot set `ownerId`, audit fields, ERP identifiers, or memory approval state.

#### Delete behavior

Deleting a contact requires an explicit confirmation that identifies the contact. The server verifies the owner and current version, then writes an authoritative contact tombstone with an idempotent deletion operation ID. Every activity, task, deal, insight, mapping, memory, ERP, and AI-context query must verify that the parent contact is still active, so all related data becomes inaccessible immediately even if it lives in another store. Idempotent cleanup then revokes active mappings, marks contact-linked long-term memories `forgotten`, and tombstones the remaining CRM aggregates. Cleanup retries cannot resurrect content. The audit log retains identifiers and event metadata but not deleted note or memory content.

Cross-store child creation uses a parent-write fence rather than a check-then-write sequence. The CRM store atomically claims a short-lived child-write lease against an active contact/version; the child repository stages the mapping or memory as non-readable, CRM rechecks the same lease and active parent, and only then may the child CAS to active. Deletion atomically blocks new leases and creates a durable cleanup job. That job remains incomplete while a lease is outstanding, cancels expired or staged children, and retries failed memory/mapping cleanup from persisted state with bounded backoff after process restart. A worker claims each job with its own ID and expiry; stale `running` claims are reclaimable and all completion/retry writes are fenced by the current claim ID. Authenticated CRM entry points drain a bounded number of due jobs, while all reads continue to fail closed independently of cleanup progress.

## Data Model

### Relationship stage

Add an explicit field to the existing customer/contact model:

```ts
type CustomerRelationshipStage =
  | "new_lead"
  | "contacting"
  | "proposal_review"
  | "customer";
```

The compatible `Customer` model also gains `relationshipStage?: CustomerRelationshipStage`, `relationshipStageSource: "explicit" | "legacy_status"`, `expectedValue: number | null`, `expectedValueCurrency: string | null`, and `version: number`. Existing records normalize a missing version to `1` and a missing/invalid forecast to `null`. An explicit `expectedValue: null` clears both amount and currency, while omission preserves both. `expectedValueCurrency` uses the verified workspace/ERP company base currency at entry time and otherwise remains `null`; it is never guessed from locale. Every accepted mutation atomically compares `expectedVersion` and increments the stored version. A mismatch returns the stable error `409 VERSION_CONFLICT` without applying any part of the mutation.

`status` continues to represent operational availability (`active | lead | paused | inactive`). `relationshipStage` represents relationship progress. The two concepts must not overwrite one another.

For existing data, the read normalizer derives an initial stage without rewriting records during a GET:

- `status === "lead"` → `new_lead`
- `status === "active"` → `customer`
- `status === "paused"` or `inactive` → `contacting`

Before the board is enabled, an idempotent store migration persists the legacy-derived stage and `relationshipStageSource = "legacy_status"` once, so later operational-status changes cannot move a contact between relationship columns. A legacy-derived stage is visibly marked `검토 필요` and is not treated by AI as a confirmed relationship fact. The first successful relationship-stage mutation changes the source to `explicit`. The migration must not silently mark a derived stage as confirmed.

### Contact-linked memory

The canonical AI memory system is the existing `MemoryCandidate` and `ApprovedMemory` lifecycle extended by the `MemoryEntityLink` defined in the AI context design. A contact-linked memory always stores `ownerId`, `entityType = "contact"`, and the exact local contact ID. Pending and approved records keep their existing provenance, history, embedding, edit, approval, and forget behavior.

The legacy `CustomerMemory` aggregate remains readable for compatibility but is not a second AI memory source. The contacts detail adapter can display it in a labeled legacy summary while new captures and edits use the canonical memory lifecycle. An idempotent migration can convert legacy entries only when it preserves provenance; it cannot auto-approve converted text without satisfying the AI memory policy.

### ERP customer mapping

CRM and ERP identities are linked through a separate record:

```ts
type CrmErpCustomerMapping = {
  id: string;
  ownerId: string;
  provider: "erpnext";
  connectionId: string;
  connectionRevision: number;
  externalSiteId: string;
  externalCompanyId: string;
  localContactId: string;
  externalCustomerId: string;
  externalCustomerLabel: string;
  status: "pending_parent_check" | "approved" | "revoked";
  parentLeaseId: string;
  version: number;
  approvedAt: string | null;
  approvedBy: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
```

Candidate matches are generated on demand from an owner-scoped ERP search and are not treated as mappings. A candidate includes display evidence such as ERP customer label and normalized contact details, but no candidate is persisted as approved until the user chooses it and confirms the mapping.

Mapping rules:

- A local contact has at most one active mapping per ERP provider, and that mapping is bound to one exact owner-scoped connection revision, ERP site, and verified ERP company.
- The same ERP customer may map to multiple local contacts because one company can have multiple people.
- The ERP target is a company/customer account even when the CRM source is a person. Orders, invoices, payments, and receivables are labeled as account-level data and must not be described as personal debt of the contact.
- Names, companies, emails, and phones may rank candidates but never authorize a link.
- Only `status === "approved"` mappings can be used by the AI context router or live financial panel.
- Changing or revoking a mapping requires the current `version` and an audit event.
- Cross-owner customer IDs and ERP connections fail closed. A customer ID from a different site or company also fails verification even when its text happens to match.
- If the bound connection, site, or company changes, the mapping becomes unusable until the user reviews and approves a new exact mapping.
- Toggling a connection capability such as `draft_write` does not change the connection identity revision and therefore does not invalidate the mapping.
- A revoked mapping is excluded immediately from new context and live reads.
- A live account-context read captures contact, mapping-version, and connection-identity preconditions before the remote ERP call, then revalidates all of them after the provider returns. If delete, revoke, mapping replacement, or connection identity change won the race, the fetched payload is discarded and never enters the response, cache, memory, or AI source manifest.

### Dashboard snapshot

The dashboard consumes a bounded server-built aggregate:

```ts
type CrmDashboardSnapshot = {
  asOf: string;
  metrics: {
    totalContacts: number;
    inProgressContacts: number;
    dueFollowUps: number;
    openTasks: number;
    todayMeetings: number;
    monthlySales: {
      value: number | null;
      currency: string | null;
      changePercent: number | null;
      connectionState: ErpConnectionState;
      requestState: "available" | "unavailable";
      stale: boolean;
    };
  };
  stages: Record<CustomerRelationshipStage, CrmDashboardContactCard[]>;
  todayFollowUps: CrmFollowUpItem[];
  recentActivity: CrmActivitySummary[];
  recentContacts: CrmContactSummary[];
  insight: CrmInsightSummary | null;
  warnings: string[];
};
```

The endpoint returns bounded lists and aggregate counts; it does not send every CRM record to the browser to calculate totals. Explicit zero is distinct from unavailable ERP data.

`openTasks` and `todayMeetings` are supporting aggregates for the existing Business Overview and are not additional CRM KPI cards. They use the same authenticated owner and owner-time-zone boundary as the CRM dashboard.

`CrmInsightSummary` contains `summary`, `suggestedAction`, bounded evidence records, `generatedAt`, and `sourceVersions`. Dashboard GET returns only a stored insight whose CRM source versions still match and whose age is no more than 24 hours. Dashboard-level insight uses CRM aggregates and the single overall ERP monthly-sales snapshot only; it never performs per-contact ERP reads. A selected contact can request one exact mapped ERP context separately. When no valid insight exists, `insight` is `null`, and the panel offers `AI에게 분석 요청`; it never manufactures a fallback claim during dashboard loading.

## Component Boundaries

- `components/CRM/CRMView.tsx`: two-screen orchestration, common CRM header, create-contact entry point.
- `components/CRM/CrmDashboard.tsx`: dashboard request and page composition.
- `components/CRM/dashboard/CrmMetricGrid.tsx`: four metric cards.
- `components/CRM/dashboard/CrmRelationshipBoard.tsx`: relationship stages and versioned moves.
- `components/CRM/dashboard/CrmCustomerInsight.tsx`: evidence-labeled AI insight.
- `components/CRM/dashboard/CrmTodayFollowUps.tsx`: due follow-ups.
- `components/CRM/dashboard/CrmRecentActivity.tsx`: real CRM activity.
- `components/CRM/CrmContacts.tsx`: contacts query, filters, pagination, and selected-contact state.
- `components/CRM/contacts/CrmContactList.tsx`: responsive table/cards.
- `components/CRM/contacts/CrmContactDetail.tsx`: profile, activity, memories, and ERP mapping.
- `components/CRM/contacts/CrmContactForm.tsx`: shared create/edit validation UI.
- `components/CRM/contacts/CrmErpCustomerMapping.tsx`: candidate search, approval, and revoke UI.
- `src/lib/crm/crm-dashboard.ts`: pure aggregate and normalization logic.
- `src/lib/crm/crm-mapping.repository.ts`: owner-scoped mapping persistence.
- `src/lib/crm/crm-mapping.service.ts`: candidate search, approval, conflict checks, and audit.

The obsolete `CrmPipelineBoard` and `PhoneContactImport` are removed from the CRM composition. Compatibility-only domain files are not deleted unless confirmed unused by the full test suite.

## API Boundaries

### Dashboard

`GET /api/crm/dashboard`

- Calls `requireOwnerContext` before reading data.
- Returns one bounded `CrmDashboardSnapshot`.
- Aggregates CRM sections independently from ERP monthly sales.
- If ERP fails, returns CRM data with an ERP warning and `monthlySales.requestState = "unavailable"`.
- Does not accept an `ownerId` query parameter.

### Contacts

`GET /api/crm/customers`

- Remains the compatibility route for contact records.
- Adds validated `query`, `page`, `limit`, `status`, `relationshipStage`, `importance`, `followUp`, `erpMapping`, and `sort` parameters.
- Returns `{ items, page, limit, total, hasMore }` for list requests.

`POST`, `PATCH`, and `DELETE /api/crm/customers`

- Preserve owner-scoped lifecycle behavior.
- Add the contact-edit allowlist and `relationshipStage`.
- Require a version for conflicting updates and deletes.
- Continue returning stable safe errors through the shared API response utilities.

The paginated response is the new default. `CRMView`, `BusinessHub`, and every internal caller are migrated in the same change; no shape is selected through an undocumented compatibility heuristic.

Allowed contact sorts are `updated_desc`, `created_desc`, `name_asc`, and `next_contact_asc`, with contact ID as the stable tie-breaker. Page size defaults to 25 and is capped at 100. All due/today boundaries use the authenticated owner's stored IANA time zone, falling back to UTC when absent, and the response reports the time zone used.

### Contact detail, activity, and memory

- `GET /api/crm/customers/:id`: returns one active owner-scoped contact, current version, bounded relationship summary, and section links.
- `GET /api/crm/customers/:id/activities?page=...&limit=...`: returns reverse-chronological activity pages; the limit defaults to 25 and is capped at 100.
- `POST /api/crm/customers/:id/activities`: creates one validated note, meeting, call, email-draft, or task activity and updates the contact version.
- `GET /api/crm/customers/:id/memories?status=...`: returns bounded canonical entity-linked memories plus a separately labeled legacy summary.
- Memory approval, edit, and forget continue through the existing memory lifecycle routes, which verify both owner and contact entity link.
- `POST /api/crm/insights`: creates or refreshes an evidence-backed insight for an exact contact or bounded dashboard cohort; it is never called implicitly for every dashboard GET.

### ERP mapping

- `GET /api/crm/customers/:id/erp-candidates?query=...&connectionId=...`: accepts 2–120 characters, times out after 8 seconds, returns at most 20 candidates, and exposes only external ID, label, company, email, and phone evidence from one exact owner-scoped ERP connection and site. Results are candidates only.
- `GET /api/crm/customers/:id/erp-mapping`: returns the active or most recent mapping state.
- `POST /api/crm/customers/:id/erp-mapping`: claims an active-parent child-write lease, calls the shared provider's exact `verifyCustomer` method for the submitted connection/site/company/external customer ID, stages a non-readable mapping, rechecks the parent lease, and then performs versioned compare-and-swap activation; it never approves from a cached or ranked candidate alone.
- `DELETE /api/crm/customers/:id/erp-mapping`: revokes the current mapping with its version.
- `GET /api/crm/customers/:id/erp-context`: returns bounded live customer financial context only for an approved mapping and only after the post-provider active-contact/mapping/version/connection revalidation fence succeeds.

Every route derives the owner from authentication, validates the local contact belongs to that owner, and accesses only that owner's ERP connection.

## Data Flow

1. Entering CRM loads only the selected screen.
2. Dashboard loads the aggregate snapshot and keeps the last successful data visible during refresh.
3. Contacts loads a separate paginated query; search and filters never alter the dashboard snapshot.
4. Selecting a contact loads its detail, timeline, linked memories, and mapping status in independently recoverable sections.
5. Opening ERP mapping searches the configured provider for candidates.
6. The user selects and explicitly confirms one exact ERP customer.
7. The server re-verifies the contact, exact provider connection, site, company, candidate identifier, and current mapping version before storing approval.
8. Only after approval can the contact detail request live orders, invoices, payments, and receivables for that exact ERP customer.
9. ERP values remain transient response data and are not copied into the CRM contact or memory collections.

## Loading, Empty, and Failure States

- Initial screen load uses fixed-size skeletons.
- Refresh retains the last successful screen data and shows an inline progress state.
- An empty CRM shows a useful create-contact action without placeholder customers.
- Empty relationship stages explain how contacts enter the stage.
- A contact detail failure does not destroy the loaded list.
- A memory-panel failure does not hide the contact profile or timeline.
- An ERP mapping or provider failure affects only ERP-related panels and shows retry or connection guidance.
- Disconnected ERP states never show fabricated revenue, orders, invoices, or receivables.
- A mapping conflict explains that the link changed and requires the user to reload before approving.
- Search cancellation and stale responses cannot replace a newer query result.

## Security and Privacy

- All dashboard, contact, activity, memory, and mapping access is owner-scoped on the server.
- Request-supplied `ownerId`, audit identity, and external connection credentials are ignored or rejected.
- ERP credentials never reach React props, browser storage, logs, mapping records, or AI source metadata.
- Search text is length-limited and encoded; repository queries do not interpolate raw expressions.
- Contact notes and activity summaries render as text, never upstream HTML.
- External ERP links are built from validated base URLs and allowlisted route identifiers.
- Mapping approval and revocation produce owner-scoped audit events with actor, timestamp, prior version, and exact identifiers.
- The CRM audit schema stores authenticated actor, entity type and ID, action, expected and resulting version, bounded before/after metadata, outcome, and timestamp. It never accepts the actor from the request body.
- Contact deletion and memory removal must prevent deleted information from entering future AI context.

## Accessibility and Responsive Behavior

- Tabs use correct tab semantics and support keyboard navigation.
- Relationship cards support a non-drag stage-change control.
- Tables retain headers, captions, focus order, and mobile equivalents.
- Status and trend information is not conveyed by color alone.
- Modals trap focus, restore focus on close, and expose clear destructive-action labels.
- Touch targets remain usable on small screens.
- The desktop layout follows the reference's dense operational hierarchy; tablet and mobile collapse to one or two columns without horizontal page overflow.

## Migration and Compatibility

- Existing `Customer` records remain valid.
- Missing `relationshipStage` is normalized deterministically on read.
- Existing activities, tasks, deals, and audit data remain stored even when their old top-level tabs are removed.
- The contacts route switches to the paginated contract only when all in-repository callers are updated atomically.
- Removal of `PhoneContactImport` includes updating device-pairing static assertions without removing unrelated device APIs used elsewhere.
- Existing owner-isolation and lifecycle behavior must remain intact.

## Testing

### Unit tests

- Relationship-stage normalization and valid transitions.
- Dashboard aggregate counts, follow-up due logic, ordering, and bounded lists.
- Search state is independent from dashboard totals.
- Explicit zero ERP sales differs from unavailable data.
- Mapping candidate ranking never produces an approved mapping.
- Mapping uniqueness, exact connection/site/company scope, version conflict, revoke behavior, and owner isolation.
- Contact edit validation and optimistic concurrency.

### Route tests

- Authentication is required for every new route.
- Owner comes only from authenticated context.
- Cross-owner contact, mapping, and ERP connection access fails closed.
- Dashboard survives partial ERP failure.
- Candidate search, approval, context read, and revoke use the exact external identifier.
- A revoke, contact delete, mapping replacement, or connection change racing an in-flight ERP context read causes the remote result to be discarded.
- Search pagination is stable and query limits are enforced.
- The authoritative tombstone hides all related records immediately, and idempotent cleanup completes or safely retries without resurrection.
- A delete racing with remote mapping verification or contact-linked memory creation never exposes a late child; staged rows remain unreadable and the durable cleanup job resumes after restart.
- A cleanup worker crash after claiming a job is recovered after lease expiry, and the stale worker cannot overwrite the reclaimed job outcome.

### UI contract tests

- The global sidebar source remains unchanged.
- CRM exposes exactly `dashboard` and `contacts` tabs.
- Tabs conditionally render distinct screens.
- The dashboard includes four real metric states, four relationship stages, insights, follow-ups, recent activity, and recent contacts.
- Contacts includes search, filters, pagination, detail, create, edit, delete, timeline, memories, and ERP mapping.
- Removed tab labels and `PhoneContactImport` do not render.
- No hard-coded customer, activity, sales, conversion, or financial values appear.
- Search does not change dashboard aggregate values.
- Mapping requires explicit confirmation before live ERP data is available.

### Regression verification

- Existing CRM owner lifecycle and audit tests continue to pass.
- Existing Business, AI Chat, memory, device, navigation, and authentication tests continue to pass.
- Focused CRM tests, full TypeScript checking, the complete test suite, and the production build run before completion.

## Acceptance Criteria

- The DREAMWISH global sidebar and top bar are unchanged.
- CRM has exactly two functional screens: `대시보드` and `연락처`.
- The dashboard matches the reference's information hierarchy while using real DREAMWISH data and design tokens.
- Contact search never changes dashboard totals.
- The relationship board uses an explicit stage and supports accessible, version-safe moves.
- Users can create, find, edit, inspect, and delete contacts and see real relationship history.
- `거래 · 활동 · 이메일 · 보고서 · 설정` and phone contact import are absent from CRM.
- ERP financial information appears only after a manual, explicit, owner-scoped mapping approval.
- CRM forecast values and live ERP actuals remain distinct.
- Missing or disconnected data is labeled honestly, and no customer or financial sample data is presented as real.
