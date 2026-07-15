# DREAMWISH Business Suite Delivery Design

## Status

Approved in conversation on 2026-07-15.

This document is the cross-project delivery contract for the already approved Automation, ERP, CRM, AI business-context, and Deep Research designs. It does not replace their detailed contracts. It fixes their dependency order, shared boundaries, current product scope, and release gates.

## Goal

Deliver a coherent, owner-scoped business workspace in which:

- Automation uses verified connections instead of showing a stale “연결 필요” state.
- Business contains a native ERP dashboard backed by an existing ERPNext connection.
- CRM contains two real screens, “대시보드” and “연락처”.
- AI Chat can safely read CRM and ERP facts and can perform allowlisted business work only after explicit approval.
- An explicit Deep Research flow can run for a selected time budget and present a source-rich report in the right panel.

The implementation must use real persisted or live provider data. It must never fill an unconnected or empty state with sample financial values.

## Authoritative Sub-Designs

The implementation is decomposed into five bounded sub-projects:

1. docs/superpowers/specs/2026-07-15-automation-connection-binding-design.md
2. docs/superpowers/specs/2026-07-15-business-erp-dashboard-design.md
3. docs/superpowers/specs/2026-07-15-crm-dashboard-contacts-design.md
4. docs/superpowers/specs/2026-07-15-ai-crm-erp-context-design.md
5. docs/superpowers/specs/2026-07-15-deep-research-worker-design.md

Each sub-project keeps its own data contracts, security rules, route contracts, and tests. This document is authoritative when an older document conflicts about product navigation, delivery order, installation helpers, or the immediate-save requirement.

## Selected Delivery Approach

The selected approach is dependency-ordered native implementation.

Alternatives were rejected:

- UI-first mock dashboards were rejected because they would show invented or duplicated state and require a second data integration pass.
- Embedding ERPNext or a separate CRM application was rejected because it would introduce a second sidebar, split authentication, and inconsistent data ownership.

Every stage must be production-complete and verified before the next stage depends on it.

## Delivery Order

### Stage 1: Automation connection binding

Implement the canonical verified connection candidate and scenario binding contract first.

This stage is complete only when:

- exactly one safe verified connection auto-binds an otherwise unbound compatible node;
- multiple verified connections require an explicit user choice;
- stale, revoked, mismatched, or cross-owner connections fail closed;
- scenario save and execution enforce the same binding rule; and
- the node stops showing “연결 필요” only after durable reconciliation succeeds.

### Stage 2: Native Business ERP dashboard

Build the ERP provider boundary, owner-scoped ERPNext connection, normalized dashboard API, and native DREAMWISH dashboard.

This stage depends on Stage 1’s connection identity and verification rules. It must not depend on CRM or AI.

### Stage 3: CRM dashboard and contacts

Replace the cosmetic legacy CRM with two functional screens and add manual, versioned CRM-to-ERP customer mapping.

CRM can consume the ERP provider boundary but the ERP layer must never import CRM.

### Stage 4: AI business context and actions

Add relevance-gated, owner-scoped CRM and ERP context to normal and streaming AI Chat. Add immediate safe memory capture and approval-gated allowlisted actions.

AI consumes CRM and ERP through bounded adapters. It must never read raw whole-store documents or guess a CRM-to-ERP mapping.

### Stage 5: Deep Research

Add the authenticated durable research job API, private worker, recovery scheduler, progress card, and right-side report experience.

Deep Research shares authentication, AI provider failover, safe web search primitives, and chat session ownership. It does not gain CRM or ERP access merely because the research question mentions a customer. Any business context used by a research job must be explicitly selected by the same relevance and owner policy defined for AI Chat.

## Product Information Architecture

### Global shell

- Preserve the current global DREAMWISH sidebar, top bar, authentication shell, and navigation behavior.
- Do not add an ERPNext sidebar inside Business.
- Do not replace the CRM entry with an external application.

### Business

Business contains:

1. 개요
2. ERP
3. 메일
4. 명함
5. 회의
6. 리포트

The legacy “영업·매출” screen, manual notification-text revenue import, mobile revenue candidates, Business-only device connection panel, and sales-specific rows in the Business report panel are removed from the UI. Existing legacy revenue records and APIs remain available for compatibility unless a separately approved migration removes them.

The Calendar “휴대폰으로 가져오기” button and modal are removed. The existing candidate backend remains untouched for compatibility unless separately removed.

The Business Overview removes the “회사” card and uses only real owner-scoped operational aggregates. Existing Mail, Business Card, Meeting, and Reports behavior remains functional.

### ERP

The ERP screen follows the approved reference hierarchy while using DREAMWISH components:

- connection state, last confirmed refresh, refresh action, and safe “ERPNext 열기” link;
- six verified financial and inventory metrics;
- sales trend and sales breakdown;
- recent ERP activity;
- top receivables and inventory value;
- safe ERPNext quick actions.

When no verified connection exists, the screen shows unavailable values and an “ERPNext 연결” action that navigates to the existing connection-management flow.

### CRM

CRM contains exactly two product screens:

1. 대시보드
2. 연락처

The legacy 거래, 활동, 이메일, 보고서, 설정, and phone-contact-import surfaces are removed from CRM navigation.

“Removed” is a presentation and navigation rule, not a destructive data migration. Dashboard and Contact detail may still contain bounded recent-activity and activity-entry sections, including an email-draft activity type. Compatibility-only legacy CRM, revenue, and phone-candidate records remain inaccessible from the removed screens until a separately approved migration deletes them.

The dashboard contains real CRM metrics, the four-stage relationship board, due follow-ups, recent activity, recent contacts, a source-labelled AI insight, and ERP monthly sales only when that value is verified.

The contacts screen contains server-side search, filters, stable sort, pagination, create, edit, soft delete, activity entry, contact-linked memory, follow-up management, and explicit ERP customer mapping.

### AI Chat

Normal chat remains the primary interaction surface. CRM and ERP retrieval is relevance-gated and represented in a safe source manifest.

An explicit “심층 조사” action opens a duration selector for 5, 15, or 30 minutes. The chat receives a resumable job card. The full report opens in the existing right-side workspace on desktop and a drawer on mobile.

## Data Ownership and Source Precedence

The authenticated owner is derived only from the server session. Request bodies and query strings cannot choose an owner.

Authoritative source order is:

1. current verified live ERP data for changing financial and inventory facts;
2. current versioned CRM records for contact and relationship facts;
3. current approved long-term memory for stable preferences, decisions, and relationship context;
4. recent conversation and versioned conversation summary for dialogue continuity;
5. owner-scoped knowledge and file excerpts;
6. external research sources for public facts.

An older memory cannot override current CRM state or a live ERP amount. CRM expected value is a forecast and cannot be described as booked revenue, an invoice, a payment, or a receivable.

## Immediate Durable Save

The user explicitly requires important information to be saved immediately.

The following mutations are synchronous durable operations:

- contact identity, company membership, relationship stage, operational status, importance, follow-up date, forecast amount, and currency;
- user-authored CRM activities;
- explicit CRM-to-ERP mapping approval or revocation;
- approved or policy-safe auto-approved long-term memories;
- approved AI action results;
- research job creation, cancellation request, checkpoints, and final report.

The server returns success only after the canonical durable write and audit event succeed. A client may show an in-progress state, but it must not display “저장됨” before the server confirms persistence. Failed optimistic UI changes roll back. Version conflicts return a stable conflict state and never silently overwrite a newer value.

Creating or reusing a company and changing a contact’s company membership occur under one owner-store lock and one idempotent operation ID. If the persistence backend cannot commit both records atomically, it uses a staged recoverable journal and does not report success until the journal reaches its committed terminal state.

In this section, an immediately durable “amount” means the user-authored CRM forecast fields `expectedValue` and `expectedValueCurrency`, or a verified action result. Live ERP sales, invoices, payments, receivables, payables, and inventory remain transient provider facts and are freshly queried; they are never copied into long-term memory or CRM forecast fields.

AI Chat may still return its answer if a memory write fails, but the response must report `저장 실패`. It cannot report `즉시 저장됨`, and no uncommitted memory may enter recall.

Derived indexes, embeddings, summaries, and cleanup may run asynchronously because they are reconstructable from the canonical record. They must not make a committed important record temporarily unreadable.

## ERP Connection Boundary

This delivery supports connecting an ERPNext instance that already exists.

Included:

- owner-scoped ERPNext base URL, site/company identity, API credentials, verification, reconnect, refresh, and disconnect;
- server-only encrypted credential handling;
- normalized read-only dashboard and mapped-customer data;
- separately approved, disabled-by-default draft-write capability for the exact actions listed in the AI business-context design.

Excluded:

- Docker installation buttons;
- ERPNext, Dolibarr, Frappe CRM, or Twenty installation automation;
- local shell execution from the hosted web application;
- automatic Docker Desktop installation;
- an Ollama installation button;
- running Ollama on Railway;
- a trusted local gateway, phone developer-mode bridge, or hosted access to a user’s localhost;
- sample ERP data.

The disconnected action is labelled “ERPNext 연결”, not “설치 및 연결”. It routes to connection management and may link to official ERPNext documentation as secondary help, but it must not claim that DREAMWISH installs ERPNext.

The canonical secret authority is the one verified same-owner ERPNext credential in Connection Management. The ERP connection identity record references that credential and owns endpoint/site/company identity, connection revision, capabilities, and recovery state without duplicating secrets. Automation’s connection API exposes a safe projection of the same credential for compatible scenario nodes. Business, CRM, and AI consume the exact identity through the ERP adapter; they never create another credential authority.

A deliberate disconnect or identity change clears the prior ERP snapshot. The disconnected projection contains null metrics, comparisons, company, period, currency, and as-of time; empty chart and list arrays; and no ERP links. Only a temporary fetch failure may show the last verified snapshot, labelled stale with its original as-of time.

## Cross-System Data Flow

1. Connection Management verifies and stores an exact owner-scoped connection.
2. Automation reconciles compatible unbound nodes through versioned compare-and-swap.
3. The ERP provider resolves the exact active connection and returns normalized, bounded data.
4. Business renders only the normalized ERP snapshot.
5. CRM stores its own canonical contacts and explicit approved mappings.
6. A mapped CRM contact may request a bounded live ERP customer context through the shared ERP provider.
7. AI Chat first selects the minimum required source modes, then resolves owner, session, contact, mapping, and live ERP state.
8. A proposed mutation captures exact versions and permissions, displays a safe preview, and executes only after a valid one-time user approval.
9. Deep Research creates a durable background job and returns immediately; a private worker checkpoints research and stores a structured report for the same owner and chat session.

## Failure and Recovery

- No ERP connection: show “ERPNext 연결” and unavailable values; never show zero unless ERPNext returned a verified zero.
- Stale ERP snapshot: keep the last successful snapshot, show its as-of time and a stale warning, and offer retry.
- Partial ERP failure: render confirmed sections, mark unavailable sections, and label the snapshot degraded.
- CRM write failure: roll back the optimistic presentation and retain the prior canonical value.
- CRM version conflict: return 409 and require refresh or explicit conflict resolution.
- Mapping unavailable or stale: omit live customer financial context and ask for manual mapping review.
- AI ambiguity: ask the user to choose the intended contact; do not guess.
- AI action precondition change: invalidate the proposal and generate a fresh preview.
- Research provider or source failure: continue within the approved budget where safe, record the warning, and produce a partial report only when supported evidence exists.
- Research worker interruption: recover an expired lease from its checkpoint, with fenced writes and at most three recovery attempts.

## Security and Privacy

- Every repository, API, worker claim, report, source manifest, CRM mapping, and AI proposal is owner-scoped.
- ERP credentials and approval tokens never enter browser-visible payloads, chat text, report text, or logs.
- Remote ERP and research fetching uses public-address HTTPS validation, DNS and redirect checks, bounded response sizes, timeouts, and abort propagation.
- Retrieved CRM, ERP, documents, web pages, and research text are untrusted data, never instructions.
- Logs use identifiers, phases, durations, and stable error codes rather than raw questions, secrets, note bodies, customer records, or fetched page bodies.
- Deletion and mapping revocation fail closed immediately even while cleanup jobs are pending.

## Testing and Release Gates

Each stage starts with a failing contract test and ends with:

- focused unit and route tests;
- owner-isolation, version-conflict, stale-state, and failure-path tests;
- accessible responsive UI tests;
- relevant regression tests; and
- full test, typecheck, lint, and production build.

The full-suite test runner behavior must be respected: filename-looking arguments do not replace a final full-suite run.

Before deployment:

- confirm unrelated working-tree files are not staged;
- inspect the exact diff and staged diff;
- use one focused commit per coherent stage;
- deploy dependency stages in order;
- verify database variables and provider variables are shared only with services that need them;
- verify the Deep Research worker has no public domain; and
- run a real authenticated five-minute research smoke test after the web, worker, and scheduler deploy successfully.

## Acceptance Criteria

The program is complete only when all of the following are true:

- Automation no longer shows a false “연결 필요” state after safe durable binding.
- Business shows the native ERP tab and no longer shows the legacy Sales surface.
- Calendar no longer shows phone import.
- The Business Overview no longer shows the Company card.
- ERP disconnected, empty, stale, partial, and connected states are honest and tested.
- Connected ERP users see normalized real ERPNext data and safe record links.
- CRM exposes only Dashboard and Contacts and all required operations are functional.
- CRM important information persists immediately and survives refresh.
- CRM-to-ERP mappings are manual, owner-scoped, versioned, revocable, and revalidated around live reads.
- AI Chat answers bounded CRM and ERP questions with source and freshness metadata.
- AI mutations require an exact approval and remain idempotent and auditable.
- Deep Research runs as a durable background job, resumes after refresh or worker restart, and produces an evidence-labelled right-panel report.
- The web, deep-research, and scheduler-cron Railway services build and run successfully.
- No unrelated user change is modified, staged, or committed.
