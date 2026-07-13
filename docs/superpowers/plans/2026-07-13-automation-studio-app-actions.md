# Automation Studio App Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace letter glyphs and static tabs with a typed 39-module catalog, app-specific credentials and actions, Make-style tools, persisted runs, and safe real execution.

**Architecture:** Keep scenario graphs in the existing owner-scoped repositories, but split catalog metadata, credentials, execution, and tab UI into focused modules. Built-in actions use server executors; remaining official endpoints use a guarded custom HTTP executor. Unsupported or unconfigured actions never return fake success.

**Tech Stack:** Next.js 15, React 19, TypeScript 5.7, `@xyflow/react`, Zod 4, Node test runner, AES-256-GCM credential storage.

## Global Constraints

- Preserve the existing sidebar and AI Chat home behavior.
- Existing 19 modules plus 20 approved apps must render real local SVG logos.
- OAuth Client Secrets stay server-only; user tokens remain encrypted and masked.
- Every node stores `appId`, `actionId`, `credentialId`, mappings, timeout, retry policy, and `continueOnError`.
- No fake connected or successful state.
- Custom HTTP blocks loopback, private, link-local, and metadata network targets.
- Never stage `.superpowers/` or `h origin main`.

---

### Task 1: Typed app, credential, action, and tool registries

**Files:**
- Create: `src/lib/automation/app-registry.ts`
- Create: `src/lib/automation/action-registry.ts`
- Create: `src/lib/automation/tool-registry.ts`
- Create: `components/Automation/AutomationAppLogo.tsx`
- Create: `public/automation-icons/*.svg`
- Modify: `src/lib/automation/scenario-designer.ts`
- Test: `tests/automation-app-registry.test.ts`

**Interfaces:**
- Produces: `AUTOMATION_APPS`, `getAutomationApp(appId)`, `listAutomationActions(appId)`, `AUTOMATION_TOOLS`, `AutomationCredentialField`.

- [ ] **Step 1: Write the failing registry contract test**

```ts
test("catalog exposes 39 unique modules with logos, credentials and actions", () => {
  assert.equal(AUTOMATION_APPS.length + AUTOMATION_TOOLS.length, 39);
  assert.equal(new Set([...AUTOMATION_APPS, ...AUTOMATION_TOOLS].map((item) => item.id)).size, 39);
  for (const app of AUTOMATION_APPS) {
    assert.match(app.logoPath, /^\/automation-icons\/.+\.svg$/u);
    assert.ok(listAutomationActions(app.id).length > 0);
  }
});
```

- [ ] **Step 2: Run the test and confirm missing modules fail**

Run: `node --import tsx --test tests/automation-app-registry.test.ts`

Expected: FAIL because the registry modules do not exist.

- [ ] **Step 3: Define registry contracts and approved IDs**

```ts
export type AutomationCredentialField = {
  id: string;
  label: string;
  secret: boolean;
  required: boolean;
  placeholder?: string;
};

export type AutomationAppDefinition = {
  id: string;
  label: string;
  logoPath: string;
  authType: "none" | "oauth" | "api_key" | "token" | "multi_field";
  credentialFields: AutomationCredentialField[];
};
```

- [ ] **Step 4: Add local SVG assets and logo component**

```tsx
export function AutomationAppLogo({ appId, size = 32 }: { appId: string; size?: number }) {
  const app = getAutomationApp(appId);
  return app
    ? <img src={app.logoPath} alt="" width={size} height={size} className="shrink-0 object-contain" />
    : <Wrench aria-hidden="true" size={size} />;
}
```

- [ ] **Step 5: Add action and Make-tool definitions**

Include trigger/read/create/update/delete/custom actions for approved apps and Text, DateTime, Math, JSON, CSV, Array Aggregator, Text Aggregator, Variables, Data Store, and Error Handler tools.

- [ ] **Step 6: Run the test and commit**

Run: `node --import tsx --test tests/automation-app-registry.test.ts`

Expected: PASS.

Commit: `feat: add automation app and action registries`

---

### Task 2: Scenario schema and action validation

**Files:**
- Modify: `src/lib/automation/scenario-designer.ts`
- Modify: `src/lib/automation/scenario.repository.ts`
- Modify: `app/api/automation/scenarios/route.ts`
- Modify: `app/api/automation/scenarios/[scenarioId]/route.ts`
- Test: `tests/automation-scenario.test.ts`

**Interfaces:**
- Produces: `ScenarioNode.actionId`, `inputMappings`, `retryPolicy`, `continueOnError`, `validateScenarioForExecution`.

- [ ] **Step 1: Add failing schema tests**

```ts
assert.equal(validateScenarioForExecution(scenarioWithoutAction).issues[0].code, "action_required");
assert.equal(validateScenarioForExecution(scenarioWithoutCredential).issues[0].code, "credential_required");
```

- [ ] **Step 2: Run the scenario tests**

Run: `npm test -- --test-name-pattern automation`

Expected: FAIL with missing node action validation.

- [ ] **Step 3: Extend node schema and migration defaults**

```ts
export type ScenarioNode = {
  id: string;
  appId: string;
  actionId: string | null;
  credentialId: string | null;
  inputMappings: Record<string, string>;
  retryPolicy: { maxAttempts: number; backoffMs: number };
  continueOnError: boolean;
  timeoutMs: number;
  position: { x: number; y: number };
  config: Record<string, unknown>;
};
```

- [ ] **Step 4: Enforce registry-backed action and credential checks**

Reject unknown `appId`, unknown `actionId`, missing action inputs, and credentials owned by another user.

- [ ] **Step 5: Run tests and commit**

Run: `npm test -- --test-name-pattern automation`

Expected: PASS.

Commit: `feat: validate automation node actions`

---

### Task 3: Structured encrypted credentials

**Files:**
- Modify: `src/lib/automation/credential.repository.ts`
- Modify: `app/api/automation/credentials/route.ts`
- Modify: `app/api/automation/credentials/[credentialId]/route.ts`
- Create: `app/api/automation/credentials/[credentialId]/test/route.ts`
- Test: `tests/automation-credential-schema.test.ts`

**Interfaces:**
- Consumes: `AutomationCredentialField`.
- Produces: `saveAutomationCredential(ownerId, appId, values)`, `decryptAutomationCredential`, masked public metadata.

- [ ] **Step 1: Test multi-field encryption and masking**

```ts
const saved = await saveAutomationCredential("owner-a", "jira", {
  siteUrl: "https://example.atlassian.net",
  email: "owner@example.com",
  apiToken: "secret"
});
assert.equal(saved.maskedValues.apiToken, "••••••");
assert.equal((await decryptAutomationCredential("owner-a", saved.id)).apiToken, "secret");
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --import tsx --test tests/automation-credential-schema.test.ts`

- [ ] **Step 3: Encrypt one JSON object per credential with AES-256-GCM**

Validate fields from the registry before encryption and never return decrypted values from routes.

- [ ] **Step 4: Add connection test route**

The route resolves the app validator, returns only `{ ok, status, accountLabel, verifiedAt, errorCode }`, and never includes provider bodies or secrets.

- [ ] **Step 5: Run tests and commit**

Commit: `feat: support structured automation credentials`

---

### Task 4: Persisted run engine and safe HTTP execution

**Files:**
- Create: `src/lib/automation/run.repository.ts`
- Create: `src/lib/automation/execution-engine.ts`
- Create: `src/lib/automation/executors/http-executor.ts`
- Create: `src/lib/automation/executors/tool-executor.ts`
- Create: `app/api/automation/runs/route.ts`
- Create: `app/api/automation/runs/[runId]/route.ts`
- Modify: `app/api/automation/scenarios/[scenarioId]/run/route.ts`
- Test: `tests/automation-execution-engine.test.ts`

**Interfaces:**
- Produces: `executeAutomationScenario({ ownerId, scenarioId, triggerType })`, owner-scoped `AutomationRun` and `AutomationStepRun`.

- [ ] **Step 1: Test ordered steps, retries, continue-on-error, and secret redaction**

```ts
const run = await executeAutomationScenario({ ownerId: "owner-a", scenarioId, triggerType: "manual" });
assert.deepEqual(run.steps.map((step) => step.status), ["success", "failed", "success"]);
assert.doesNotMatch(JSON.stringify(run), /secret-token/u);
```

- [ ] **Step 2: Test SSRF rejection**

```ts
await assert.rejects(() => assertSafeAutomationUrl("http://169.254.169.254/latest/meta-data"), /blocked_target/u);
await assert.rejects(() => assertSafeAutomationUrl("http://127.0.0.1:3000"), /blocked_target/u);
```

- [ ] **Step 3: Implement run persistence and topological execution**

Persist a step before and after execution, cap retries, redact secret keys, and set final run status from actual step results.

- [ ] **Step 4: Implement safe HTTP and tool executors**

Resolve DNS, reject prohibited addresses before each redirect, allow only HTTP methods declared by the action, cap body size, and apply credentials server-side.

- [ ] **Step 5: Replace generated fake-success run route**

Return the actual persisted run and a 422 preflight response when actions or connections are missing.

- [ ] **Step 6: Run tests and commit**

Commit: `feat: execute and persist automation runs`

---

### Task 5: Functional Automation tabs and node inspector

**Files:**
- Modify: `components/Automation/AutomationView.tsx`
- Create: `components/Automation/AutomationTabs.tsx`
- Create: `components/Automation/ActionPicker.tsx`
- Create: `components/Automation/ConnectionManager.tsx`
- Create: `components/Automation/RunHistory.tsx`
- Create: `components/Automation/TemplateGallery.tsx`
- Create: `components/Automation/AutomationGuide.tsx`
- Test: `tests/automation-ui-contract.test.ts`

**Interfaces:**
- Consumes registries, scenarios, runs, and masked credentials.

- [ ] **Step 1: Add UI source-contract tests for all five tabs and real logos**

Assert Scenario, Templates, Execution History, Connection Management, and User Guide are clickable and `ModuleGlyph` is absent.

- [ ] **Step 2: Split the view and add controlled tab state**

```tsx
const [tab, setTab] = useState<AutomationTab>("scenario");
<AutomationTabs value={tab} onChange={setTab} />
```

- [ ] **Step 3: Add searchable action picker and app-specific credentials**

Render required fields from the registry, keep secrets blank on edit, and block run with inline preflight issues.

- [ ] **Step 4: Add template, run, connection, and guide screens**

Use actual APIs, empty states, loading states, owner-scoped records, and no placeholder success data.

- [ ] **Step 5: Run tests and commit**

Commit: `feat: make automation tabs functional`

---

### Task 6: Automation verification

**Files:**
- Modify: `tests/automation-ui-contract.test.ts`
- Modify: `tests/automation-execution-engine.test.ts`

- [ ] Run targeted automation tests: `npm test -- --test-name-pattern automation`
- [ ] Run type check: `npm run typecheck`
- [ ] Run build: `npm run build`
- [ ] Verify in browser at 1024px and 1440px: tabs, icons, node action selection, missing credential block, test run, execution detail.
- [ ] Commit: `test: verify automation studio expansion`

