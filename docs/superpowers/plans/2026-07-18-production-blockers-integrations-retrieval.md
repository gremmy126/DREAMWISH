# Production Blockers, Integrations, and Retrieval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the live MFA, non-Gmail connection, automation diagnosis, memory/CRM/ERP recall, Polar portal, and raw Markdown display failures without weakening owner isolation or secret handling.

**Architecture:** Keep the current repositories and provider adapters, but introduce stable actionable-error and owner-knowledge boundaries shared by routes and UI. Replace the split legacy/new integration presentation with the canonical automation app registry, and render AI output through one deterministic safe Markdown model.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.7, Zod 4, PostgreSQL through `postgres`, owner-scoped JSON fallback, Polar SDK 0.48.1, Node 22 test harness.

## Global Constraints

- Never generate or rotate TOTP encryption keys automatically.
- Never expose OAuth Client Secrets, tokens, TOTP secrets, provider response bodies, or local database keys in a DTO or log.
- Every connection, memory, Knowledge, file, CRM, ERP, and billing read is owner-scoped.
- Only approved memories are retrievable; pending, rejected, forgotten, and deleted records are excluded.
- Adapter-less actions are blocked before activation and before queue insertion.
- An actionable error always identifies the failing location, safe reason, exact recovery steps, retryability, and request ID.
- Markdown syntax markers are consumed by rendering; code, URLs, emoji, Korean, numbers, and citation identifiers remain intact.
- `scripts/run-tests.mjs` loads the complete suite for every `npm.cmd test`; a RED run is valid only when the new assertion fails for the intended missing behavior.
- Follow RED → GREEN → full verification → commit for every task.

## File Structure

- `src/lib/api/actionable-error.ts`: common safe error DTO and request-ID helpers.
- `src/lib/auth/totp.service.ts`, `app/api/auth/totp/_shared.ts`: stable MFA configuration/storage error classification.
- `src/lib/automation/app-registry.ts`: canonical provider-specific auth capabilities and labels.
- `components/integrations/AppConnectionPanel.tsx`: single connection UI for legacy and new apps.
- `src/lib/automation/runtime/validation-issue.ts`: node/field-specific validation DTO.
- `src/lib/automation/runtime/automation-error-catalog.ts`: provider/runtime error classification without losing safe telemetry.
- `src/lib/memory/owner-knowledge-retriever.ts`: shared approved-memory/Knowledge/file/CRM/ERP retrieval.
- `src/lib/billing/polar-portal.service.ts`: entitlement-aware portal session creation and classified failure.
- `src/lib/chat/safe-markdown.ts`: deterministic display blocks consumed by Chat and Deep Research.

---

### Task 1: Expose exact MFA configuration and storage failures

**Files:**
- Create: `src/lib/api/actionable-error.ts`
- Modify: `src/lib/auth/totp.types.ts`
- Modify: `src/lib/auth/totp.service.ts`
- Modify: `app/api/auth/totp/_shared.ts`
- Modify: `components/Settings/AuthenticatorSettingsCard.tsx`
- Modify: `app/api/admin/system/status/route.ts`
- Modify: `.env.example`
- Test: `tests/auth-totp-domain.test.ts`
- Test: `tests/authenticator-ui-contract.test.ts`
- Test: `tests/admin-workspace.test.ts`

**Interfaces:**
- Produces: `ActionableErrorDto`, `createRequestId()`, `TotpSecurityErrorCode` values `AUTH_SECURITY_KEY_NOT_CONFIGURED` and `AUTH_TOTP_STORAGE_UNAVAILABLE`.
- Consumes: existing `TotpSecurityError`, `TOTP_ERROR_MESSAGES`, `AuthenticatorSettingsCard` fetch contract.

- [ ] **Step 1: Write failing route and UI assertions**

```ts
test("TOTP config failures identify the missing server keys", async () => {
  await withEnv({ AUTH_TOTP_ENCRYPTION_KEY: "", AUTH_SECURITY_HASH_KEY: "" }, async () => {
    const response = await enrollRoute.POST(authenticatedRequest("/api/auth/totp/enroll"));
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.error.code, "AUTH_SECURITY_KEY_NOT_CONFIGURED");
    assert.deepEqual(body.error.missingConfiguration, [
      "AUTH_TOTP_ENCRYPTION_KEY",
      "AUTH_SECURITY_HASH_KEY"
    ]);
    assert.equal(body.error.retryable, false);
  });
});

test("authenticator UI renders the server recovery steps", () => {
  const source = fs.readFileSync("components/Settings/AuthenticatorSettingsCard.tsx", "utf8");
  assert.match(source, /error\.solution\.map/u);
  assert.match(source, /관리자 조치 필요/u);
});
```

- [ ] **Step 2: Run RED and verify the intended assertions fail**

Run: `npm.cmd test`

Expected: FAIL because TOTP config failures still return the generic message and the UI only accepts a string error.

- [ ] **Step 3: Add the common safe error DTO and exact TOTP mapping**

```ts
export type ActionableErrorDto = {
  code: string;
  title: string;
  reason: string;
  solution: string[];
  action: { kind: string; label: string; href?: string } | null;
  retryable: boolean;
  requestId: string;
  missingConfiguration?: string[];
};

export function actionableTotpError(error: unknown): {
  status: number;
  error: ActionableErrorDto;
} {
  if (error instanceof TotpSecurityError && error.code === "AUTH_SECURITY_KEY_NOT_CONFIGURED") {
    return {
      status: 503,
      error: {
        code: error.code,
        title: "인증기 서버 보안 키가 구성되지 않았습니다.",
        reason: "TOTP Secret을 안전하게 암호화·검증할 서버 키가 없습니다.",
        solution: ["Railway web 서비스에 두 보안 변수를 설정합니다.", "서비스를 재배포한 뒤 다시 등록합니다."],
        action: null,
        retryable: false,
        requestId: createRequestId(),
        missingConfiguration: ["AUTH_TOTP_ENCRYPTION_KEY", "AUTH_SECURITY_HASH_KEY"]
      }
    };
  }
  return fallbackTotpError(error);
}
```

Admin status returns booleans only:

```ts
totp: {
  encryptionKeyConfigured: Boolean(process.env.AUTH_TOTP_ENCRYPTION_KEY?.trim()),
  hashKeyConfigured: Boolean(process.env.AUTH_SECURITY_HASH_KEY?.trim()),
  challengeSecretConfigured: Boolean(process.env.AUTH_MFA_CHALLENGE_SECRET?.trim())
}
```

- [ ] **Step 4: Render structured recovery without leaking values**

```tsx
{error ? (
  <div role="alert">
    <strong>{error.title}</strong>
    <p>{error.reason}</p>
    <ol>{error.solution.map((step) => <li key={step}>{step}</li>)}</ol>
    {!error.retryable ? <span>관리자 조치 필요</span> : null}
  </div>
) : null}
```

- [ ] **Step 5: Run GREEN verification**

Run: `npm.cmd test && npm.cmd run typecheck && npm.cmd run lint`

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```powershell
git add -- src/lib/api/actionable-error.ts src/lib/auth/totp.types.ts src/lib/auth/totp.service.ts app/api/auth/totp/_shared.ts components/Settings/AuthenticatorSettingsCard.tsx app/api/admin/system/status/route.ts .env.example tests/auth-totp-domain.test.ts tests/authenticator-ui-contract.test.ts tests/admin-workspace.test.ts
git commit -m "fix: surface actionable authenticator configuration errors"
```

---

### Task 2: Define provider-specific authentication capabilities

**Files:**
- Modify: `src/lib/automation/app-registry.ts`
- Modify: `src/lib/oauth/oauth-app-config.types.ts`
- Modify: `src/lib/oauth/oauth-provider-registry.ts`
- Modify: `src/lib/oauth/discord-oauth.ts`
- Modify: `src/lib/oauth/slack-oauth.ts`
- Create: `src/lib/oauth/microsoft-oauth.ts`
- Test: `tests/automation-app-registry.test.ts`
- Test: `tests/oauth-user-app-config.test.ts`
- Test: `tests/oauth-provider-verification.test.ts`

**Interfaces:**
- Produces: `AuthCapability`, `CredentialFieldDefinition`, `AutomationAppDefinition.authCapabilities`, `getAuthCapability(appId, capabilityId)`.
- Consumes: existing `AutomationOAuthTarget`, OAuth provider endpoints, service scope maps.

- [ ] **Step 1: Write failing provider-field and action-compatibility tests**

```ts
test("Discord separates user OAuth from bot actions", () => {
  const discord = getAutomationApp("discord")!;
  assert.deepEqual(discord.authCapabilities.map((item) => item.id), ["discord_oauth", "discord_bot"]);
  assert.deepEqual(discord.authCapabilities[1].fields.map((field) => field.id), ["botToken", "guildId"]);
  assert.ok(discord.authCapabilities[1].supportsActions.includes("send-message"));
  assert.equal(discord.authCapabilities[0].supportsActions.includes("send-message"), false);
});

test("Microsoft uses provider-native field labels", () => {
  const outlook = getAutomationApp("outlook")!;
  const oauth = outlook.authCapabilities[0];
  assert.deepEqual(oauth.fields.map((field) => field.label), [
    "Application (client) ID",
    "Client Secret",
    "Tenant ID"
  ]);
});
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd test`

Expected: FAIL because every OAuth app currently shares `Client ID`/`Client Secret` and Discord action capability is not separated.

- [ ] **Step 3: Introduce the capability model and exact provider fields**

```ts
export type AuthCapability = {
  id: string;
  kind: "oauth2" | "oauth1" | "api_key" | "token" | "service_account";
  label: string;
  fields: CredentialFieldDefinition[];
  requiredScopes: string[];
  supportsActions: string[];
  setupUrl: string;
  redirectPath?: string;
};

export type CredentialFieldDefinition = {
  id: string;
  label: string;
  secret: boolean;
  required: boolean;
  placeholder?: string;
  help: string;
};
```

Populate Google, Microsoft, Slack, Notion, GitHub, Discord, Dropbox, X, and every current direct-token app from the approved design. `Tenant ID` defaults to `common` only when the user explicitly selects multi-tenant mode.

- [ ] **Step 4: Make scope resolution capability-aware**

```ts
export function resolveRequiredScopes(appId: string, capabilityId: string, actionIds: string[]) {
  const capability = getAuthCapability(appId, capabilityId);
  if (!capability) throw new OAuthConfigurationError("AUTH_CAPABILITY_NOT_FOUND");
  const unsupported = actionIds.filter((id) => !capability.supportsActions.includes(id));
  if (unsupported.length) {
    throw new OAuthConfigurationError("AUTH_CAPABILITY_ACTION_MISMATCH", { unsupported });
  }
  return [...new Set(capability.requiredScopes)].sort();
}
```

- [ ] **Step 5: Run GREEN verification**

Run: `npm.cmd test && npm.cmd run typecheck`

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```powershell
git add -- src/lib/automation/app-registry.ts src/lib/oauth/oauth-app-config.types.ts src/lib/oauth/oauth-provider-registry.ts src/lib/oauth/discord-oauth.ts src/lib/oauth/slack-oauth.ts src/lib/oauth/microsoft-oauth.ts tests/automation-app-registry.test.ts tests/oauth-user-app-config.test.ts tests/oauth-provider-verification.test.ts
git commit -m "feat: define provider specific connection capabilities"
```

---

### Task 3: Replace the legacy OAuth UI bypass with one connection panel

**Files:**
- Create: `components/integrations/AppConnectionPanel.tsx`
- Modify: `components/integrations/IntegrationCenter.tsx`
- Modify: `components/integrations/KeyCredentialPanel.tsx`
- Modify: `components/integrations/OAuthAppConfigPanel.tsx`
- Modify: `app/api/integrations/[appId]/oauth-config/route.ts`
- Modify: `app/api/integrations/[appId]/oauth/start/route.ts`
- Test: `tests/oauth-user-credentials-flow.test.ts`
- Test: `tests/integration-connection-truth.test.ts`
- Test: `tests/integration-redirect-ui.test.ts`

**Interfaces:**
- Consumes: `AutomationAppDefinition.authCapabilities`, existing public OAuth config DTO, verified connection DTO.
- Produces: `AppConnectionPanel({ appId, onChanged })` and API `selectedCapabilityId` persistence.

- [ ] **Step 1: Write failing UI source contract tests**

```ts
test("IntegrationCenter does not filter canonical apps behind legacy cards", () => {
  const source = fs.readFileSync("components/integrations/IntegrationCenter.tsx", "utf8");
  assert.doesNotMatch(source, /AUTOMATION_APPS\.filter\([\s\S]*connector\.id === app\.id/u);
  assert.match(source, /AUTOMATION_APPS\.map/u);
  assert.match(source, /AppConnectionPanel/u);
});

test("OAuth config saves the selected provider capability", async () => {
  const response = await oauthConfigRoute.PUT(requestWithJson({
    capabilityId: "discord_bot",
    fields: { botToken: "secret", guildId: "123" }
  }), context("discord"));
  const body = await response.json();
  assert.equal(body.config.capabilityId, "discord_bot");
  assert.equal(JSON.stringify(body).includes("secret"), false);
});
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd test`

Expected: FAIL because legacy connector IDs are filtered out of the user-managed app list and config does not bind a capability.

- [ ] **Step 3: Add the unified panel**

```tsx
export function AppConnectionPanel({ appId, onChanged }: Props) {
  const app = getAutomationApp(appId);
  const [capabilityId, setCapabilityId] = useState(app?.authCapabilities[0]?.id || "");
  if (!app) return <IntegrationErrorPanel message="지원하지 않는 앱입니다." />;
  const capability = app.authCapabilities.find((item) => item.id === capabilityId) || null;
  return (
    <section>
      <CapabilityPicker app={app} value={capabilityId} onChange={setCapabilityId} />
      {capability?.kind === "oauth2" ? (
        <OAuthAppConfigPanel app={app} capability={capability} onChanged={onChanged} />
      ) : (
        <KeyCredentialPanel app={app} capability={capability} onChanged={onChanged} />
      )}
    </section>
  );
}
```

Render `AUTOMATION_APPS.map(...)` without removing Gmail, Drive, Calendar, Slack, Notion, GitHub, or Discord. Legacy summary cards may select the same canonical app ID but may not start a second OAuth flow.

- [ ] **Step 4: Bind start/callback to the immutable capability version**

```ts
const config = await getActiveOAuthAppConfig(owner.uid, appId, body.capabilityId);
if (!config) throw new OAuthFlowError("OAUTH_APP_CONFIG_REQUIRED", 409);
const session = await issueOAuthAuthorizationSession({
  ownerId: owner.uid,
  appId,
  capabilityId: config.capabilityId,
  configId: config.id,
  configVersion: config.version
});
```

- [ ] **Step 5: Run GREEN verification**

Run: `npm.cmd test && npm.cmd run typecheck && npm.cmd run lint`

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```powershell
git add -- components/integrations/AppConnectionPanel.tsx components/integrations/IntegrationCenter.tsx components/integrations/KeyCredentialPanel.tsx components/integrations/OAuthAppConfigPanel.tsx app/api/integrations/[appId]/oauth-config/route.ts app/api/integrations/[appId]/oauth/start/route.ts tests/oauth-user-credentials-flow.test.ts tests/integration-connection-truth.test.ts tests/integration-redirect-ui.test.ts
git commit -m "fix: unify app specific connection setup"
```

---

### Task 4: Preserve field-level automation validation and provider diagnoses

**Files:**
- Create: `src/lib/automation/runtime/validation-issue.ts`
- Modify: `src/lib/automation/runtime/automation-error-catalog.ts`
- Modify: `src/lib/automation/runtime/execution-diagnosis.service.ts`
- Modify: `src/lib/automation/runtime/workflow-validator.ts`
- Modify: `src/lib/automation/runtime/execution-enqueue.service.ts`
- Modify: `app/api/automation/scenarios/[scenarioId]/run/route.ts`
- Modify: `app/api/automation/workflows/[workflowId]/activate/route.ts`
- Modify: `components/Automation/ExecutionDiagnosisCard.tsx`
- Modify: `components/Automation/ActionInputForm.tsx`
- Test: `tests/automation-execution-diagnostics.test.ts`
- Test: `tests/workflow-activation-validation.test.ts`
- Test: `tests/automation-diagnostics-ui.test.ts`

**Interfaces:**
- Produces: `ActionableValidationIssue`, `classifyAutomationFailure(error)`, `ExecutionDiagnosis.fieldPath`, `ExecutionDiagnosis.providerStatus`.
- Consumes: Zod issues, adapter error metadata, queue preflight findings.

- [ ] **Step 1: Write failing detailed-diagnosis tests**

```ts
test("invalid action input identifies the node and field", async () => {
  const result = await validateWorkflowForActivation(ownerId, scenarioWithInvalidEmail());
  assert.equal(result.valid, false);
  assert.deepEqual(result.issues[0], {
    code: "INVALID_FIELD",
    nodeId: "send-email-1",
    actionId: "gmail.send-email",
    fieldPath: "input.to",
    reason: "이메일 주소 형식이 아닙니다.",
    expected: "name@example.com",
    received: "문자열 8자",
    solution: ["받는 사람에 유효한 이메일 주소를 입력합니다."]
  });
});

test("provider request telemetry survives safe normalization", () => {
  const normalized = classifyAutomationFailure(Object.assign(new Error("secret body"), {
    code: "ACTION_FAILED", status: 404, apiRequestId: "req_123", fieldPath: "channel"
  }));
  assert.equal(normalized.code, "RESOURCE_NOT_FOUND");
  assert.equal(normalized.providerStatus, 404);
  assert.equal(normalized.apiRequestId, "req_123");
  assert.equal(normalized.message.includes("secret body"), false);
});
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd test`

Expected: FAIL because generic `ACTION_FAILED` discards safe provider detail and activation routes return a generic top-level message.

- [ ] **Step 3: Implement the stable issue and failure classifiers**

```ts
export type ActionableValidationIssue = {
  code: "INVALID_FIELD" | "CONNECTION_REQUIRED" | "SCOPE_MISSING" | "ADAPTER_UNAVAILABLE";
  nodeId: string;
  actionId: string;
  fieldPath: string | null;
  reason: string;
  expected: string | null;
  received: string | null;
  solution: string[];
};

export function classifyAutomationFailure(error: unknown): NormalizedAutomationFailure {
  const safe = readSafeAdapterMetadata(error);
  const code = safe.status === 404 ? "RESOURCE_NOT_FOUND"
    : safe.status === 422 ? "INVALID_FIELD"
    : safe.status === 401 || safe.status === 403 ? "PROVIDER_AUTH_FAILED"
    : safe.status === 429 ? "RATE_LIMITED"
    : safe.status && safe.status >= 500 ? "PROVIDER_UNAVAILABLE"
    : toAutomationErrorCode(safe.code, safe.status);
  return { ...getAutomationErrorDescriptor(code), ...safe, code };
}
```

Only allow `status`, `apiRequestId`, `fieldPath`, `retryAfterMs`, `rateLimitRemaining`, and adapter latency from provider errors.

- [ ] **Step 4: Return and render the exact issues**

```ts
if (!validation.valid) {
  return NextResponse.json({
    ok: false,
    error: {
      code: "WORKFLOW_VALIDATION_FAILED",
      title: "실행 전에 수정할 항목이 있습니다.",
      reason: `${validation.issues.length}개 입력 또는 연결 검사가 실패했습니다.`,
      solution: ["표시된 노드와 필드를 수정한 뒤 다시 실행합니다."],
      requestId: createRequestId(),
      retryable: false
    },
    issues: validation.issues
  }, { status: 422 });
}
```

- [ ] **Step 5: Run GREEN verification**

Run: `npm.cmd test && npm.cmd run typecheck && npm.cmd run lint`

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```powershell
git add -- src/lib/automation/runtime/validation-issue.ts src/lib/automation/runtime/automation-error-catalog.ts src/lib/automation/runtime/execution-diagnosis.service.ts src/lib/automation/runtime/workflow-validator.ts src/lib/automation/runtime/execution-enqueue.service.ts app/api/automation/scenarios/[scenarioId]/run/route.ts app/api/automation/workflows/[workflowId]/activate/route.ts components/Automation/ExecutionDiagnosisCard.tsx components/Automation/ActionInputForm.tsx tests/automation-execution-diagnostics.test.ts tests/workflow-activation-validation.test.ts tests/automation-diagnostics-ui.test.ts
git commit -m "fix: retain actionable automation failure details"
```

---

### Task 5: Block unsupported authentication and adapter combinations before queueing

**Files:**
- Modify: `src/lib/automation/adapters/adapter-availability.ts`
- Modify: `src/lib/automation/adapters/action-adapter.registry.ts`
- Modify: `src/lib/automation/runtime/workflow-validator.ts`
- Modify: `src/lib/automation/runtime/execution-enqueue.service.ts`
- Modify: `components/Automation/ActionPicker.tsx`
- Modify: `components/Automation/DurableConnectionPanel.tsx`
- Test: `tests/action-adapter-contract.test.ts`
- Test: `tests/workflow-activation-validation.test.ts`
- Test: `tests/automation-action-ui.test.ts`

**Interfaces:**
- Produces: `getExecutableActionCapability(appId, actionId, authCapabilityId)` and preflight issue `AUTH_CAPABILITY_ACTION_MISMATCH`.
- Consumes: `AutomationAppDefinition.authCapabilities`, concrete adapter manifest, verified connection public DTO.

- [ ] **Step 1: Write failing picker and enqueue tests**

```ts
test("Discord user OAuth cannot queue a bot message action", async () => {
  const result = await preflightScenarioExecution({
    ownerId, scenario: discordMessageScenario(), connections: [discordUserOAuthConnection()]
  });
  assert.equal(result.ok, false);
  assert.equal(result.findings[0].code, "AUTH_CAPABILITY_ACTION_MISMATCH");
});

test("picker marks adapter-less catalog actions unavailable", () => {
  for (const action of getActionPickerItems()) {
    if (!hasConcreteAdapter(action.appId, action.id, action.version)) {
      assert.equal(action.available, false);
      assert.equal(action.disabledReasonCode, "ADAPTER_UNAVAILABLE");
    }
  }
});
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd test`

Expected: FAIL because verified connection status alone currently allows some incompatible action/auth pairs.

- [ ] **Step 3: Derive executability from the concrete adapter and capability manifests**

```ts
export function getExecutableActionCapability(appId: string, actionId: string, capabilityId: string) {
  const adapter = getRegisteredActionAdapter(appId, actionId);
  const capability = getAuthCapability(appId, capabilityId);
  return {
    executable: Boolean(adapter && capability?.supportsActions.includes(actionId)),
    adapterVersion: adapter?.version || null,
    missingScopes: adapter && capability
      ? adapter.requiredScopes.filter((scope) => !capability.requiredScopes.includes(scope))
      : []
  };
}
```

- [ ] **Step 4: Run GREEN verification**

Run: `npm.cmd test && npm.cmd run typecheck`

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```powershell
git add -- src/lib/automation/adapters/adapter-availability.ts src/lib/automation/adapters/action-adapter.registry.ts src/lib/automation/runtime/workflow-validator.ts src/lib/automation/runtime/execution-enqueue.service.ts components/Automation/ActionPicker.tsx components/Automation/DurableConnectionPanel.tsx tests/action-adapter-contract.test.ts tests/workflow-activation-validation.test.ts tests/automation-action-ui.test.ts
git commit -m "fix: block incompatible automation actions before queueing"
```

---

### Task 6: Build one owner-scoped knowledge retriever

**Files:**
- Create: `src/lib/memory/owner-knowledge-retriever.ts`
- Create: `src/lib/memory/retrieval-intent.ts`
- Modify: `src/lib/memory/memory-search.ts`
- Modify: `src/lib/ai/business-tools.ts`
- Test: `tests/owner-knowledge-retriever.test.ts`
- Test: `tests/approved-memory-recall.test.ts`
- Test: `tests/ai-business-tools.test.ts`

**Interfaces:**
- Produces: `retrieveOwnerKnowledge(input: OwnerKnowledgeQuery): Promise<OwnerKnowledgeResult>`.
- Consumes: `readMemoryDb`, Knowledge/file repositories, `listCustomers`, `listCrmDeals`, `listCrmTasks`, `getErpSnapshot`.

- [ ] **Step 1: Write failing inventory, entity, and state tests**

```ts
test("inventory recall returns every approved source category without forgotten memory", async () => {
  const result = await retrieveOwnerKnowledge({ ownerId: ownerA, query: "내가 저장한 모든 정보를 알려줘", limit: 50 });
  assert.equal(result.intent, "inventory");
  assert.ok(result.items.some((item) => item.source === "approved_memory"));
  assert.ok(result.items.some((item) => item.source === "knowledge"));
  assert.ok(result.items.some((item) => item.source === "file"));
  assert.equal(result.items.some((item) => item.status !== "approved" && item.source === "approved_memory"), false);
});

test("a customer name alone triggers exact CRM lookup", async () => {
  const result = await retrieveOwnerKnowledge({ ownerId: ownerA, query: "드림상사", limit: 20 });
  assert.equal(result.intent, "entity");
  assert.ok(result.items.some((item) => item.uri.startsWith("crm://customer/")));
});

test("retrieval never crosses owner boundaries", async () => {
  const result = await retrieveOwnerKnowledge({ ownerId: ownerB, query: "owner A secret", limit: 50 });
  assert.equal(result.items.some((item) => item.text.includes("owner A secret")), false);
});
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd test`

Expected: FAIL because Chat's approved memory path does not include Knowledge/files and business detection ignores a customer name without a business keyword.

- [ ] **Step 3: Define the shared retrieval types and intent classifier**

```ts
export type OwnerKnowledgeSource = "approved_memory" | "knowledge" | "file" | "crm" | "erp";
export type RetrievalIntent = "focused" | "inventory" | "entity" | "business";
export type OwnerKnowledgeQuery = { ownerId: string; query: string; limit: number };
export type OwnerKnowledgeItem = {
  id: string; source: OwnerKnowledgeSource; uri: string; title: string; text: string;
  relevance: number; updatedAt: string; status: "approved" | "current";
};
export type OwnerKnowledgeResult = {
  intent: RetrievalIntent; items: OwnerKnowledgeItem[]; contextText: string;
  sources: SourceDocument[]; degradedSources: Array<{ source: OwnerKnowledgeSource; code: string }>;
  truncated: boolean; nextCursor: string | null;
};
```

Inventory phrases include Korean/English variants of “what do you remember”, “all stored information”, and “memory list”. Exact entity matching runs before keyword-only business detection.

- [ ] **Step 4: Implement per-source isolation and graceful degradation**

```ts
const settled = await Promise.allSettled([
  loadApprovedMemories(input.ownerId),
  loadKnowledgeNotes(input.ownerId),
  loadFileRecords(input.ownerId),
  loadBusinessRecords(input.ownerId)
]);
const { items, degradedSources } = mergeSettledOwnerSources(settled, input.ownerId);
return rankAndBoundOwnerKnowledge(items, degradedSources, input);
```

Every loader repeats owner and lifecycle-state filtering after its repository call. A rejected promise contributes a stable degraded code and no raw error message.

- [ ] **Step 5: Run GREEN verification**

Run: `npm.cmd test && npm.cmd run typecheck`

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```powershell
git add -- src/lib/memory/owner-knowledge-retriever.ts src/lib/memory/retrieval-intent.ts src/lib/memory/memory-search.ts src/lib/ai/business-tools.ts tests/owner-knowledge-retriever.test.ts tests/approved-memory-recall.test.ts tests/ai-business-tools.test.ts
git commit -m "feat: unify owner scoped knowledge retrieval"
```

---

### Task 7: Use the shared retriever in Chat and Deep Research

**Files:**
- Modify: `app/api/ai/chat/route.ts`
- Modify: `app/api/ai/chat/stream/route.ts`
- Modify: `src/lib/ai/prompts.ts`
- Modify: `src/lib/deep-research/research-runner.ts`
- Modify: `src/lib/deep-research/deep-research.types.ts`
- Modify: `components/Chat/ChatView.tsx`
- Modify: `components/Chat/ResearchWorkspace.tsx`
- Test: `tests/owner-scoped-chat.test.ts`
- Test: `tests/deep-research-engine.test.ts`
- Test: `tests/deep-research-display.test.ts`

**Interfaces:**
- Consumes: `retrieveOwnerKnowledge()` from Task 6.
- Produces: Chat `retrievalDiagnostics` and Research `degradedSources`; removes silent catch-to-empty behavior.

- [ ] **Step 1: Write failing Chat and Research integration tests**

```ts
test("chat returns approved memory, Knowledge, CRM, and ERP sources", async () => {
  const response = await chatRoute.POST(ownerRequest("내가 기억한 정보와 드림상사 거래를 같이 알려줘"));
  const body = await response.json();
  assert.ok(body.data.sources.some((source: SourceDocument) => source.path.startsWith("memory://")));
  assert.ok(body.data.sources.some((source: SourceDocument) => source.path.startsWith("knowledge://")));
  assert.ok(body.data.sources.some((source: SourceDocument) => source.path.startsWith("crm://")));
  assert.ok(body.data.sources.some((source: SourceDocument) => source.path.startsWith("erp://")));
});

test("research reports a degraded local source instead of silently dropping it", async () => {
  const job = await runResearchWithFailingKnowledgeStore();
  assert.deepEqual(job.degradedSources, [{ source: "knowledge", code: "KNOWLEDGE_STORAGE_UNAVAILABLE" }]);
  assert.equal(job.status, "completed");
});
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd test`

Expected: FAIL because Chat and Research still build separate partial contexts and use `.catch()` to return empty data.

- [ ] **Step 3: Replace separate context builders with one retrieval call**

```ts
const knowledge = await retrieveOwnerKnowledge({ ownerId: owner.uid, query: message, limit: 50 });
const messages = appendOwnerKnowledgeToMessages(baseMessages, knowledge.contextText);
sources = mergeSources(sources, knowledge.sources);
retrievalDiagnostics = { degradedSources: knowledge.degradedSources, truncated: knowledge.truncated };
```

Deep Research calls the same function regardless of `includeCrm`/`includeErp`; those settings limit which source types are selected, not whether the query regex happens to contain a business keyword.

- [ ] **Step 4: Stream diagnostics and render a non-blocking warning**

```ts
send("retrieval", {
  degradedSources: knowledge.degradedSources,
  truncated: knowledge.truncated,
  nextCursor: knowledge.nextCursor
});
```

- [ ] **Step 5: Run GREEN verification**

Run: `npm.cmd test && npm.cmd run typecheck && npm.cmd run lint`

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```powershell
git add -- app/api/ai/chat/route.ts app/api/ai/chat/stream/route.ts src/lib/ai/prompts.ts src/lib/deep-research/research-runner.ts src/lib/deep-research/deep-research.types.ts components/Chat/ChatView.tsx components/Chat/ResearchWorkspace.tsx tests/owner-scoped-chat.test.ts tests/deep-research-engine.test.ts tests/deep-research-display.test.ts
git commit -m "fix: retrieve all approved owner knowledge in ai flows"
```

---

### Task 8: Make Polar portal entitlement-aware and actionable

**Files:**
- Create: `src/lib/billing/polar-portal.service.ts`
- Modify: `src/lib/billing/polar.ts`
- Modify: `app/api/billing/portal/route.ts`
- Modify: `components/billing/SubscriptionSettingsCard.tsx`
- Modify: `app/api/billing/status/route.ts`
- Test: `tests/polar-routes.test.ts`
- Test: `tests/subscription-settings.test.ts`
- Test: `tests/polar-entitlement.test.ts`

**Interfaces:**
- Produces: `createPolarPortalSession(ownerId): Promise<{ portalUrl: string }>` and `PolarPortalError` stable codes.
- Consumes: `getBillingEntitlement`, `getPolarClient`, stored `polarCustomerId`.

- [ ] **Step 1: Write failing no-customer, customer-ID, and config tests**

```ts
test("portal rejects users without a Polar customer with a checkout action", async () => {
  const response = await portalRoute.POST(ownerRequest());
  const body = await response.json();
  assert.equal(response.status, 409);
  assert.equal(body.error.code, "POLAR_CUSTOMER_NOT_FOUND");
  assert.deepEqual(body.error.action, { kind: "open_pricing", label: "요금제 보기", href: "/pricing" });
});

test("portal uses the durable Polar customer id", async () => {
  await seedEntitlement({ ownerId, provider: "polar", polarCustomerId: "cust_123", status: "active" });
  await portalRoute.POST(ownerRequest());
  assert.deepEqual(polarCreateCalls[0], { customerId: "cust_123", returnUrl: "https://dreamwish.co.kr/?view=settings&billing=return" });
});
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd test`

Expected: FAIL because the route always uses `externalCustomerId` and the UI shows the button when provider is null.

- [ ] **Step 3: Implement service classification and safe origin allowlist**

```ts
export async function createPolarPortalSession(ownerId: string) {
  const entitlement = await getBillingEntitlement(ownerId);
  if (entitlement.provider !== "polar" || !entitlement.polarCustomerId) {
    throw new PolarPortalError("POLAR_CUSTOMER_NOT_FOUND", 409);
  }
  const session = await getPolarClient().customerSessions.create({
    customerId: entitlement.polarCustomerId,
    returnUrl: `${getAppOrigin()}/?view=settings&billing=return`
  });
  return { portalUrl: session.customerPortalUrl };
}
```

Map missing env, 401/403, 404, sandbox mismatch, provider 5xx/timeout, and invalid app origin to the stable codes in the spec.

- [ ] **Step 4: Gate the button by actual Polar customer state**

```tsx
{entitlement.provider === "polar" && entitlement.polarCustomerId ? (
  <PortalButton onClick={openPortal} busy={portalLoading} />
) : entitlement.provider === null ? (
  <Link href="/pricing">요금제 및 결제 시작</Link>
) : null}
```

- [ ] **Step 5: Run GREEN verification**

Run: `npm.cmd test && npm.cmd run typecheck && npm.cmd run lint`

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```powershell
git add -- src/lib/billing/polar-portal.service.ts src/lib/billing/polar.ts app/api/billing/portal/route.ts components/billing/SubscriptionSettingsCard.tsx app/api/billing/status/route.ts tests/polar-routes.test.ts tests/subscription-settings.test.ts tests/polar-entitlement.test.ts
git commit -m "fix: open Polar portal only for verified customers"
```

---

### Task 9: Render safe structured Markdown in Chat and Research

**Files:**
- Create: `src/lib/chat/safe-markdown.ts`
- Create: `components/Chat/SafeMarkdownContent.tsx`
- Modify: `src/lib/chat/chat-answer-display.ts`
- Modify: `src/lib/deep-research/research-report.ts`
- Modify: `components/Chat/ChatView.tsx`
- Modify: `components/Chat/DeepResearchPanel.tsx`
- Modify: `components/Chat/ResearchWorkspace.tsx`
- Test: `tests/chat-answer-display.test.ts`
- Test: `tests/deep-research-display.test.ts`
- Test: `tests/chat-safe-markdown.test.ts`

**Interfaces:**
- Produces: `parseSafeMarkdown(markdown): SafeMarkdownBlock[]` and `<SafeMarkdownContent value citationHandler />`.
- Consumes: streamed assistant Markdown and research report sections.

- [ ] **Step 1: Write failing syntax-marker, preservation, and XSS tests**

```ts
test("safe markdown consumes control markers and preserves content punctuation", () => {
  const blocks = parseSafeMarkdown("# 제목\n\n* **중요** 항목\n\n`a*b#c` https://example.com/a#b");
  assert.deepEqual(blocks[0], { type: "heading", level: 1, children: [{ type: "text", value: "제목" }] });
  assert.equal(JSON.stringify(blocks).includes('"value":"*"'), false);
  assert.equal(JSON.stringify(blocks).includes("a*b#c"), true);
  assert.equal(JSON.stringify(blocks).includes("https://example.com/a#b"), true);
});

test("safe markdown blocks raw HTML and javascript URLs", () => {
  const serialized = JSON.stringify(parseSafeMarkdown('<img onerror="alert(1)"> [x](javascript:alert(1))'));
  assert.equal(serialized.includes("onerror"), false);
  assert.equal(serialized.includes("javascript:"), false);
});
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd test`

Expected: FAIL because Chat only removes `**` and the expanded Deep Research panel renders the raw report in `<pre>`.

- [ ] **Step 3: Implement a bounded deterministic parser**

```ts
export type SafeMarkdownBlock =
  | { type: "heading"; level: number; children: InlineNode[] }
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "list"; ordered: boolean; items: InlineNode[][] }
  | { type: "code"; language: string | null; value: string }
  | { type: "quote"; children: InlineNode[] };

export function safeLink(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
```

Parse at most 100,000 characters, 2,000 lines, heading levels 1–6, fenced code, lists, links, emphasis, and `[n]` citations. Treat raw HTML as text after stripping tag delimiters and attributes.

- [ ] **Step 4: Replace raw text/pre rendering with the shared component**

```tsx
<SafeMarkdownContent
  value={message.content}
  onCitation={message.role === "assistant" ? jumpToCitation : undefined}
/>
```

The Markdown export continues to use the unchanged raw `job.report`.

- [ ] **Step 5: Run GREEN and production build**

Run: `npm.cmd test && npm.cmd run typecheck && npm.cmd run lint && npm.cmd run build`

Expected: all commands exit 0 and Next produces a production build.

- [ ] **Step 6: Commit**

```powershell
git add -- src/lib/chat/safe-markdown.ts components/Chat/SafeMarkdownContent.tsx src/lib/chat/chat-answer-display.ts src/lib/deep-research/research-report.ts components/Chat/ChatView.tsx components/Chat/DeepResearchPanel.tsx components/Chat/ResearchWorkspace.tsx tests/chat-answer-display.test.ts tests/deep-research-display.test.ts tests/chat-safe-markdown.test.ts
git commit -m "fix: render chat and research markdown safely"
```

---

### Task 10: Document environment recovery and run the blocker release gate

**Files:**
- Create: `docs/production-troubleshooting.md`
- Modify: `docs/integrations-oauth-setup.md`
- Modify: `docs/polar-checkout-production.md`
- Modify: `.env.example`
- Test: `tests/auth-and-ui-contract.test.ts`
- Test: `tests/automation-diagnostics-ui.test.ts`

**Interfaces:**
- Consumes: all stable error codes and environment names from Tasks 1–9.
- Produces: operator instructions that contain names and issuance locations, never secret values.

- [ ] **Step 1: Write failing documentation contract assertions**

```ts
test("production troubleshooting maps stable errors to exact recovery", () => {
  const text = fs.readFileSync("docs/production-troubleshooting.md", "utf8");
  for (const code of [
    "AUTH_SECURITY_KEY_NOT_CONFIGURED", "OAUTH_APP_CONFIG_REQUIRED",
    "AUTH_CAPABILITY_ACTION_MISMATCH", "WORKER_OFFLINE", "POLAR_CUSTOMER_NOT_FOUND"
  ]) assert.match(text, new RegExp(code, "u"));
  assert.doesNotMatch(text, /(?:sk_live|access_token|client_secret)\s*=\s*\S+/iu);
});
```

- [ ] **Step 2: Run RED**

Run: `npm.cmd test`

Expected: FAIL because the consolidated troubleshooting document does not exist.

- [ ] **Step 3: Write exact recovery documentation**

Document each error code, affected service, environment variable names, provider console location, safe generation/rotation command, redeploy requirement, and verification endpoint. Include Gmail, Microsoft, Slack, Notion, GitHub, Discord, and Dropbox callback examples for local and production origins.

- [ ] **Step 4: Run the full release gate**

Run: `npm.cmd test && npm.cmd run typecheck && npm.cmd run lint && npm.cmd run build`

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```powershell
git add -- docs/production-troubleshooting.md docs/integrations-oauth-setup.md docs/polar-checkout-production.md .env.example tests/auth-and-ui-contract.test.ts tests/automation-diagnostics-ui.test.ts
git commit -m "docs: add exact production recovery guidance"
```

## Completion Gate

- Authenticator errors identify the exact missing key or durable-storage failure and provide a safe recovery action.
- Every listed integration exposes provider-native credentials/scopes and only compatible actions can be selected or queued.
- Automation failures retain field, node, provider status/request ID, retry timing, and a secret-safe resolution.
- Chat and Deep Research retrieve approved memory, Knowledge/files, CRM, and ERP without owner leakage or silent source loss.
- Polar portal access is shown only for a verified Polar customer and every failure has an actionable route.
- Chat and Research render stored Markdown safely without showing control tokens as stray decoration.
- Tests, typecheck, lint, build, and the troubleshooting contract pass.
