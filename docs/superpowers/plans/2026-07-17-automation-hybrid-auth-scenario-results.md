# Automation Hybrid Auth, Scenario Runtime, and AI Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix false partial runs, make Gmail → AI → Notion scenarios action-aware, add scenario title/description editing, expose real AI step outputs, and connect Google Sheets/YouTube through capability-bound OAuth or credentials.

**Architecture:** The canonical Action Registry and PostgreSQL Worker remain authoritative. Scenario generation emits exact Action IDs, mappings, and graph order; legacy JSON runs become read-only. A shared credential resolver accepts OAuth or verified encrypted credentials according to each Action's declared auth modes. AI analysis UI reads persisted AI step outputs instead of generating workflow-health advice.

**Tech Stack:** Next.js 15, React 19, TypeScript, PostgreSQL, Node crypto, existing Action Registry/Queue/Worker test harness.

## Global Constraints

- Users never enter OAuth Client IDs or Client Secrets.
- Google Sheets supports OAuth and Google service-account JSON; target spreadsheets must be shared with the service-account email.
- YouTube write Actions require OAuth; API keys support only public read Actions.
- High and critical Actions retain mandatory approval and snapshot-hash verification.
- No secret may enter client DTOs, previews, logs, queue safe payloads, or approval snapshots.
- New runtime executions never use `partial` for approval, missing connection, failed input, or skipped Filter branches.

---

### Task 1: Action-aware Gmail → AI → Notion scenario compilation

**Files:**
- Modify: `src/lib/automation/scenario-designer.ts`
- Modify: `src/lib/automation/registry/action-catalog.ts`
- Test: `tests/automation-scenario.test.ts`

**Interfaces:**
- Produces: `buildScenarioFromPrompt(prompt, ownerId, metadata?)` with stable action order and mappings.
- Consumes: `getActionDefinition(appId, actionId)` and existing `ScenarioNode` fields.

- [ ] **Step 1: Write the failing scenario regression test**

```ts
test("email analysis prompt compiles Gmail trigger then AI summary then Notion page", () => {
  const scenario = buildScenarioFromPrompt("Gmail의 중요한 이메일을 AI로 요약해 Notion에 저장해줘", "owner-1");
  assert.deepEqual(scenario.nodes.map((node) => `${node.appId}.${node.actionId}`), [
    "gmail.watch-new-email",
    "ai.summarize",
    "notion.create-page"
  ]);
  assert.equal(scenario.nodes[0]!.kind, "trigger");
  assert.equal(scenario.nodes[1]!.config.input, "{{trigger.email.body}}");
  assert.equal(scenario.nodes[2]!.config.title, "{{trigger.email.subject}}");
  assert.match(String(scenario.nodes[2]!.config.content), /steps\..+\.text/u);
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm.cmd test`

Expected: current node order includes Schedule/Notion before AI and mappings are absent.

- [ ] **Step 3: Implement the exact intent compiler**

Add a `buildKnownScenario` branch before generic module detection. It creates Gmail `watch-new-email`, AI `summarize`, and Notion `create-page` nodes with explicit IDs, versions, kinds, positions, credential requirements, and mappings. The Notion `parentId` remains empty so activation requests an explicit destination.

- [ ] **Step 4: Run tests and confirm GREEN**

Run: `npm.cmd test`

Expected: the new regression passes and existing prompt scenarios remain valid.

---

### Task 2: Scenario title and description create/edit controls

**Files:**
- Modify: `src/lib/automation/scenario-designer.ts`
- Modify: `app/api/automation/ai-draft/route.ts`
- Modify: `components/Automation/AutomationView.tsx`
- Test: `tests/automation-scenario.test.ts`
- Test: `tests/automation-operations-ui.test.ts`

**Interfaces:**
- `ScenarioDraftMetadata = { title?: string; description?: string }`.
- `POST /api/automation/ai-draft` accepts `{ prompt, title, description }`.

- [ ] **Step 1: Write failing metadata tests**

Assert a supplied title/description is trimmed, bounded, persisted in the returned scenario, and never overwritten by prompt-derived defaults. Assert the UI contains labelled `시나리오 제목` and `설명` controls.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm.cmd test`

Expected: the current builder accepts only prompt and the controls are absent.

- [ ] **Step 3: Implement metadata normalization and UI**

Use title length 1–100 and description length 0–500. Add a create dialog state with separate instruction/title/description values. Add editable workspace inputs bound to the active scenario and saved by the existing PUT route.

- [ ] **Step 4: Run tests and confirm GREEN**

Run: `npm.cmd test`

Expected: metadata tests pass and existing scenario persistence remains owner-scoped.

---

### Task 3: Remove false partial/legacy approval behavior

**Files:**
- Modify: `src/lib/automation/workflow-engine.ts`
- Modify: `src/lib/automation/run-approval.ts`
- Modify: `components/Automation/AutomationSecondaryViews.tsx`
- Modify: `src/lib/automation/gmail-trigger.ts`
- Modify: `src/lib/automation/scenario-scheduler.ts`
- Test: `tests/workflow-engine.test.ts`
- Test: `tests/automation-triggers.test.ts`
- Test: `tests/automation-approval.test.ts`

**Interfaces:**
- Legacy graph execution classifies by exact ActionDefinition kind/risk, never app ID.
- PostgreSQL environments enqueue canonical executions only.
- Legacy Run History is display-only and cannot open an executable approval modal.

- [ ] **Step 1: Write failing action-classification tests**

Assert Gmail `watch-new-email` is not `approval_required`, Notion fields are read from its exact Action schema, Filter false is skipped without partial, and connected canonical paths do not create legacy records.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm.cmd test`

Expected: `EXTERNAL_SEND_APPS` marks Gmail trigger as approval-required.

- [ ] **Step 3: Replace app classification and retire legacy approval UI**

Resolve each node's ActionDefinition and use `kind === "write"` only for legacy display fallback. Delete app-specific field inference from new execution paths. Label old records `이전 실행 기록`, show exact stored reason, and link active approvals to Approval Center.

- [ ] **Step 4: Run tests and confirm GREEN**

Run: `npm.cmd test`

Expected: no false Gmail send preview and no new canonical run appears as partial.

---

### Task 4: Persisted AI module result feed

**Files:**
- Replace: `src/lib/automation/automation-analysis.ts`
- Modify: `app/api/automation/analysis/route.ts`
- Modify: `components/Automation/AutomationView.tsx`
- Modify: `src/lib/automation/runtime/execution.repository.ts`
- Test: `tests/automation-runtime-execution.test.ts`
- Test: `tests/automation-operations-ui.test.ts`

**Interfaces:**
- `listAutomationAiResults(ownerId, limit)` returns completed/failed `ai` and `openai` step results joined to workflow/execution identity.
- `/api/automation/analysis` returns `{ results: AutomationAiResult[] }`.

- [ ] **Step 1: Write failing repository/API/UI tests**

Assert owner filtering, newest-first ordering, AI/OpenAI-only selection, masked input/output, safe errors, scenario/execution identity, and removal of rule-based dashboard statistics from the card.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm.cmd test`

Expected: the existing endpoint computes workflow health and invokes AI rather than returning stored AI step output.

- [ ] **Step 3: Implement stored result query and card**

Join `automation_step_runs`, `automation_executions`, and `automation_workflows`; filter `adapter_key LIKE 'ai.%' OR adapter_key LIKE 'openai.%'`; return only masked columns. Render scenario, Action, completion time, output, execution ID, and safe failure state. Empty state explains that an AI module must run first.

- [ ] **Step 4: Run tests and confirm GREEN**

Run: `npm.cmd test`

Expected: API/UI tests show real persisted AI outputs and no generated health advice.

---

### Task 5: Google Sheets and YouTube OAuth targets

**Files:**
- Modify: `src/lib/oauth/oauth.types.ts`
- Modify: `src/lib/oauth/oauth-provider-registry.ts`
- Modify: `src/lib/oauth/oauth-provider-adapter.ts`
- Modify: `src/lib/automation/app-registry.ts`
- Test: `tests/oauth-integration-flow.test.ts`
- Test: `tests/automation-app-registry.test.ts`

**Interfaces:**
- Google services include `sheets` and `youtube` while retaining one canonical Google callback.
- `getOAuthAppTarget("google-sheets")` and `getOAuthAppTarget("youtube")` return exact app/service scopes.

- [ ] **Step 1: Write failing OAuth target tests**

Assert Sheets uses service `sheets` with spreadsheet scopes and YouTube uses service `youtube` with upload/force-SSL scopes. Assert both app definitions expose `{ provider: "google", service }`.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm.cmd test`

Expected: services are not in the type/Registry and app OAuth targets are absent.

- [ ] **Step 3: Implement Google service contracts**

Extend Google service types, scope tables, resolver, legacy target mapping, and app Registry targets. Preserve `/api/integrations/google/callback` exactly.

- [ ] **Step 4: Run tests and confirm GREEN**

Run: `npm.cmd test`

Expected: both apps can start durable OAuth with app-bound sessions.

---

### Task 6: Capability-bound credential resolver, Sheets service account, and YouTube API key

**Files:**
- Modify: `src/lib/automation/registry/action.types.ts`
- Modify: `src/lib/automation/registry/action-catalog.ts`
- Modify: `src/lib/automation/credential.repository.ts`
- Modify: `src/lib/integrations/credential-verifier.ts`
- Create: `src/lib/automation/runtime/action-credential-resolver.ts`
- Create: `src/lib/automation/adapters/action-http-client.ts`
- Modify: `src/lib/automation/runtime/workflow-validator.ts`
- Modify: `src/lib/automation/runtime/workflow-runner.ts`
- Modify: `src/lib/automation/adapters/google.adapter.ts`
- Test: `tests/integration-credential-verification.test.ts`
- Test: `tests/automation-execution-pipeline.test.ts`
- Test: `tests/action-adapter-contract.test.ts`

**Interfaces:**
- `resolveActionCredential({ ownerId, connectionId, definition })` accepts OAuth or verified key credentials.
- `ActionDefinition.supportedAuthModes` is authoritative.
- YouTube read Actions: `get-video`, `search-videos`, `get-channel`.

- [ ] **Step 1: Write failing auth-mode and resolver tests**

Cover OAuth, service-account JWT exchange, API key verification, cross-owner IDs, app mismatch, YouTube key read success, YouTube key write rejection before fetch, and secret-free DTOs.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm.cmd test`

Expected: Action auth modes and credential resolver do not exist.

- [ ] **Step 3: Implement resolver and Google credential verification**

Parse service-account JSON, validate `client_email` and PEM private key, sign an RS256 JWT with `node:crypto`, exchange it at Google's token endpoint, and return a short-lived bearer only in server memory. Verify YouTube keys with a bounded public Data API call. Reuse AES-256-GCM credential storage.

- [ ] **Step 4: Implement action-aware HTTP client and adapters**

Inject OAuth/service-account bearer headers or YouTube API key query parameters according to the resolved mode. Never append a key for write Actions. Capture request IDs, rate limits, latency, and normalized provider errors.

- [ ] **Step 5: Run tests and confirm GREEN**

Run: `npm.cmd test`

Expected: Sheets OAuth/service-account and YouTube OAuth/API-key reads pass; unsupported combinations fail closed.

---

### Task 7: Adapter-pack follow-up plans and availability audit

**Files:**
- Create: `docs/superpowers/plans/2026-07-17-automation-adapters-google-messaging.md`
- Create: `docs/superpowers/plans/2026-07-17-automation-adapters-business-commerce.md`
- Create: `docs/superpowers/plans/2026-07-17-automation-adapters-publishing-ai-tools.md`
- Modify: `src/lib/automation/adapters/adapter-availability.ts` only in the corresponding implementation commits.
- Test: `tests/action-adapter-contract.test.ts`

**Interfaces:**
- Every provider-pack plan consumes the same credential resolver and action HTTP client from Task 6.
- Availability is enabled only in the same TDD cycle as the exact Adapter.

- [ ] **Step 1: Generate the current exact missing-key inventory**

Run the Action Catalog against `isAdapterImplementationAvailable` and record every missing `adapterKey@version` in one of the three provider-pack plans.

- [ ] **Step 2: Write provider-pack plans with exact API operations**

Split the remaining Actions into Google/messaging/files, business/commerce/work-management, and publishing/AI/internal tools. Each Action gets request method/path, auth mode, idempotency behavior, risk, expected output, fixture, and failure test.

- [ ] **Step 3: Re-run the availability contract**

Run: `npm.cmd test`

Expected: no Action is marked implemented without an exact registered Adapter; the remaining count is reported for the next implementation batch.

---

### Task 8: Full verification

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run complete verification sequentially**

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
git diff --check
```

Expected: every command exits 0. Build and typecheck run sequentially because both use `.next/types`.

- [ ] **Step 2: Review Git scope and commit intentionally**

Stage only the spec, plan, source, and test files belonging to this implementation. Commit to `main`. Push only after verification succeeds.
