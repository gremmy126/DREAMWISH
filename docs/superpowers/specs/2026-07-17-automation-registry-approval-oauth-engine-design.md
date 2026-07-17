# Automation Registry, Approval, Queue, and OAuth Engine Design

## 1. Purpose

This design replaces the current shared-action automation catalog and partial execution simulation with a truthful, versioned automation engine. Every selectable action has its own inputs, validation, preview, risk policy, scopes, output contract, and real server adapter. Draft, test, manual, scheduled, webhook, and live executions all use one server pipeline.

The engine preserves the existing scenario canvas, owner authentication, verified connection UI, encryption helpers, outbound Gmail, Slack, GitHub, Notion, Discord, and webhook operations, scheduling calculations, graph traversal, mapping, filter, router, delay, iterator, run history, and audit concepts where they are already correct. Duplicate registries, label-based operation dispatch, generic action fallbacks, mock successes, JSON-file OAuth storage, and single-step approval branches are removed.

## 2. Current-State Findings

The current repository has useful foundations but does not meet the requested contract:

- `app-registry.ts` defines 29 apps and credential metadata, while `action-registry.ts` gives most apps the same eight generic actions.
- Action values are human-readable labels rather than stable, versioned action IDs.
- `ActionPicker` lists actions but the node inspector has no action-specific dynamic form, validation, or preview.
- `ScenarioNode.config` is an untyped flat value map and `validateScenario` checks only trigger, connectivity, and credentials.
- The graph engine simulates most internal steps as successful and routes external writes to one `approval_required` state.
- Approved execution is implemented only for selected Gmail, Slack, GitHub, Notion, Discord, and webhook operations.
- Runs and OAuth records are stored in local JSON files, which cannot provide durable queue leasing, multi-worker exclusion, deployment persistence, or atomic approval transitions.
- OAuth state, PKCE, code exchange, token encryption, and account verification exist for Google, Slack, GitHub, Notion, and Discord and should be retained, but token/session persistence and connection lifecycle must move to PostgreSQL.

## 3. Scope and Delivery Boundaries

The final program includes:

1. A shared declarative Action Registry and versioned server adapter registry.
2. Action-specific forms, validation, previews, scopes, risk, and outputs.
3. A PostgreSQL workflow model, queue, worker, execution history, approvals, notification outbox/inbox, DLQ, event log, and append-only audit log.
4. Mixed approval policy with mandatory two-stage approval for high and critical actions.
5. Durable, multi-account OAuth connections with refresh, reauthorization, user-only soft disconnect, and restart/deployment persistence.
6. Real provider and internal-tool adapters. An action is never executable or shown as available unless its exact adapter version exists.
7. Approval Center, detailed run history, connection management, and administrator DLQ surfaces.

This design does not embed n8n or Make, does not treat a provider logo as execution support, does not store secrets in workflow input or approval snapshots, and does not run user JavaScript in the web server process. Code actions require the isolated code-worker adapter defined below.

## 4. Architectural Principles

- The Action Registry is the single source of truth for both UI and runtime contracts.
- Registry definitions are serializable and shared by client and server. Server functions live only in the adapter registry.
- All execution modes use the same validation, authorization, idempotency, rate-limit, preview, approval, masking, execution, and audit pipeline.
- Action, adapter, and output schema versions are pinned per execution.
- PostgreSQL is authoritative for workflows, connections, queue jobs, approvals, notifications, runs, events, and audits.
- Queue, approval, notification, and adapter boundaries use interfaces so a later Redis, BullMQ, Kafka, or RabbitMQ implementation does not change workflow semantics.
- State is changed only through an explicit transition table and compare-and-set database updates.
- A lease fencing token prevents a worker that lost its lease from writing a late result.
- Unsupported work is disabled and labelled `준비 중`; it never returns a fake success.

## 5. Shared Action Registry

### 5.1 Shared types

`ActionDefinition` is serializable and contains:

- `id`, `version`, `appId`, `name`, `description`, and `kind`;
- `inputSchema`, `outputSchema`, and `outputSchemaVersion`;
- declarative `validation` rules and `defaultValues`;
- `requiredScopes` and supported authentication modes;
- base `riskLevel` and declarative risk escalation rules;
- `approvalEffect` describing read, external write, destructive write, financial write, permission change, public publish, deployment, or bulk operation;
- `previewDefinition` describing target, before/after values, count, cost, reversibility, failure impact, and safe presentation fields;
- `adapterKey`, `adapterVersion`, `confirmationPhrase`, and optional additional-auth policy;
- `availability` and a non-secret readiness reason.

`InputSchema` supports text, textarea, email, URL, number, integer, boolean, select, multiselect, date, datetime, timezone, JSON, key/value collection, array, resource selector, connection selector, file reference, and mappable expression fields. Conditional visibility is declarative and may reference only other fields in the same action. Advanced fields are collapsed by default.

Client and server import the same definitions and the same schema interpreter. The client uses them for form rendering and immediate feedback; the server repeats validation and is authoritative. React render functions and adapter functions are not placed in the shared manifest.

### 5.2 Server adapter registry

The server-only registry resolves `adapterKey@adapterVersion` to an `ActionAdapter` with these operations:

- `validateConnection(context)`;
- `resolveTarget(context, input)`;
- `buildPreview(context, input, target)` when provider data is needed;
- `execute(context, input, idempotencyKey, abortSignal)`;
- `normalizeOutput(providerResult)`.

Every adapter receives a server-resolved connection, an idempotency key, a deadline-bound abort signal, the pinned action contract, and an execution fencing token. It cannot bypass the common pipeline.

### 5.3 Stable identifiers and versioning

App IDs are permanent even if display names change. Action IDs are stable kebab-case identifiers, never labels. Any input, output, risk, scope, preview, or execution semantic change increments the Action version. Adapter behavior changes increment the Adapter version. A queued step stores the normalized ActionDefinition snapshot and exact versions. Versioned adapters remain registered while a retained execution or retry can reference them; if an adapter binary is unavailable, the step enters a permanent `adapter_version_unavailable` failure rather than using a newer implementation silently.

## 6. Required Action Catalog

The registry covers the requested actions. Each label below maps to a stable action ID and its own schema. Provider-specific actions are enabled only after their real adapter and credential/scopes contract are present.

- Gmail: new email trigger, send, reply, forward, draft, permanent delete, mark read, mark unread, archive, add label, remove label, download attachment, save attachment, search.
- Notion: create/update/query database item, create/update/get page, append/update block, create comment, search page.
- Google Sheets: add/update/delete/get row, create/get sheet.
- Slack: channel message, direct message, thread reply, add reaction, create channel, get user.
- Google Calendar: create/update/delete/get event.
- Discord: channel message, direct message, add/remove role, create channel, create thread.
- Telegram: send message, photo, document, or file.
- GitHub: create/update/comment issue, create/comment pull request, create/delete branch, create/update/delete file, dispatch workflow, create release.
- Google Drive: upload/download/move/share/search file and create folder.
- DREAMWISH CRM: create/update/search contact, create/update deal, create activity, create memo, send email. Bulk destructive CRM actions are registered only with high-risk adapters.
- YouTube: upload/update video, change thumbnail, add to playlist.
- Outlook: send/reply email and create event.
- Microsoft Teams: channel message, chat message, create meeting.
- OneDrive: upload/download/move/share file.
- Dropbox: upload/download/share file.
- Airtable: create/update/delete/get record.
- Trello: create/move card and add comment.
- Asana: create/complete/assign task.
- Jira: create/update/comment issue.
- Linear: create issue, change status, add comment.
- HubSpot: create contact, deal, or company.
- Salesforce: create lead, opportunity, or account.
- Stripe: create payment, create customer, refund, cancel payment, create/cancel subscription.
- Shopify: create/update product, create/cancel order, update inventory, refund order.
- WordPress: create/update post, create page, create comment.
- Facebook: publish post and comment.
- Instagram: publish post, reel, or story.
- X: publish post or reply.
- LinkedIn: publish personal or organization post.
- OpenAI: chat, summarize, translate, generate JSON, analyze email/document, extract keywords, analyze sentiment, draft reply.
- AI analysis: analyze email/document, summarize, sentiment, keyword extraction, JSON generation, reply draft, OCR, and image description.
- Schedule: once, every minute, hourly, daily, weekly, monthly, and cron.
- Webhook: receive and send.
- HTTP: GET, POST, PUT, PATCH, and DELETE.
- Router: parallel, conditional, and default branch.
- Filter: no Action picker; only grouped AND/OR conditions, value paths, operators, and comparison values.
- Code: JavaScript and TypeScript in an isolated, resource-limited code worker.
- Delay: seconds, minutes, hours, or until date.
- Iterator: array or numeric repeat with concurrency and limit.
- Text Formatter: uppercase, lowercase, replace, trim, split, join, substring.
- Date/Time: current time, format, add/subtract time, difference.
- Math: add, subtract, multiply, divide, average, maximum, minimum.
- JSON: parse, stringify, merge, validate.
- CSV: read and create.
- Array Aggregator: merge, group, sum, average.
- Text Aggregator: concatenate, render Markdown, join lines.
- Variables: create, update, get, delete.
- Data Store: create, get, update, delete.
- Error Handler: retry, ignore, alternate path, notify administrator, stop workflow.

## 7. Dynamic Form, Validation, and Preview UI

Selecting an app shows only that app's real triggers and actions. Selecting an action discards fields not present in its schema, applies its defaults, and renders only its schema. If the user changes an action after entering data, the UI warns before discarding incompatible fields.

The inspector order is connection, action, required fields, optional fields, advanced fields, output mapping, preview, and execution policy. Mappable fields accept literal values or safe `{{trigger.*}}`, `{{steps.<nodeId>.*}}`, and iterator expressions. Resource selectors may call bounded, owner-scoped server option endpoints and never receive tokens.

Validation appears inline and in an activation summary. Server validation covers schema, cross-field rules, permission, scopes, connection state, adapter version, graph cycles, mapping paths, and policy. Filter has no action selector. A false filter is recorded as `skipped`, never `failed`.

Preview is always generated, including for automatically executed actions. High-risk previews show target app/account, target resource, before and after values, estimated count, amount/cost, reversibility, failure impact, scheduled time, workflow and execution IDs, risk, and approval expiry. Secrets, access tokens, refresh tokens, API keys, cookies, authorization headers, and passwords are removed through the common masking service.

## 8. Risk and Approval Policy

### 8.1 Risk levels

- `read`: no external mutation.
- `low`: low-impact create/update.
- `medium`: message send, event creation, or CRM mutation.
- `high`: destructive, refund, deployment, permission, public publish, or bulk operation.
- `critical`: money, production outage, large deletion, administrator permission, or policy-defined material impact.

Base risk lives in the Action definition. Declarative escalation raises risk for count, amount, public visibility, production targets, permanent deletion, permission elevation, or irreversible changes; runtime never lowers the base risk.

The following are at least high by default: bulk email, permanent email/file/folder deletion, bulk CRM contact/deal deletion, Stripe refund/payment cancellation/subscription cancellation, Shopify order cancellation/refund, GitHub release deployment/branch deletion/file deletion/production workflow dispatch, public social publishing, bulk social deletion, external-user invitation, permission changes, administrator grants, bulk updates or migrations, irreversible external mutations, monetary operations, and production-service operations. Policy may escalate these to critical based on amount, count, target environment, privilege, and reversibility.

The default workflow policy is `high_risk_two_stage`. Available policies are approve all external changes, approve test/manual external changes, approve medium and above, high-risk two-stage only, and automatic. No policy may bypass high or critical approval. Medium behavior follows workflow policy.

### 8.2 Execution-mode behavior

- Draft, test, and manual runs require preview and approval before an external mutation.
- Active live workflows automatically execute read, low, and policy-allowed medium steps.
- High and critical steps always pause before the adapter is called.
- Low and medium external mutations in draft, test, and manual runs enter `waiting_final_approval` directly for a single preview approval unless workflow policy requires the warning stage.
- Critical additional authentication is completed inside `waiting_final_approval`; the request cannot enter `approved` until the configured password recheck, email code, OTP, administrator approval, approval link, or Slack approval succeeds.

### 8.3 Two-stage approval

The mandatory successful path is:

`waiting_warning -> waiting_final_approval -> approved -> queued -> running -> completed`.

The first warning shows the requested action, app, account, target, count, reversibility, expected result, failure impact, scheduled time, workflow, execution, risk, and expiry. `계속 진행` changes only to `waiting_final_approval`. It never enqueues or calls an adapter.

The final view repeats the final command, account, resource, before/after values, count, cost, reversibility, risk, and expiry. Its actions are final approve and execute, cancel, edit input, and approve later. Approve later keeps the durable `waiting_final_approval` state. Edit input rejects the current request as superseded, creates a new preview, snapshot, hash, and approval request, and restarts at `waiting_warning`.

Confirmation phrases come from `ActionDefinition.confirmationPhrase`; required defaults include `DELETE`, `REFUND`, `DEPLOY`, and `SEND`. The final button stays disabled until the exact phrase and any critical authentication requirement pass. Expired approvals end as `expired` and never auto-execute. User rejection ends as `rejected`.

### 8.4 Approval snapshot and hash

The `approvalSnapshot` stores exact `workflowId`, `workflowVersion`, `nodeId`, `actionId`, `actionVersion`, `adapterVersion`, `integrationConnectionId`, `inputHash`, `outputSchemaVersion`, `riskLevel`, `approvalPolicy`, and `approvalExpiresAt` fields, plus safe normalized input, target identity, resource identity/version, count, amount, permissions, and scheduled execution slot. It never stores credential secrets.

Canonicalization recursively sorts keys, normalizes numbers and ISO timestamps, rejects non-finite values, and hashes a domain-separated UTF-8 representation with SHA-256. The worker reconstructs the actual execution input, target, connection, count, amount, permission, workflow version, and scheduled slot immediately before execution. A mismatch returns the exact user-facing error `승인된 내용과 실제 실행 내용이 변경되었습니다. 다시 승인해 주세요.` and creates no provider request.

## 9. PostgreSQL Data Model

### 9.1 Workflow tables

- `automation_workflows`: owner, name, status, current/active version, approval policy, expiry minutes, notification channels, medium policy, critical auth policy, timestamps.
- `automation_workflow_versions`: immutable normalized workflow snapshot and content hash.
- `automation_nodes`: workflow version, node, app, action ID/version, adapter key/version, connection ID, non-secret input JSON, retry/timeout policy, position.
- `automation_edges`: version, source/target handles, condition, ordering.
- `automation_action_snapshots`: action ID/version, adapter version, output schema version, normalized declarative definition and hash.

### 9.2 Execution tables

- `automation_executions`: owner, workflow/version, parent execution ID, resumed step ID, execution mode (`test`, `live`, `manual`), trigger type/event ID, idempotency key, status, timestamps, error.
- `automation_step_runs`: execution/node/action versions, connection ID, status, attempt, retry count, duration milliseconds, provider API request ID, remaining rate limit, adapter latency, masked input/output, preview data, error, fencing token, timestamps.
- `automation_execution_events`: append-only event ID, execution/step, prior/new state, event type, actor, safe metadata, timestamp.

### 9.3 Approval tables

- `automation_approval_requests`: owner, execution/step, snapshot JSON/hash, input hash, risk, policy, state, warning/final/expiry timestamps, confirmation phrase hash, critical auth method/result, superseded request ID, actors, channels, result.
- `automation_approval_events`: append-only warning, continue, final approval, rejection, expiry, supersede, hash mismatch, authentication, and execution events.

### 9.4 Queue and notification tables

- `automation_queue_jobs`: queue name, job type, owner/execution/step, priority, next run time, status, attempt limits, idempotency key, locked until, worker ID, fencing token, safe payload, dead-letter reason, timestamps.
- `automation_queue_events`: append-only enqueue, claim, heartbeat, release, retry, complete, dead-letter, and requeue history.
- `automation_notification_outbox`: owner, approval/event, channel, dedupe key, safe payload, attempts, next attempt, sent/error timestamps. Channels are in-app, email, Slack, browser notification, and mobile push and may be selected together.
- `automation_notification_inbox`: channel/provider receipt ID, dedupe key, received/processed timestamps and result. Unique dedupe constraints prevent repeated send or handling.

### 9.5 OAuth and audit tables

- `integration_connections`: owner/user, stable app ID, provider, provider account/workspace identity, account display data, encrypted tokens, token key version, expiry, granted scopes, status, connected/refreshed/validated/disconnected/revoked timestamps, disconnect actor/reason/result, created/updated timestamps.
- `oauth_authorization_sessions`: owner, provider/app, hashed state, encrypted PKCE verifier, requested scopes, redirect/return target, expiry, one-time completion.
- `integration_connection_events`: append-only connect, refresh, validate, scope, reconnect, disconnect, revoke, and error history.
- `automation_audit_events`: append-only user/approver, workflow/execution/step/action, risk, approval times, hashes, channels, approval and execution results, safe connection identity, timestamp.

Foreign keys preserve ownership and history. Connection rows use soft disconnect. Partial unique indexes prevent duplicate active account/workspace connections while allowing historical disconnected rows. Audit and event tables reject application UPDATE/DELETE and are written through restricted database roles or database triggers.

## 10. Explicit Transition Tables

Execution transitions are data-defined and tested. Key transitions are:

- `queued + JOB_CLAIMED -> running`;
- `running + HIGH_RISK_DETECTED -> waiting_warning`;
- `waiting_warning + WARNING_CONTINUED -> waiting_final_approval`;
- `waiting_warning + REJECTED -> rejected`;
- `waiting_warning + EXPIRED -> expired`;
- `waiting_final_approval + FINAL_APPROVED_AND_AUTHENTICATED -> approved`;
- `waiting_final_approval + INPUT_EDITED -> rejected` plus a new request;
- `waiting_final_approval + REJECTED -> rejected`;
- `waiting_final_approval + EXPIRED -> expired`;
- `approved + RESUME_ENQUEUED -> queued`;
- `running + ADAPTER_SUCCEEDED -> completed`;
- `running + RETRY_SCHEDULED -> retry_wait`;
- `running + CONNECTION_REQUIRED -> waiting_connection`;
- `running + PERMANENT_FAILURE -> failed`.

Every transition specifies allowed actors, preconditions, side effects, emitted events, and resulting queue work. Conditional `UPDATE ... WHERE state = expected` prevents races. A transition not present in the table is rejected.

## 11. Queue and Worker

`AutomationQueueAdapter` exposes enqueue, claim, heartbeat, complete, retry, reject, dead-letter, and requeue operations. The PostgreSQL implementation is the default; other transports implement the same semantics.

PostgreSQL claim uses a transaction with `FOR UPDATE SKIP LOCKED`, priority descending, next-run ascending, an expired-or-empty lease condition, and an incremented fencing token. Workers heartbeat before `lockedUntil`, stop work after lease loss, and include the fencing token in all step result writes. Completion uses compare-and-set on job ID, worker ID, and fencing token.

Each provider request receives a stable adapter idempotency key derived from execution, step, attempt policy, action version, and target. It is passed to providers that support idempotency and reserved internally for those that do not. Retry obeys provider `Retry-After`, exponential backoff with jitter, maximum attempts, and action deadlines. Validation, credential, scope, stale approval, revoked connection, and permanent provider failures do not retry. Exhausted jobs enter DLQ with masked context. Administrator requeue creates a new job and audit event without mutating the historical failed job.

Worker processes never sleep for approvals or long delays. They persist the wait and release the lease. Scheduled polling, approval expiry, token refresh, outbox delivery, delayed resume, and DLQ maintenance are separate queue job types.

## 12. Persistent OAuth Connections

### 12.1 Providers and flow

The current Google, Slack, GitHub, Notion, and Discord authorization URL, state, PKCE, exchange, and profile verification code is reused behind a provider adapter. Microsoft and Dropbox OAuth adapters are added for Outlook, Teams, OneDrive, and Dropbox. Other apps keep their accurate token/API-key connection type unless their provider OAuth adapter is implemented.

The canonical flow is authenticated start, cryptographic state, PKCE verifier/challenge where supported, durable authorization session, provider consent, callback state/owner/provider validation, one-time code exchange, profile/workspace verification, encrypted token persistence, connection event, and UI redirect. No connection success is derived from localStorage or an environment token.

Canonical APIs are:

- `POST /api/integrations/:appId/oauth/start`;
- `GET /api/integrations/:appId/oauth/callback`;
- `GET /api/integrations/connections`;
- `GET /api/integrations/connections/:connectionId`;
- `POST /api/integrations/connections/:connectionId/test`;
- `POST /api/integrations/connections/:connectionId/refresh`;
- `POST /api/integrations/connections/:connectionId/reauthorize`;
- `POST /api/integrations/connections/:connectionId/disconnect`.

Existing connect/callback routes remain compatibility redirects until callers migrate.

### 12.2 Lifecycle and statuses

Statuses are not-connected, connecting, connected, token-expired, refresh-failed, insufficient-scope, reconnect-required, provider-unavailable, validation-failed, disconnected, and configuration-required. A transient provider error, rate limit, action failure, one failed refresh, restart, deployment, migration, or registry change never deletes or disconnects a connection.

The token service refreshes before expiry under a per-connection database lease. A successful refresh atomically replaces the access token, replaces the refresh token only if the provider returns one, updates expiry/refreshed time, and preserves connection ID. A failed refresh records an event, retains encrypted data, sets a recoverable status, sends a deduplicated reconnect notification, and moves dependent runs to `waiting_connection`. Scope failure similarly preserves the connection, shows required versus granted scopes, and offers reauthorization. Reauthorization retains the connection ID when provider account/workspace identity matches.

Multiple accounts are supported. Every node stores an explicit connection ID; the engine never selects a different account automatically. Account and workspace identity are visible in the inspector and approval preview, but tokens are not.

### 12.3 User-only disconnect

Disconnect requires the authenticated owner, CSRF validation, optional reauthentication policy, and an explicit confirmation containing app, account/workspace, active workflow count/list, affected triggers/actions, history retention, and reconnect behavior. Another user's connection ID always returns not found or forbidden without revealing metadata.

After confirmation, the server attempts provider revoke, marks the connection disconnected, cryptographically destroys or nulls active token ciphertext, unsubscribes triggers, marks dependent nodes with a connection error, and writes connection and audit events. Provider revoke failure does not override the user's request; internal tokens are still destroyed and the failure result is recorded. Rows are soft-deleted with disconnect actor, reason, timestamps, revoke time, and revoke result. Only explicit user disconnect, explicitly approved AI-chat disconnect, or final account deletion may perform this transition.

### 12.4 Deployment and migration safety

Connections live only in PostgreSQL and survive commit, push, Railway deployment, web/worker restart, and registry updates. Migrations are additive, preserve IDs and encrypted tokens, and provide rollback or backup instructions. Production seed and worker startup never modify user connection rows. The existing owner-scoped JSON token records are imported once through an idempotent migration marker; valid owner rows preserve provider/account identity, and ambiguous unowned rows remain quarantined rather than assigned. The legacy file is not deleted by migration.

Missing provider environment variables produce a typed configuration response listing missing variable names; the UI displays `설정 필요` rather than a generic 500.

## 13. Common Execution Pipeline

All modes execute these stages:

1. Load immutable workflow and ActionDefinition versions.
2. Validate graph, action schema, mappings, and activation policy.
3. Resolve the owner-scoped explicit connection ID.
4. Refresh a refreshable token and verify credential status, scopes, and permissions.
5. Reserve idempotency and check rate-limit state.
6. Resolve safe input mapping and target preconditions.
7. Build and persist a masked preview.
8. Evaluate mode, approval policy, base risk, and escalations.
9. Persist approval wait or call the exact pinned adapter.
10. Normalize output, mask sensitive data, store step/run/event/audit results, and enqueue downstream work.

No adapter is called before stage 9. High and critical adapters are not called until the final hash/authentication check succeeds and the approved resume job is claimed.

## 14. UI Surfaces

### 14.1 Scenario editor

The current three-column canvas remains. The inspector gains explicit connection selection, action-specific dynamic forms, inline validation, scopes, credential status, rate-limit status, risk badge, preview, and output mapping. Filter keeps only its condition builder. Adapter-unavailable actions are hidden by default and may be revealed as disabled `준비 중` entries.

Activation runs full workflow validation for disconnected nodes, missing values, insufficient scopes, credential errors, unavailable adapters, invalid mappings, cycles, unsafe HTTP targets, and approval-policy configuration. It shows the required policy notice and cannot activate on errors.

### 14.2 Approval Center

The center has warning, final approval, later, expired, rejected, and completed lists. Warning and final screens contain all required safe preview fields, scopes, credential/rate-limit state, exact confirmation phrase, expiry countdown, additional-auth step, and the requested buttons. Opening or closing a browser does not change state.

### 14.3 Connection management

OAuth cards provide connect, add another account, reconnect, test, reauthorize, and disconnect. Each connection shows logo, account, email, workspace, status, connected/validated/expiry times, and scopes. Disconnect confirmation shows affected workflows and preserves execution history.

### 14.4 Run history and DLQ

Run detail exposes each step's masked input/output, preview, retry count, provider request ID, rate-limit remaining, adapter latency, state events, approval events, and safe errors. The administrator DLQ view exposes masked payload, reason, attempts, adapter/action versions, and requeue eligibility. Audit views are chronological and read-only.

## 15. Error, Security, and Retry Policy

Typed errors are validation, credential, insufficient-scope, connection-required, rate-limit, retryable-provider, permanent-provider, stale-approval, lease-lost, adapter-version-unavailable, duplicate-execution, and unsafe-request. Authentication, scope, validation, approval mismatch, revoked/disconnected connection, and permanent provider errors do not retry. Temporary network, 429, and selected 5xx errors retry within action limits.

Secret masking is centralized and applies to previews, runs, queue payloads, DLQ, notifications, HTTP logs, and audits. Tokens use authenticated server-side encryption with key versioning. Client secrets stay in environment configuration. Custom HTTP actions block loopback, private/link-local/metadata destinations, unsafe redirects, DNS rebinding, and dangerous header overrides. Code actions execute only in a separate sandbox worker with CPU, memory, time, network, and filesystem restrictions.

## 16. Migration and Compatibility

Existing scenario labels are migrated to stable action IDs only when the mapping is unambiguous. Unmapped nodes remain saved but enter `needs_configuration` and cannot activate. Existing correct graph edges, schedule configuration, mapping syntax, webhook IDs, encrypted structured credentials, OAuth provider functions, and provider outbound services are wrapped rather than duplicated.

New normalized PostgreSQL tables become authoritative before JSON writers are disabled. Migration uses a version marker, owner validation, counts/hashes, backups, and idempotent re-entry. It never truncates integration connections or seeds over user data. Read compatibility remains during the migration window; write cutover is atomic per store.

## 17. Test Strategy

### 17.1 Registry and UI contracts

- Unique app/action IDs and monotonic versions.
- Every executable Action has an exact adapter version, schemas, validation, preview, scopes, and risk.
- Dynamic forms show only selected-action fields and remove incompatible stale fields.
- Filter has no action selector and false is skipped.
- Unsupported adapters are disabled and execution-blocked.
- Activation detects all requested graph, input, scope, credential, adapter, and cycle errors.

### 17.2 Approval and execution

- Draft/test/manual external changes pause; active safe work auto-executes.
- High/critical follow the exact two-stage transition chain.
- Continue never queues or calls an adapter.
- Edit input supersedes and recreates snapshot/hash/request.
- Later approval and restart preserve state.
- Expiry/rejection never executes.
- Confirmation phrase and critical authentication gates work.
- Snapshot/actual mismatch blocks before provider I/O.
- Secret masking covers every persistence and UI surface.

### 17.3 Queue and worker

- Competing workers claim once with `SKIP LOCKED`.
- Heartbeat, lease loss, fencing, crash recovery, priority, retry, delayed run, and DLQ behave deterministically.
- Idempotency is passed to supporting providers and enforced internally elsewhere.
- Queue, web server, and worker restarts preserve jobs and waits.
- Outbox/inbox dedupe prevents repeated multi-channel notifications.

### 17.4 OAuth

- Connect, refresh, test, reauthorize, multi-account selection, and user-only disconnect.
- Refresh preserves ID and old refresh token when no replacement is returned.
- Refresh/scope/provider failures retain the row and use recoverable statuses.
- Reauthorization updates scopes without breaking node bindings.
- Another owner cannot inspect, use, refresh, or disconnect a connection.
- Disconnect soft-deletes, destroys tokens, handles provider revoke failure, unsubscribes triggers, and audits.
- Page refresh, logout/login, commit/build, web/worker restart, migration, and Railway-style redeploy against the same PostgreSQL database preserve connections.
- Environment misconfiguration returns a safe missing-variable list.

### 17.5 Provider adapters and operations

Each adapter has request/response fixture tests, authentication/scope tests, validation and preview tests, idempotency tests, rate-limit parsing, typed error mapping, output schema validation, and secret-redaction tests. Selected real-provider smoke tests run only with explicit test credentials and never mutate production accounts.

## 18. Delivery Sequence

1. Shared registry types, schema interpreter, risk definitions, versions, and catalog contract tests.
2. PostgreSQL schema, repositories, transition tables, event/audit append-only controls, and safe migration framework.
3. Queue interface, PostgreSQL queue, fencing worker, retry, DLQ, outbox/inbox.
4. Approval policy, snapshot/hash, two-stage APIs, notification dispatch, and Approval Center.
5. Persistent OAuth sessions/connections, refresh, reauthorization, multi-account UI, soft disconnect, and legacy migration.
6. Registry-driven inspector, dynamic forms, validation, preview, activation wizard, run detail, and DLQ UI.
7. Internal tool adapters and safe workflow control nodes.
8. Existing real provider adapters wrapped into the common contract.
9. Remaining provider adapters delivered in credential/provider packs. Catalog availability stays truthful throughout.
10. Full regression, PostgreSQL concurrency, browser, build, migration, restart, and deployment-persistence verification.

## 19. Completion Criteria

- Every selectable action is defined once and has an exact real adapter version.
- App/action selection changes form, validation, preview, scopes, risk, and execution automatically.
- All modes share one pipeline and no mock success remains.
- High and critical actions cannot bypass warning, final approval, hash comparison, and required authentication.
- Queue/approval/notification/run state survives browser, server, worker, and deployment restarts.
- OAuth connections are PostgreSQL-backed, encrypted, multi-account, refreshable, user-disconnect-only, and preserved by migrations and deployments.
- Runs, approvals, connection events, queue events, and audits are owner-scoped, masked, and queryable.
- DLQ and notification dedupe are operational.
- Existing working automation and integration behaviors remain covered by regression tests.
- Registry, unit, API, PostgreSQL concurrency, migration, browser, typecheck, lint, and production build checks pass.
