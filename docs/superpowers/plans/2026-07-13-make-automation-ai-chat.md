# Make Automation Studio and AI Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자 이미지와 같은 Make형 자동화 편집기를 만들고 AI Chat 자연어 명령을 저장 가능한 시나리오 초안으로 연결한다.

**Architecture:** 정규화된 Scenario/Node/Edge 모델을 owner-scoped PostgreSQL revision으로 저장한다. `@xyflow/react`는 편집과 렌더링만 담당하며 서버 validator와 runner가 실행 의미를 소유한다. AI Chat은 초안을 만들지만 테스트와 활성화 전에는 외부 작업을 실행하지 않는다.

**Tech Stack:** React 19, Next.js 15, TypeScript, `@xyflow/react`, PostgreSQL owner document store, existing integration registry

## Global Constraints

- 기존 248px 사이드바 항목·순서·폭은 유지한다.
- 앱 전체 가로 스크롤을 만들지 않고 캔버스만 pan·zoom한다.
- API 키 원문은 클라이언트에 다시 반환하지 않는다.
- 테스트 또는 활성화하지 않은 AI 초안은 자동 실행하지 않는다.
- 실행 어댑터가 없는 앱은 `준비 중`으로 표시한다.
- 모든 자동화 API는 결제 권한과 owner 격리를 모두 확인한다.

---

### Task 1: Scenario domain, catalog, and graph validation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/lib/automation/scenario.types.ts`
- Create: `src/lib/automation/module-catalog.ts`
- Create: `src/lib/automation/scenario-validator.ts`
- Test: `tests/automation-scenario.test.ts`

**Interfaces:**
- Produces: `Scenario`, `ScenarioNode`, `ScenarioEdge`, `ScenarioDraft`
- Produces: `AUTOMATION_MODULE_CATALOG`
- Produces: `validateScenario(scenario): ScenarioValidationResult`

- [ ] **Step 1: Write failing validation tests**

```ts
const result = validateScenario({ ...scenario, nodes: [], edges: [] });
assert.deepEqual(result.errors.map((error) => error.code), ["TRIGGER_REQUIRED"]);

const dangling = validateScenario({
  ...scenario,
  edges: [{ id: "edge-1", sourceNodeId: "missing", targetNodeId: "node-2" }]
});
assert.ok(dangling.errors.some((error) => error.code === "EDGE_ENDPOINT_INVALID"));
```

- [ ] **Step 2: Run tests and verify the domain modules are missing**

Run: `npm test`

Expected: FAIL loading `scenario-validator`.

- [ ] **Step 3: Implement the model and validator**

```ts
export type ScenarioNode = {
  id: string;
  kind: "trigger" | "action" | "router" | "filter" | "delay" | "loop" | "code";
  connectorId: string;
  operation: string;
  label: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
  credentialId: string | null;
};

export type ScenarioEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  condition: Record<string, unknown> | null;
};
```

Validator checks trigger existence, unique ids, real edge endpoints, no ordinary cycles, configured loop limits, executable catalog operation, and credential requirement.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test`

Expected: scenario domain tests pass.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/automation/scenario.types.ts src/lib/automation/module-catalog.ts src/lib/automation/scenario-validator.ts tests/automation-scenario.test.ts
git commit -m "feat: define automation scenario graph"
```

### Task 2: Scenario repository and CRUD APIs

**Files:**
- Create: `src/lib/automation/scenario.repository.ts`
- Create: `app/api/automation/scenarios/route.ts`
- Create: `app/api/automation/scenarios/[scenarioId]/route.ts`
- Create: `app/api/automation/scenarios/[scenarioId]/activate/route.ts`
- Create: `app/api/automation/scenarios/[scenarioId]/pause/route.ts`
- Create: `app/api/automation/catalog/route.ts`
- Test: `tests/automation-scenario-api.test.ts`

**Interfaces:**
- Produces: `listScenarios(ownerId)`
- Produces: `createScenario(ownerId, draft)`
- Produces: `saveScenario(ownerId, scenarioId, expectedVersion, draft)`
- Produces: `softDeleteScenario(ownerId, scenarioId, expectedVersion)`

- [ ] **Step 1: Write failing owner-isolation and version tests**

```ts
await createScenario("owner-a", draft);
assert.equal((await listScenarios("owner-b")).length, 0);
await assert.rejects(
  () => saveScenario("owner-a", id, 99, draft),
  /SCENARIO_VERSION_CONFLICT/u
);
```

- [ ] **Step 2: Run tests and verify repository is absent**

Run: `npm test`

Expected: FAIL importing `scenario.repository`.

- [ ] **Step 3: Implement owner revision CRUD**

Repository stores the owner's scenario collection in namespace `automation-scenarios`. Save increments version. Activate sets `activeVersion` to the current validated version. Editing nodes or edges after activation clears `activeVersion`. Delete writes `deletedAt` and pause state instead of removing the record.

Route handlers use `requireEntitledOwnerContext(request)` and never accept `ownerId` from JSON.

- [ ] **Step 4: Run API tests and typecheck**

Run: `npm test`

Expected: CRUD, owner isolation, version, and activation tests pass.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/automation/scenario.repository.ts app/api/automation/scenarios app/api/automation/catalog tests/automation-scenario-api.test.ts
git commit -m "feat: add automation scenario APIs"
```

### Task 3: Safe credential storage

**Files:**
- Create: `src/lib/automation/credential-crypto.ts`
- Create: `src/lib/automation/credential.repository.ts`
- Create: `app/api/automation/credentials/route.ts`
- Create: `app/api/automation/credentials/[credentialId]/route.ts`
- Create: `app/api/automation/credentials/[credentialId]/test/route.ts`
- Test: `tests/automation-credentials.test.ts`

**Interfaces:**
- Produces: `encryptCredential(ownerId, secret)`
- Produces: `decryptCredential(ownerId, envelope)`
- API returns only `{ id, connectorId, label, authType, maskedHint, lastVerifiedAt, revokedAt }`

- [ ] **Step 1: Write failing encryption and redaction tests**

```ts
const envelope = encryptCredential("owner-a", "secret-value");
assert.notEqual(envelope.ciphertext, "secret-value");
assert.equal(decryptCredential("owner-a", envelope), "secret-value");
assert.throws(() => decryptCredential("owner-b", envelope));
assert.doesNotMatch(JSON.stringify(toCredentialDto(record)), /secret-value/u);
```

- [ ] **Step 2: Run tests and verify credential modules are absent**

Run: `npm test`

Expected: FAIL importing credential crypto.

- [ ] **Step 3: Implement AES-256-GCM envelopes**

Derive a 32-byte key from `INTEGRATION_TOKEN_ENCRYPTION_KEY` and owner id using HMAC-SHA256. Store random 12-byte IV, auth tag, ciphertext, and key version. Missing or short production keys reject writes. Revoke sets `revokedAt`; it does not delete ciphertext revision history.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test`

Expected: encryption, wrong-owner failure, redaction, and route owner isolation pass.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/automation/credential-crypto.ts src/lib/automation/credential.repository.ts app/api/automation/credentials tests/automation-credentials.test.ts
git commit -m "feat: secure automation credentials"
```

### Task 4: Test and manual execution engine

**Files:**
- Create: `src/lib/automation/scenario-runner.ts`
- Create: `src/lib/automation/run.repository.ts`
- Create: `app/api/automation/scenarios/[scenarioId]/test/route.ts`
- Create: `app/api/automation/scenarios/[scenarioId]/run/route.ts`
- Create: `app/api/automation/runs/route.ts`
- Create: `app/api/automation/runs/[runId]/route.ts`
- Test: `tests/automation-runner.test.ts`

**Interfaces:**
- Produces: `runScenario({ ownerId, scenarioId, mode, idempotencyKey })`
- Produces: step status `pending | running | succeeded | failed | skipped`

- [ ] **Step 1: Write failing runner tests**

```ts
const run = await runScenario({
  ownerId: "owner-a",
  scenarioId,
  mode: "test",
  idempotencyKey: "manual-1"
});
assert.deepEqual(run.steps.map((step) => step.status), ["succeeded", "succeeded"]);
assert.equal((await runScenario({ ownerId: "owner-a", scenarioId, mode: "test", idempotencyKey: "manual-1" })).id, run.id);
```

- [ ] **Step 2: Run tests and verify runner is absent**

Run: `npm test`

Expected: FAIL importing runner.

- [ ] **Step 3: Implement deterministic executable subset**

Initial executable adapters are manual/schedule trigger, filter, router, delay with capped milliseconds, HTTP GET/POST with URL allow rules, Webhook response, and existing Gmail/Slack/Notion connectors when connected. Test mode masks external writes and returns previews. Run mode requires active version and exact approved credentials. Every log uses a recursive secret redactor and truncates strings to 2,000 characters.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test`

Expected: idempotency, filter skip, owner isolation, active-version requirement, and secret redaction pass.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/automation/scenario-runner.ts src/lib/automation/run.repository.ts app/api/automation/scenarios app/api/automation/runs tests/automation-runner.test.ts
git commit -m "feat: run automation scenarios safely"
```

### Task 5: Make-style Automation Studio UI

**Files:**
- Replace: `components/Automation/AutomationView.tsx`
- Create: `components/Automation/AutomationStudio.tsx`
- Create: `components/Automation/ModuleCatalog.tsx`
- Create: `components/Automation/ScenarioCanvas.tsx`
- Create: `components/Automation/ModuleNode.tsx`
- Create: `components/Automation/ScenarioInspector.tsx`
- Create: `components/Automation/ScenarioToolbar.tsx`
- Create: `components/Automation/TemplateGallery.tsx`
- Create: `components/Automation/CredentialManager.tsx`
- Create: `components/Automation/RunHistory.tsx`
- Test: `tests/automation-studio-ui.test.ts`

**Interfaces:**
- `AutomationView` renders `AutomationStudio`
- Canvas emits `onNodesChange`, `onEdgesChange`, `onConnect`, `onSelectionChange`

- [ ] **Step 1: Write failing screenshot-structure and overflow contracts**

```ts
for (const token of ["ModuleCatalog", "ScenarioCanvas", "ScenarioInspector", "TemplateGallery"]) {
  assert.match(studio, new RegExp(token, "u"));
}
assert.match(studio, /grid-cols-\[180px_minmax\(0,1fr\)_320px\]/u);
assert.match(canvas, /ReactFlow/u);
assert.match(node, /truncate|line-clamp/u);
assert.doesNotMatch(studio, /overflow-x-auto/u);
```

- [ ] **Step 2: Run tests and verify current list UI fails the contracts**

Run: `npm test`

Expected: FAIL because Make-style components do not exist.

- [ ] **Step 3: Implement the image-driven responsive UI**

The desktop grid is `180px minmax(0,1fr) 320px`; below 1440px the inspector becomes a drawer, and below 1024px both side panels are drawers. React Flow nodes have 136px fixed width, `min-w-0`, truncated title, two-line description, numbered badge, connector icon, source/target handles. Toolbar buttons call save, test, run, activate/pause, clone, and soft delete APIs.

- [ ] **Step 4: Run tests, typecheck, and build**

Run: `npm test`

Expected: structure and overflow contracts pass.

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm run build`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add components/Automation tests/automation-studio-ui.test.ts
git commit -m "feat: build Make-style automation studio"
```

### Task 6: AI Chat scenario draft bridge

**Files:**
- Create: `src/lib/automation/ai-scenario-draft.ts`
- Create: `app/api/automation/ai-draft/route.ts`
- Modify: `app/api/ai/chat/route.ts`
- Modify: `app/api/chat/route.ts`
- Modify: `components/Chat/ChatView.tsx`
- Modify: `components/layout/AppShell.tsx`
- Test: `tests/automation-chat-draft.test.ts`

**Interfaces:**
- Chat message adds `automationDraft?: { scenarioId: string; name: string; summary: string }`
- App navigation uses `window.dispatchEvent(new CustomEvent("dreamwish:navigate", { detail: { view: "automation", scenarioId } }))`

- [ ] **Step 1: Write failing chat bridge tests**

```ts
const draft = buildScenarioDraftFromCommand("매일 오전 9시에 Gmail을 확인하고 Slack으로 알려줘");
assert.deepEqual(draft.nodes.map((node) => node.connectorId), ["schedule", "gmail", "slack"]);
assert.match(chatView, /자동화에서 열기/u);
assert.match(appShell, /dreamwish:navigate/u);
```

- [ ] **Step 2: Run tests and verify draft bridge is absent**

Run: `npm test`

Expected: FAIL importing the draft builder and finding the chat action.

- [ ] **Step 3: Implement safe draft generation and navigation**

Command classification creates only known catalog modules. Missing account, credential, operation, or field mapping is recorded in `draft.warnings`. The server saves a paused draft and returns its id; chat renders summary and `자동화에서 열기`. AppShell switches to the automation view and passes selected scenario id. No runner API is called by this flow.

- [ ] **Step 4: Run full verification**

Run: `npm test`

Expected: chat draft, no-auto-run, and navigation tests pass.

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm run build`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/automation/ai-scenario-draft.ts app/api/automation/ai-draft app/api/ai/chat/route.ts app/api/chat/route.ts components/Chat/ChatView.tsx components/layout/AppShell.tsx tests/automation-chat-draft.test.ts
git commit -m "feat: create automation drafts from AI chat"
```
