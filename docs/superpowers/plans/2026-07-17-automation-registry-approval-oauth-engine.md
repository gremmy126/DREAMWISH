# Automation Registry, Approval, Queue, and OAuth Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace generic automation actions and ephemeral execution/connection state with a versioned Action Registry, real server adapters, PostgreSQL queue/approval/OAuth persistence, and Registry-driven UI.

**Architecture:** Shared serializable action definitions drive both the client form renderer and the authoritative server pipeline. Server-only adapter implementations are versioned separately. PostgreSQL repositories implement explicit transition tables, lease-fenced queue work, approval snapshots, notification deduplication, durable OAuth connections, append-only events, and DLQ operations.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.7, `postgres` 3.4, Node crypto, `@xyflow/react`, existing owner/session and encryption helpers, Node test runner through `scripts/run-tests.mjs`.

## Global Constraints

- Approved design: `docs/superpowers/specs/2026-07-17-automation-registry-approval-oauth-engine-design.md`.
- No selectable action may lack the exact `adapterKey@adapterVersion` implementation.
- No external adapter call may occur before validation, connection/scope checks, idempotency, rate limit, preview, and approval policy.
- High and critical actions must follow `waiting_warning -> waiting_final_approval -> approved -> queued -> running -> completed`.
- PostgreSQL is authoritative in production; JSON is migration input only for the new engine and OAuth connection stores.
- Secrets never appear in workflow input, approval snapshots, previews, queue payloads, execution logs, DLQ, notifications, or audit events.
- Existing owner checks, verified connections, mapping, filter/router, schedule, delay, iterator, and proven outbound services are reused where their behavior matches the spec.
- Filter has no Action picker and false evaluates to `skipped`.
- All implementation follows failing-test-first TDD and fresh full verification before completion.

---

### Task 1: Shared Action Contract and Registry

**Files:**
- Create: `src/lib/automation/registry/action.types.ts`
- Create: `src/lib/automation/registry/schema-runtime.ts`
- Create: `src/lib/automation/registry/action-catalog.ts`
- Create: `src/lib/automation/registry/action-registry.ts`
- Modify: `src/lib/automation/action-registry.ts`
- Modify: `src/lib/automation/app-registry.ts`
- Test: `tests/automation-action-registry.test.ts`

**Interfaces:**
- Produces `ActionDefinition`, `ActionInputSchema`, `ActionRiskLevel`, `validateActionInput`, `listActionDefinitions`, `getActionDefinition`, and `isActionExecutable`.
- Consumers use stable `actionId` and never dispatch on labels.

- [ ] **Step 1: Write failing Registry contract tests**

Test unique app/action/version tuples, every requested action label, action-specific Gmail/Notion fields, Filter exclusion, risk defaults, confirmation phrases, serializability, and executable-action adapter metadata.

```ts
const send = getActionDefinition("gmail", "send-email", 1);
assert.deepEqual(send?.inputSchema.fields.map((field) => field.id), [
  "to", "cc", "bcc", "subject", "body", "attachments"
]);
assert.equal(getActionDefinition("stripe", "refund", 1)?.confirmationPhrase, "REFUND");
assert.deepEqual(listActionDefinitions("filter"), []);
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm.cmd test`

Expected: Registry module imports or assertions fail because the new contract does not exist.

- [ ] **Step 3: Implement serializable types and schema interpreter**

The central shape is:

```ts
export type ActionDefinition = {
  id: string;
  version: number;
  appId: string;
  name: string;
  description: string;
  kind: "trigger" | "read" | "write" | "tool";
  inputSchema: ActionInputSchema;
  outputSchema: ActionOutputSchema;
  outputSchemaVersion: number;
  validation: ValidationRule[];
  defaultValues: Record<string, ActionValue>;
  requiredScopes: string[];
  riskLevel: "read" | "low" | "medium" | "high" | "critical";
  riskRules: RiskEscalationRule[];
  previewDefinition: PreviewDefinition;
  adapterKey: string;
  adapterVersion: number;
  confirmationPhrase: "DELETE" | "REFUND" | "DEPLOY" | "SEND" | null;
  additionalAuth: Array<"password" | "email_code" | "otp" | "admin" | "approval_link" | "slack">;
};
```

`validateActionInput(definition, input)` returns normalized input plus field errors and never executes code from the manifest.

- [ ] **Step 4: Populate the complete requested action catalog**

Define each action listed in design section 6 with exact input fields, output schema, scopes, base risk, risk escalation, preview fields, versions, and adapter key. Mark availability through adapter registry lookup rather than a mutable UI flag.

- [ ] **Step 5: Replace the legacy generic fallback**

`src/lib/automation/action-registry.ts` becomes a compatibility re-export that returns only exact app actions. Unknown apps and Filter return an empty list.

- [ ] **Step 6: Run Registry tests and full tests**

Run: `npm.cmd test`

Expected: Registry contract tests and the existing suite pass.

---

### Task 2: Scenario Action IDs, Dynamic Forms, and Preview UI

**Files:**
- Create: `components/Automation/ActionForm.tsx`
- Create: `components/Automation/ActionPreview.tsx`
- Create: `components/Automation/ConnectionPicker.tsx`
- Modify: `components/Automation/ActionPicker.tsx`
- Modify: `components/Automation/AutomationView.tsx`
- Modify: `src/lib/automation/scenario-designer.ts`
- Test: `tests/automation-action-ui.test.ts`
- Test: `tests/automation-scenario.test.ts`

**Interfaces:**
- `ScenarioNode` gains `actionId`, `actionVersion`, `adapterKey`, `adapterVersion`, and explicit `connectionId`; `operation` remains derived display text during migration only.
- `ActionForm` consumes an `ActionDefinition` and non-secret input map and emits normalized patches.

- [ ] **Step 1: Write failing UI/source and scenario migration tests**

Assert Gmail send and reply render different field IDs, action changes remove stale fields, Filter omits `ActionPicker`, unavailable actions are disabled, and legacy labels map only when unambiguous.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm.cmd test`

Expected: new components/types are missing.

- [ ] **Step 3: Implement node action identity and migration**

Add `migrateScenarioNodeAction(node)` that maps known old labels to pinned definitions. Unknown labels set `configurationStatus: "needs_configuration"` and cannot activate.

- [ ] **Step 4: Implement generic schema-driven form controls**

Support the field types defined in Task 1, conditional visibility, required markers, mapping expressions, advanced fields, inline errors, and safe JSON parsing. Never render fields absent from the selected action schema.

- [ ] **Step 5: Integrate Action picker, connection picker, and preview**

On action change, apply defaults and retain only compatible field IDs after explicit confirmation. Show scopes, risk, connection state, adapter readiness, and masked preview. Keep the existing specialized Schedule, Webhook, Router, and Filter editors where their semantics are richer, but bind them to Registry action IDs.

- [ ] **Step 6: Run tests**

Run: `npm.cmd test`

Expected: dynamic action UI and scenario migration tests pass.

---

### Task 3: PostgreSQL Schema, Repositories, and Transition Tables

**Files:**
- Create: `src/lib/automation/runtime/schema.ts`
- Create: `src/lib/automation/runtime/types.ts`
- Create: `src/lib/automation/runtime/transition-table.ts`
- Create: `src/lib/automation/runtime/workflow.repository.ts`
- Create: `src/lib/automation/runtime/execution.repository.ts`
- Create: `src/lib/automation/runtime/event.repository.ts`
- Create: `src/lib/automation/runtime/audit.repository.ts`
- Test: `tests/automation-runtime-schema.test.ts`
- Test: `tests/automation-transition-table.test.ts`

**Interfaces:**
- Produces `ensureAutomationRuntimeSchema`, normalized row types, `transitionExecution`, immutable workflow version reads, append-only event/audit writes, and owner-scoped repositories.

- [ ] **Step 1: Write failing transition and schema tests**

Assert exact high-risk transitions, rejection/expiry, forbidden transition rejection, required execution/step/queue/snapshot columns, owner isolation, and append-only repository APIs.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm.cmd test`

Expected: runtime schema and transition modules are missing.

- [ ] **Step 3: Implement additive schema creation**

Create all tables and indexes from design section 9 with `CREATE TABLE IF NOT EXISTS`, foreign keys, unique idempotency/dedupe constraints, partial connection indexes, and append-only event tables. Production runtime throws a typed configuration error when `DATABASE_URL` is absent.

- [ ] **Step 4: Implement explicit transition table**

```ts
export const EXECUTION_TRANSITIONS: readonly ExecutionTransition[] = [
  { from: "queued", event: "JOB_CLAIMED", to: "running", actor: "worker" },
  { from: "running", event: "HIGH_RISK_DETECTED", to: "waiting_warning", actor: "worker" },
  { from: "waiting_warning", event: "WARNING_CONTINUED", to: "waiting_final_approval", actor: "owner" },
  { from: "waiting_final_approval", event: "FINAL_APPROVED_AND_AUTHENTICATED", to: "approved", actor: "owner" },
  { from: "approved", event: "RESUME_ENQUEUED", to: "queued", actor: "system" },
  { from: "running", event: "ADAPTER_SUCCEEDED", to: "completed", actor: "worker" }
] as const;
```

Add rejection, expiry, retry, waiting-connection, and failure transitions exactly as the design specifies. Repository transitions use compare-and-set SQL and append an event in the same transaction.

- [ ] **Step 5: Implement immutable workflow and execution repositories**

Store pinned workflow/action snapshots and all requested execution and step metrics. All reads and writes include owner ID except worker claim operations, which revalidate owner from the claimed job.

- [ ] **Step 6: Run tests**

Run: `npm.cmd test`

Expected: schema and transition tests pass without changing existing user data.

---

### Task 4: Queue Adapter, PostgreSQL Lease Worker, DLQ, and Notification Dedupe

**Files:**
- Create: `src/lib/automation/queue/queue.adapter.ts`
- Create: `src/lib/automation/queue/postgres-queue.ts`
- Create: `src/lib/automation/queue/worker.ts`
- Create: `src/lib/automation/queue/notification-outbox.ts`
- Create: `src/lib/automation/queue/worker-entry.ts`
- Create: `scripts/run-automation-worker.mjs`
- Modify: `package.json`
- Test: `tests/automation-queue.test.ts`
- Test: `tests/automation-notification-outbox.test.ts`

**Interfaces:**
- `AutomationQueueAdapter`: enqueue, claim, heartbeat, complete, retry, reject, moveToDeadLetter, requeueDeadLetter.
- Claimed jobs include `workerId`, `lockedUntil`, and monotonic `fencingToken`.

- [ ] **Step 1: Write failing queue race, fencing, retry, DLQ, and dedupe tests**

Use an adapter contract suite. With PostgreSQL configured, assert two concurrent claimers receive one job. Without PostgreSQL, pure transition/SQL-shape tests still run and no JSON production fallback is created.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm.cmd test`

Expected: queue interfaces are missing.

- [ ] **Step 3: Implement PostgreSQL claim and fencing**

Claim in a transaction using `FOR UPDATE SKIP LOCKED`, priority descending, `next_run_at` ascending, and expired leases. Increment fencing token on every claim. Heartbeat and completion compare job ID, worker ID, and fencing token.

- [ ] **Step 4: Implement retry and DLQ**

Respect `Retry-After`, exponential backoff with jitter, action deadlines, and maximum attempts. Requeueing a DLQ item creates a new job and audit event while preserving the original.

- [ ] **Step 5: Implement outbox/inbox dedupe**

Support in-app, email, Slack, browser, and mobile channels with unique dedupe keys and channel receipt IDs. Channel implementations may report configuration-required, but duplicate delivery attempts must not create duplicate notifications.

- [ ] **Step 6: Add worker command and run tests**

Add `automation:worker` using the configured Node runtime. Run: `npm.cmd test`.

Expected: queue, fencing, retry, DLQ, and notification tests pass.

---

### Task 5: Approval Snapshot, Hashing, Policy, and Common Pipeline

**Files:**
- Create: `src/lib/automation/approval/approval.types.ts`
- Create: `src/lib/automation/approval/approval-hash.ts`
- Create: `src/lib/automation/approval/approval.repository.ts`
- Create: `src/lib/automation/approval/approval.service.ts`
- Create: `src/lib/automation/runtime/execution-pipeline.ts`
- Create: `src/lib/automation/runtime/secret-masker.ts`
- Modify: `src/lib/automation/workflow-engine.ts`
- Modify: `src/lib/automation/run-approval.ts`
- Test: `tests/automation-risk-approval.test.ts`
- Test: `tests/automation-execution-pipeline.test.ts`

**Interfaces:**
- Produces canonical `approvalSnapshot`, `computeApprovalHash`, `evaluateActionPolicy`, warning/final/reject/expire operations, and `executeActionStep`.

- [ ] **Step 1: Write failing policy and hash tests**

Cover every execution mode/risk/policy combination, two-stage state ordering, Continue-without-adapter-call, edit supersession, later persistence, expiry, confirmation phrases, critical auth, canonical key ordering, secret exclusion, and pre-execution mismatch.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm.cmd test`

Expected: approval and pipeline modules are missing.

- [ ] **Step 3: Implement canonical snapshot hashing and masking**

Use domain-separated SHA-256 over recursively key-sorted, finite, normalized JSON. Include all exact snapshot fields from the design and the scheduled execution slot. Store only connection IDs and safe account identity.

- [ ] **Step 4: Implement approval policy and repository transitions**

High/critical always enter warning. Continue only changes state. Final approval requires unexpired request, exact phrase, configured critical auth, and matching hash. Editing supersedes the old record and creates a new request at warning.

- [ ] **Step 5: Implement common execution pipeline**

Pipeline order is pinned definition, schema, graph/mapping, owner connection, refresh, scope/permission, idempotency, rate limit, target, preview, risk/policy, approval or adapter, normalized output, masked persistence, event, audit, downstream enqueue.

- [ ] **Step 6: Remove generic success and single approval branching**

Route workflow steps through `executeActionStep`; retain pure graph ordering/filter/router/delay/iterator behavior. `run-approval.ts` becomes a compatibility facade over the new approval service.

- [ ] **Step 7: Run tests**

Run: `npm.cmd test`

Expected: approval and common pipeline tests pass with no provider calls before approval.

---

### Task 6: Durable OAuth Connections and Multi-Account Lifecycle

**Files:**
- Create: `src/lib/oauth/integration-connection.types.ts`
- Create: `src/lib/repositories/integration-connection.repository.ts`
- Create: `src/lib/oauth/oauth-connection.service.ts`
- Create: `src/lib/oauth/oauth-provider-adapter.ts`
- Modify: `src/lib/repositories/oauth-session.repository.ts`
- Modify: `src/lib/oauth/token.service.ts`
- Modify: `src/lib/oauth/oauth-callback.ts`
- Create: `app/api/integrations/[appId]/oauth/start/route.ts`
- Create: `app/api/integrations/[appId]/oauth/callback/route.ts`
- Create: `app/api/integrations/connections/route.ts`
- Create: `app/api/integrations/connections/[connectionId]/route.ts`
- Create: `app/api/integrations/connections/[connectionId]/test/route.ts`
- Create: `app/api/integrations/connections/[connectionId]/refresh/route.ts`
- Create: `app/api/integrations/connections/[connectionId]/reauthorize/route.ts`
- Create: `app/api/integrations/connections/[connectionId]/disconnect/route.ts`
- Modify: existing OAuth connect/callback/disconnect routes as compatibility redirects/facades
- Test: `tests/oauth-durable-connections.test.ts`
- Test: `tests/oauth-disconnect-lifecycle.test.ts`

**Interfaces:**
- Produces owner-scoped `IntegrationConnection` records, multi-account list/get, refresh lease, reauthorize-in-place, test, and explicit soft disconnect.

- [ ] **Step 1: Write failing OAuth persistence and owner lifecycle tests**

Cover durable sessions, PKCE/state one-time use, multi-account uniqueness, connection ID preservation, refresh rotation, refresh failure retention, insufficient-scope retention, owner isolation, explicit disconnect confirmation, revoke failure, soft delete, token destruction, and audit events.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm.cmd test`

Expected: durable connection repository and canonical routes are missing.

- [ ] **Step 3: Implement PostgreSQL OAuth session and connection repositories**

Encrypt tokens server-side with key versioning, use explicit statuses, preserve provider/account/workspace identity, and never fall back to localStorage, process memory, or JSON in production.

- [ ] **Step 4: Wrap existing providers and add Microsoft/Dropbox provider adapters**

Reuse current Google, Slack, GitHub, Notion, and Discord URL/exchange/profile functions. Add Microsoft for Outlook/Teams/OneDrive and Dropbox with state/PKCE support according to provider capability. Every OAuth app without provider environment configuration returns the exact missing environment variable names.

- [ ] **Step 5: Implement refresh, scope reauthorization, and waiting_connection**

Refresh before expiry under a connection lease, retain the old refresh token when no replacement is returned, preserve rows on all recoverable failures, enqueue reconnect notifications, and pause dependent execution without choosing another account.

- [ ] **Step 6: Implement user-only soft disconnect**

Require server session owner and CSRF token, return affected workflows for confirmation, attempt provider revoke, destroy internal token ciphertext even if revoke fails, unsubscribe triggers, preserve history, and append connection/audit events.

- [ ] **Step 7: Run tests**

Run: `npm.cmd test`

Expected: OAuth durability and lifecycle tests pass.

---

### Task 7: Versioned App and Tool Adapters

**Files:**
- Create: `src/lib/automation/adapters/adapter.types.ts`
- Create: `src/lib/automation/adapters/adapter-registry.ts`
- Create provider files under `src/lib/automation/adapters/providers/` for Gmail, Notion, Google Sheets, Slack, Calendar, Discord, Telegram, GitHub, Drive, CRM, YouTube, Outlook, Teams, OneDrive, Dropbox, Airtable, Trello, Asana, Jira, Linear, HubSpot, Salesforce, Stripe, Shopify, WordPress, Facebook, Instagram, X, LinkedIn, OpenAI, and AI analysis.
- Create tool files under `src/lib/automation/adapters/tools/` for schedule, webhook, HTTP, router, filter, code, delay, iterator, formatter, datetime, math, JSON, CSV, aggregators, variables, data store, and error handler.
- Reuse/modify: `src/lib/business/outbound-send.service.ts`
- Test: `tests/automation-adapter-contract.test.ts`
- Test: `tests/automation-provider-adapters.test.ts`
- Test: `tests/automation-tool-adapters.test.ts`

**Interfaces:**
- Every registered implementation satisfies `ActionAdapter` and receives pinned definition, owner-scoped connection, `idempotencyKey`, abort signal, and fencing token.

- [ ] **Step 1: Write failing adapter registry and contract tests**

Iterate every executable ActionDefinition and require exact adapter resolution, validated input, preview, scope handling, idempotency propagation, timeout, typed error normalization, output schema validation, and secret masking.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm.cmd test`

Expected: adapters are missing for executable definitions.

- [ ] **Step 3: Wrap proven existing outbound operations**

Implement Gmail send, Slack send, GitHub issue, Notion page, Discord webhook, and outbound webhook adapters through the common interface without duplicating HTTP/auth logic.

- [ ] **Step 4: Implement internal tool adapters**

Implement deterministic tools locally. HTTP uses the existing SSRF policy or a new shared safe-request boundary. Code delegates only to the isolated code worker and remains disabled if that worker is not configured.

- [ ] **Step 5: Implement provider packs**

Implement each requested action against its provider API with exact credential/scopes, resource-specific input, output normalization, pagination/bulk limits, risk escalation, request ID/rate-limit capture, and fixture tests. Definitions become executable only in the same change that registers the exact adapter version.

- [ ] **Step 6: Run adapter and full tests**

Run: `npm.cmd test`

Expected: every selectable action resolves to a tested adapter; unsupported configuration is disabled rather than simulated.

---

### Task 8: Approval Center, Connection Manager, Run Detail, and Admin DLQ UI

**Files:**
- Create: `components/Automation/ApprovalCenter.tsx`
- Create: `components/Automation/ApprovalWarning.tsx`
- Create: `components/Automation/FinalApproval.tsx`
- Create: `components/Automation/RunDetail.tsx`
- Create: `components/Automation/AdminDeadLetterQueue.tsx`
- Modify: `components/Automation/AutomationSecondaryViews.tsx`
- Modify: `components/Automation/AutomationTabs.tsx`
- Modify: `components/integrations/IntegrationCard.tsx`
- Modify: `components/integrations/OAuthConnectButton.tsx`
- Modify: `components/integrations/IntegrationDisconnectButton.tsx`
- Create approval/run/DLQ API routes under `app/api/automation/`
- Test: `tests/automation-approval-ui.test.ts`
- Test: `tests/automation-run-detail-ui.test.ts`
- Test: `tests/oauth-connection-ui.test.ts`

**Interfaces:**
- UI APIs expose safe DTOs only; no token ciphertext, secret field, raw authorization header, or unmasked queue payload is serialized.

- [ ] **Step 1: Write failing UI contract tests**

Assert every required warning/final field and button, phrase-gated final button, later/edit behavior, expiry display, connection scopes/status/rate limit, run step metrics, masked DLQ, multi-account controls, and disconnect impact confirmation.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm.cmd test`

Expected: new UI/API surfaces are missing.

- [ ] **Step 3: Implement safe approval APIs and UI**

Warning continue only transitions. Final approval performs phrase/auth/hash validation and enqueues resume. Edit supersedes and recreates. Later performs no transition. Use destructive warning styling only for the final action.

- [ ] **Step 4: Implement connection management UI**

Provide connect, add account, reconnect, test, reauthorize, and disconnect per connection. Show account/workspace, status, timestamps, expiry, scopes, and affected workflows. Preserve current Integration navigation and app logos.

- [ ] **Step 5: Implement run detail and DLQ**

Show masked input/output/preview, retry, request ID, rate limit, latency, state events, approval history, and errors. Admin DLQ requeue creates a new job after confirmation.

- [ ] **Step 6: Run tests**

Run: `npm.cmd test`

Expected: UI contract tests pass.

---

### Task 9: Activation Validation and Route Cutover

**Files:**
- Create: `src/lib/automation/runtime/workflow-validator.ts`
- Modify: `app/api/automation/scenarios/route.ts`
- Modify: `app/api/automation/scenarios/[scenarioId]/route.ts`
- Modify: `app/api/automation/scenarios/[scenarioId]/run/route.ts`
- Modify: `src/lib/automation/scenario-scheduler.ts`
- Modify: `app/api/webhooks/automation/[webhookId]/route.ts`
- Modify: `components/Automation/AutomationView.tsx`
- Test: `tests/automation-activation.test.ts`
- Test: `tests/automation-runtime-routes.test.ts`

**Interfaces:**
- `validateWorkflowForActivation` returns typed issues for graph, mapping, action, adapter, connection, credential, scope, risk-policy, and unsafe target failures.

- [ ] **Step 1: Write failing activation and route tests**

Assert every requested activation blocker, owner isolation, manual/test/live mode propagation, trigger event idempotency, queue enqueue instead of inline simulation, and waiting-connection behavior.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm.cmd test`

Expected: new validator and queue-based routes are missing.

- [ ] **Step 3: Implement preflight validation and activation wizard**

Default policy is high-risk two-stage. Show required notice and block activation on any error. Persist immutable active version and explicit node connection IDs.

- [ ] **Step 4: Cut manual, schedule, webhook, and delayed resume to queue jobs**

HTTP routes enqueue and return execution IDs. Scheduler claims schedule slots atomically; webhook event IDs remain idempotent. Remove inline generic-success execution.

- [ ] **Step 5: Run tests**

Run: `npm.cmd test`

Expected: activation and runtime route tests pass.

---

### Task 10: Safe Legacy Migration and Compatibility Cleanup

**Files:**
- Create: `src/lib/automation/runtime/legacy-migration.ts`
- Create: `scripts/migrate-automation-runtime.mjs`
- Modify: `src/lib/repositories/oauth-token.repository.ts`
- Modify: `src/lib/repositories/oauth-session.repository.ts`
- Modify: `src/lib/automation/scenario.repository.ts`
- Test: `tests/automation-legacy-migration.test.ts`
- Test: `tests/oauth-migration-preservation.test.ts`
- Modify: `docs/integrations-oauth-setup.md`

**Interfaces:**
- Migration is idempotent, owner-scoped, backed up, hash/count verified, and preserves ambiguous data in quarantine.

- [ ] **Step 1: Write failing migration preservation tests**

Cover rerun idempotency, existing PostgreSQL row preservation, connection ID/token preservation, no seed overwrite, legacy ambiguous action handling, unowned token quarantine, and rollback metadata.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm.cmd test`

Expected: migration module is missing.

- [ ] **Step 3: Implement migration and compatibility reads**

Import valid legacy owner rows once, never truncate, never delete legacy files, and record source hashes/counts/version marker. Cut writes to PostgreSQL only after successful verification.

- [ ] **Step 4: Remove duplicate runtime branches**

Delete generic common action fallback and mock success paths only after all callers use Registry/pipeline repositories. Keep compatibility exports for external imports until tests prove no old write path remains.

- [ ] **Step 5: Update OAuth setup documentation and run tests**

Run: `npm.cmd test`

Expected: migration and all regression tests pass.

---

### Task 11: Full Verification and Browser Validation

**Files:**
- Modify tests only if a verified defect in the intended contract is found.

**Interfaces:**
- Produces fresh evidence for Registry coverage, tests, lint, types, build, PostgreSQL concurrency, migration, OAuth persistence, and UI behavior.

- [ ] **Step 1: Run complete automated verification**

Run:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
git diff --check
```

Expected: every command exits 0 with no test failure, lint error, type error, build error, or whitespace error.

- [ ] **Step 2: Run PostgreSQL integration verification**

Against a disposable test database, run queue competition, lease loss, crash recovery, approval restart, OAuth reconnect/refresh/disconnect, migration rerun, outbox dedupe, and DLQ requeue tests. The database is not a production or user database.

- [ ] **Step 3: Run browser validation**

Verify scenario creation, action-specific fields, Filter, connection selection, activation validation, warning/final approval, later approval after reload, run detail, multi-account OAuth controls, disconnect confirmation, and admin DLQ at desktop and narrow widths.

- [ ] **Step 4: Review final diff against the approved design**

Confirm all 19 design sections have an implementation/test owner and report any environment-only verification such as live provider credentials or Railway restart separately without claiming it passed locally.
