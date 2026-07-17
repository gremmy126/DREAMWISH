# User-Managed Integration OAuth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every supported integration use an owner-scoped, provider-verified connection while allowing each user to securely supply their own OAuth Client ID/Secret and exact callback configuration.

**Architecture:** Keep `src/lib/automation/app-registry.ts` as the canonical app/logo/auth registry. Add a focused OAuth app-config repository that encrypts Client Secrets, bind every authorization session to an immutable config version, and inject resolved credentials into the existing provider adapters. The Automation and Integrations pages continue to consume `VerifiedConnectionService`, so no second connection truth is introduced.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.7, PostgreSQL, owner-scoped JSON fallback, AES-256-GCM token encryption, OAuth 2.0 state/PKCE, Node test runner through `npm.cmd test`.

## Global Constraints

- Every OAuth integration uses a user-created provider application; platform integration Client IDs are not the primary path.
- OAuth Client Secret, Access Token, Refresh Token, API Key, and Service Account secrets never appear in public DTOs, logs, chat results, DLQ payloads, or browser persistence.
- OAuth authorization requires owner binding, one-time state, ten-minute expiry, config-version binding, and PKCE wherever the provider supports it.
- A connection becomes `connected` only after a real provider identity/scope verification succeeds.
- `AutomationAppDefinition.logoPath` remains the single app-logo source.
- Automation and Integrations pages consume the same verified connection service and owner-scoped connection records.
- Unsupported auth modes are not invented; only provider-documented OAuth, token, bot, or service-account modes are offered.
- Use PostgreSQL in deployed environments and keep the current owner-scoped JSON fallback for local development without `DATABASE_URL`.
- Write the failing test first, run it to prove RED, make the smallest implementation pass, then run focused and full verification before committing.
- `scripts/run-tests.mjs` always loads every `tests/*.test.ts` file, so every `npm.cmd test` RED/GREEN command runs the complete suite; a RED result is valid only when the newly added assertion fails for the expected missing behavior.
- Do not stage or modify the existing untracked `.claude/` directory.

## Program Execution Order

This plan is one phase of the approved program and is not executed in document-date order.

1. Finish and review Tasks 4-10 of `2026-07-17-authenticator-companion-automation-diagnostics.md` (MFA UI, public-key device pairing, web QR pairing, standalone React Native shell, Android, iPhone).
2. Execute Tasks 1-11 of this user-managed OAuth plan.
3. Execute Tasks 13-15 of `2026-07-17-authenticator-companion-automation-diagnostics.md` (Worker heartbeat, preflight, queued-run diagnostics).
4. Execute Tasks 1-10 of `2026-07-18-portone-domestic-billing.md`.
5. Execute Tasks 11-12A and then Task 16 of `2026-07-17-authenticator-companion-automation-diagnostics.md` (reviewed revenue, Business UI, mobile Push, complete integration evidence).

Do not move a phase forward with Critical or Important review findings. Tasks already completed in the SDD ledger are not reimplemented.

## File Structure

### Canonical definitions

- Modify `src/lib/automation/app-registry.ts`: add OAuth client-field and connection-guide metadata without creating another app registry.
- Modify `src/lib/oauth/oauth.types.ts`: add immutable user OAuth config identifiers and public DTOs.
- Modify `src/lib/oauth/oauth-provider-registry.ts`: keep static endpoints/scopes but stop treating process environment Client ID/Secret as the only source.

### Secret persistence

- Create `src/lib/oauth/oauth-app-config.types.ts`: internal/public config types and status transitions.
- Create `src/lib/repositories/oauth-app-config.repository.ts`: PostgreSQL/JSON persistence, config versioning, encryption, owner isolation, soft revocation.
- Modify `src/lib/automation/runtime/schema.ts`: idempotent schema/columns for OAuth app configs and session config binding.

### Authorization flow

- Modify `src/lib/oauth/oauth-provider-adapter.ts`: consume explicit `OAuthClientCredentials`.
- Modify `src/lib/oauth/oauth.service.ts`: accept credentials rather than reading Client Secret from environment.
- Modify `src/lib/oauth/oauth-authorization-flow.ts`: load owner config, bind session version, build authorization URL.
- Modify `src/lib/repositories/oauth-session.repository.ts`: persist and atomically consume config id/version.
- Modify `src/lib/oauth/oauth-callback.ts`: load the exact approved config version and fail closed on revocation/version mismatch.
- Modify `src/lib/oauth/token.service.ts`: use the connection's config reference for refresh.

### API and UI

- Create `app/api/integrations/[appId]/oauth-config/route.ts`: owner-scoped GET/PUT/DELETE.
- Create `components/integrations/OAuthAppConfigPanel.tsx`: exact redirect URI, Client ID/Secret form, provider guide, connection action.
- Modify `components/integrations/KeyCredentialPanel.tsx`: render OAuth config for OAuth-capable apps and retain direct Credential forms.
- Modify `components/integrations/IntegrationCenter.tsx`: consume the canonical definition and public config status.

### Provider coverage and guidance

- Modify `src/lib/oauth/oauth-provider-adapter.ts`: verify Microsoft and Dropbox paths use explicit owner credentials.
- Modify `src/lib/integrations/verified-connection.service.ts`: derive connectability from owner OAuth config or direct Credential support.
- Modify `src/lib/automation/registry/action-guide.ts`: expose field names, redirect URI, scopes, official setup URL, and remediation without secret values.
- Modify `src/lib/automation/app-registry.ts`: add exact official setup links and OAuth targets for Outlook, Teams, OneDrive, and Dropbox.
- Modify the existing Google, Microsoft, Dropbox, and messaging Adapter modules to cover their executable catalog actions.
- Create `src/lib/automation/adapters/project-management.adapter.ts`, `crm-commerce.adapter.ts`, and `publishing.adapter.ts` for provider-specific external actions.
- Replace the duplicate `IMPLEMENTED_ACTIONS` allowlist with truth derived from concrete registered Adapter support.

### Tests and documentation

- Create `tests/oauth-user-app-config.test.ts`.
- Create `tests/oauth-user-credentials-flow.test.ts`.
- Modify `tests/oauth-integration-flow.test.ts`.
- Modify `tests/oauth-durable-connections.test.ts`.
- Modify `tests/integration-connection-truth.test.ts`.
- Modify `tests/automation-action-guide.test.ts`.
- Create `tests/automation-provider-adapters.test.ts`.
- Create `docs/user-managed-oauth-connections.md`.
- Modify `.env.example`: document encryption keys and mark legacy platform integration OAuth variables as migration-only fallback, if retained.

---

### Task 1: Extend the canonical app registry with connection contracts

**Files:**
- Modify: `src/lib/automation/app-registry.ts`
- Modify: `src/lib/oauth/oauth.types.ts`
- Test: `tests/automation-app-registry.test.ts`
- Test: `tests/oauth-user-app-config.test.ts`

**Interfaces:**
- Produces: `OAuthClientFieldDefinition`, `IntegrationConnectionGuide`, `AutomationAppDefinition.oauthClientFields`, `AutomationAppDefinition.connectionGuide`.
- Consumes: existing `AutomationOAuthTarget`, `AutomationCredentialField`, and `AutomationAppDefinition.logoPath`.

- [ ] **Step 1: Write failing registry contract tests**

```ts
test("every OAuth app declares exact user client fields and a setup guide", () => {
  for (const app of AUTOMATION_APPS.filter((item) => item.oauthTarget)) {
    assert.deepEqual(app.oauthClientFields.map((field) => field.id), ["clientId", "clientSecret"]);
    assert.equal(app.oauthClientFields[1]?.secret, true);
    assert.match(app.connectionGuide.officialSetupUrl, /^https:\/\//u);
    assert.ok(app.connectionGuide.redirectPath.startsWith("/api/integrations/"));
    assert.ok(app.connectionGuide.steps.length >= 3);
  }
});

test("Microsoft and Dropbox apps are connectable from the canonical registry", () => {
  assert.deepEqual(getAutomationApp("outlook")?.oauthTarget, { provider: "microsoft", service: "outlook" });
  assert.deepEqual(getAutomationApp("microsoft-teams")?.oauthTarget, { provider: "microsoft", service: "microsoft-teams" });
  assert.deepEqual(getAutomationApp("onedrive")?.oauthTarget, { provider: "microsoft", service: "onedrive" });
  assert.deepEqual(getAutomationApp("dropbox")?.oauthTarget, { provider: "dropbox", service: "dropbox" });
});
```

- [ ] **Step 2: Run focused tests to verify RED**

Run: `npm.cmd test`

Expected: FAIL because `oauthClientFields` and `connectionGuide` do not exist and Microsoft/Dropbox apps have no `oauthTarget` in the canonical registry.

- [ ] **Step 3: Add the shared definition types and explicit metadata**

```ts
export type OAuthClientFieldDefinition = {
  id: "clientId" | "clientSecret";
  label: string;
  secret: boolean;
  required: true;
  help: string;
};

export type IntegrationConnectionGuide = {
  officialSetupUrl: string;
  redirectPath: string;
  steps: string[];
  scopeHelp: string;
};

export type AutomationAppDefinition = {
  id: string;
  label: string;
  logoPath: string;
  color: string;
  authType: "none" | "oauth" | "api_key" | "token" | "multi_field";
  supportedAuthModes: AutomationAuthMode[];
  oauthTarget?: AutomationOAuthTarget;
  oauthClientFields: OAuthClientFieldDefinition[];
  connectionGuide: IntegrationConnectionGuide;
  verificationKind: string | null;
  credentialFields: AutomationCredentialField[];
  help: string;
};
```

Populate exact provider setup URLs and redirect paths in every OAuth app definition. Keep every existing `logoPath` unchanged.

- [ ] **Step 4: Run focused and type tests**

Run: `npm.cmd test && npm.cmd run typecheck`

Expected: all focused tests pass and TypeScript exits 0.

- [ ] **Step 5: Commit the registry contract**

```powershell
git add -- src/lib/automation/app-registry.ts src/lib/oauth/oauth.types.ts tests/automation-app-registry.test.ts tests/oauth-user-app-config.test.ts
git commit -m "feat: define user managed oauth contracts"
```

---

### Task 2: Persist encrypted owner-scoped OAuth app configurations

**Files:**
- Create: `src/lib/oauth/oauth-app-config.types.ts`
- Create: `src/lib/repositories/oauth-app-config.repository.ts`
- Modify: `src/lib/automation/runtime/schema.ts`
- Test: `tests/oauth-user-app-config.test.ts`

**Interfaces:**
- Produces: `saveOAuthAppConfig`, `getOAuthAppConfig`, `getOAuthAppConfigVersion`, `revokeOAuthAppConfig`, `toPublicOAuthAppConfig`.
- Consumes: `encryptToken`, `decryptToken`, `getPostgres`, `hasPostgresStorage`, owner-scoped JSON store.

- [ ] **Step 1: Add failing encryption, owner isolation, and version tests**

```ts
test("user OAuth app config encrypts the secret and exposes only status", async () => {
  const saved = await repository.saveOAuthAppConfig({
    ownerId: "owner-1",
    appId: "gmail",
    provider: "google",
    clientId: "client-1",
    clientSecret: "secret-value-123",
    redirectUri: "https://dreamwish.co.kr/api/integrations/google/callback"
  });
  assert.equal(saved.version, 1);
  assert.doesNotMatch(JSON.stringify(repository.toPublicOAuthAppConfig(saved)), /secret-value-123|ciphertext/u);
  assert.equal((await repository.getOAuthAppConfig("owner-2", "gmail")), null);
});

test("changing a client secret creates a new immutable version", async () => {
  const first = await save("secret-one");
  const second = await save("secret-two");
  assert.equal(second.version, first.version + 1);
  assert.equal((await repository.getOAuthAppConfigVersion("owner-1", first.id, first.version))?.clientSecret, "secret-one");
  assert.equal((await repository.getOAuthAppConfigVersion("owner-1", second.id, second.version))?.clientSecret, "secret-two");
});
```

- [ ] **Step 2: Run the focused test to prove RED**

Run: `npm.cmd test`

Expected: FAIL because the repository and config types do not exist.

- [ ] **Step 3: Define internal and public config types**

```ts
export type OAuthAppConfigStatus = "active" | "revoked" | "reauthorization_required";

export type OAuthAppConfigRecord = {
  id: string;
  ownerId: string;
  appId: string;
  provider: ConnectableOAuthProviderId;
  clientId: string;
  clientSecretCiphertext: string;
  redirectUri: string;
  version: number;
  status: OAuthAppConfigStatus;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
};

export type ResolvedOAuthAppConfig = Omit<OAuthAppConfigRecord, "clientSecretCiphertext"> & {
  clientSecret: string;
};

export type PublicOAuthAppConfig = Pick<
  OAuthAppConfigRecord,
  "id" | "appId" | "provider" | "clientId" | "redirectUri" | "version" | "status" | "updatedAt"
> & { clientSecretConfigured: boolean };
```

- [ ] **Step 4: Add idempotent PostgreSQL schema and owner-scoped repository methods**

```sql
CREATE TABLE IF NOT EXISTS integration_oauth_app_configs (
  id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  client_id TEXT NOT NULL,
  client_secret_ciphertext TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  config_version INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  PRIMARY KEY (id, config_version),
  UNIQUE (owner_id, app_id, config_version)
);
CREATE INDEX IF NOT EXISTS integration_oauth_app_configs_owner_app_idx
  ON integration_oauth_app_configs(owner_id, app_id, config_version DESC);
```

Implement JSON writes under the existing store lock and PostgreSQL writes in a transaction. Encrypt before persistence and decrypt only in internal `getOAuthAppConfigVersion`.

- [ ] **Step 5: Run repository tests and typecheck**

Run: `npm.cmd test && npm.cmd run typecheck`

Expected: focused tests pass and no public DTO contains secret ciphertext.

- [ ] **Step 6: Commit secure persistence**

```powershell
git add -- src/lib/oauth/oauth-app-config.types.ts src/lib/repositories/oauth-app-config.repository.ts src/lib/automation/runtime/schema.ts tests/oauth-user-app-config.test.ts
git commit -m "feat: persist user oauth app configs"
```

---

### Task 3: Bind authorization sessions to an exact OAuth config version

**Files:**
- Modify: `src/lib/repositories/oauth-session.repository.ts`
- Modify: `src/lib/oauth/oauth-provider-adapter.ts`
- Modify: `src/lib/oauth/oauth.service.ts`
- Modify: `src/lib/oauth/oauth-authorization-flow.ts`
- Modify: `src/lib/oauth/oauth-callback.ts`
- Modify: `src/lib/oauth/token.service.ts`
- Test: `tests/oauth-user-credentials-flow.test.ts`
- Test: `tests/oauth-integration-flow.test.ts`

**Interfaces:**
- Consumes: `getOAuthAppConfig(ownerId, appId)`, `getOAuthAppConfigVersion(ownerId, configId, version)`.
- Produces: `OAuthClientCredentials`, session fields `oauthAppConfigId` and `oauthAppConfigVersion`, credential-explicit provider calls.

- [ ] **Step 1: Write failing credential-injection and version-binding tests**

```ts
test("authorization uses the owner's client id instead of process environment", async () => {
  const url = await beginOAuthAuthorization({ ownerId: "owner-1", appId: "gmail", requestUrl });
  assert.equal(new URL(url).searchParams.get("client_id"), "owner-client-id");
});

test("callback rejects a revoked or changed config version", async () => {
  const session = await beginSessionWithConfigVersion(1);
  await repository.revokeOAuthAppConfig("owner-1", "gmail");
  await assert.rejects(
    () => completeOAuthAuthorization({ ownerId: "owner-1", state: session.state, code: "code" }),
    /OAuth app configuration changed or was revoked/u
  );
});
```

- [ ] **Step 2: Run focused tests to prove RED**

Run: `npm.cmd test`

Expected: FAIL because provider helpers still read environment credentials and sessions do not bind a config version.

- [ ] **Step 3: Introduce explicit credentials at the provider boundary**

```ts
export type OAuthClientCredentials = {
  clientId: string;
  clientSecret: string;
};

export function createProviderAuthorizationUrl(input: {
  target: OAuthAppTarget;
  credentials: OAuthClientCredentials;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  requestedScopes?: string[];
}) {
  return createOAuthAuthorizationUrl({
    provider: input.target.provider,
    service: input.target.service,
    clientId: input.credentials.clientId,
    redirectUri: input.redirectUri,
    state: input.state,
    codeChallenge: input.codeChallenge,
    scopes: input.requestedScopes ?? input.target.scopes
  });
}
```

Apply the same explicit `credentials` input to code exchange and refresh. Never put `clientSecret` into a URL or session row.

- [ ] **Step 4: Persist and consume config binding atomically**

Add `oauth_app_config_id TEXT` and `oauth_app_config_version INTEGER` to `oauth_authorization_sessions`. The session create input must include both values. Callback consumption loads that exact owner-scoped version and rejects missing, revoked, or provider/app mismatches before token exchange.

```ts
const config = await getOAuthAppConfigVersion(
  session.ownerId,
  session.oauthAppConfigId,
  session.oauthAppConfigVersion
);
if (!config || config.status !== "active" || config.appId !== session.appId) {
  throw new OAuthFlowError("OAUTH_APP_CONFIG_CHANGED", "OAuth app configuration changed or was revoked.");
}
```

- [ ] **Step 5: Bind refresh to the connection's config reference**

Extend `IntegrationConnection` with `oauthAppConfigId` and `oauthAppConfigVersion`. Refresh loads the same config version and returns `reauthorization_required` if it is unavailable rather than trying a platform environment secret.

- [ ] **Step 6: Run focused, OAuth, and type tests**

Run: `npm.cmd test && npm.cmd run typecheck`

Expected: all tests pass; changing one user's config cannot affect another user's authorization or refresh.

- [ ] **Step 7: Commit session binding**

```powershell
git add -- src/lib/repositories/oauth-session.repository.ts src/lib/oauth/oauth-provider-adapter.ts src/lib/oauth/oauth.service.ts src/lib/oauth/oauth-authorization-flow.ts src/lib/oauth/oauth-callback.ts src/lib/oauth/token.service.ts src/lib/oauth/integration-connection.types.ts src/lib/repositories/integration-connection.repository.ts tests/oauth-user-credentials-flow.test.ts tests/oauth-integration-flow.test.ts tests/oauth-durable-connections.test.ts
git commit -m "feat: bind oauth flows to user app configs"
```

---

### Task 4: Add owner-scoped OAuth config routes and accessible UI

**Files:**
- Create: `app/api/integrations/[appId]/oauth-config/route.ts`
- Create: `components/integrations/OAuthAppConfigPanel.tsx`
- Modify: `components/integrations/KeyCredentialPanel.tsx`
- Modify: `components/integrations/IntegrationCenter.tsx`
- Test: `tests/oauth-user-app-config.test.ts`
- Test: `tests/integration-redirect-ui.test.ts`

**Interfaces:**
- Consumes: `saveOAuthAppConfig`, `getOAuthAppConfig`, `revokeOAuthAppConfig`, canonical registry definition.
- Produces: `GET/PUT/DELETE /api/integrations/:appId/oauth-config` and UI that calls the existing canonical OAuth start route only after configuration is active.

- [ ] **Step 1: Write failing route and UI source-contract tests**

```ts
test("OAuth config route never returns the submitted client secret", async () => {
  const response = await PUT(requestWithJson({ clientId: "id", clientSecret: "secret" }), context("gmail"));
  assert.equal(response.status, 200);
  assert.doesNotMatch(await response.text(), /secret|ciphertext/u);
});

test("OAuth panel shows exact redirect URI and official setup link", () => {
  const source = fs.readFileSync("components/integrations/OAuthAppConfigPanel.tsx", "utf8");
  assert.match(source, /redirectUri/u);
  assert.match(source, /officialSetupUrl/u);
  assert.match(source, /type="password"/u);
  assert.doesNotMatch(source, /localStorage/u);
});
```

- [ ] **Step 2: Run tests to prove RED**

Run: `npm.cmd test`

Expected: FAIL because the route and panel do not exist.

- [ ] **Step 3: Implement the route contract**

```ts
const bodySchema = z.object({
  clientId: z.string().trim().min(1).max(512),
  clientSecret: z.string().min(1).max(4096)
});

export async function PUT(request: Request, context: RouteContext) {
  const owner = await requireSessionOwner(request);
  const app = requireOAuthCapableApp((await context.params).appId);
  const input = bodySchema.parse(await request.json());
  const saved = await saveOAuthAppConfig({
    ownerId: owner.uid,
    appId: app.id,
    provider: app.oauthTarget!.provider,
    clientId: input.clientId,
    clientSecret: input.clientSecret,
    redirectUri: getOAuthRedirectUri(app.oauthTarget!.provider, request.url)
  });
  return NextResponse.json({ ok: true, config: toPublicOAuthAppConfig(saved) });
}
```

GET returns public status only. DELETE soft-revokes the config and marks dependent connections `reauthorization_required`.

- [ ] **Step 4: Implement the panel and integrate it with existing Credential UI**

The panel renders the exact Redirect URI read-only with a copy action, official setup link, ordered steps, Client ID, password-type Client Secret, save button, and connect button. It clears the in-memory Secret after every request and restores focus after dialogs. All controls have a minimum 44px target.

- [ ] **Step 5: Run focused UI/route tests and lint**

Run: `npm.cmd test && npm.cmd run lint && npm.cmd run typecheck`

Expected: all checks exit 0 and no Secret appears in route payload snapshots.

- [ ] **Step 6: Commit the user configuration experience**

```powershell
git add -- app/api/integrations/[appId]/oauth-config/route.ts components/integrations/OAuthAppConfigPanel.tsx components/integrations/KeyCredentialPanel.tsx components/integrations/IntegrationCenter.tsx tests/oauth-user-app-config.test.ts tests/integration-redirect-ui.test.ts
git commit -m "feat: add user oauth app setup"
```

---

### Task 5: Verify Microsoft, Dropbox, and existing providers with owner credentials

**Files:**
- Modify: `src/lib/oauth/oauth-provider-adapter.ts`
- Modify: `src/lib/oauth/provider-verification.ts`
- Modify: `src/lib/integrations/verified-connection.service.ts`
- Modify: `src/lib/automation/app-registry.ts`
- Test: `tests/oauth-provider-verification.test.ts`
- Test: `tests/integration-connection-truth.test.ts`

**Interfaces:**
- Consumes: explicit `OAuthClientCredentials`, canonical `oauthTarget`, existing provider verification functions.
- Produces: provider-verified Outlook, Teams, OneDrive, Dropbox, Google, Slack, Notion, GitHub, and Discord connections.

- [ ] **Step 1: Add failing provider coverage tests**

```ts
test("all canonical OAuth targets resolve to a provider adapter", () => {
  for (const app of AUTOMATION_APPS.filter((item) => item.oauthTarget)) {
    assert.doesNotThrow(() => getOAuthAppTarget(app.id));
    assert.equal(getOAuthProviderConfig(app.oauthTarget!.provider).id, app.oauthTarget!.provider);
  }
});

test("unconfigured owner OAuth apps are connectable only after user setup", () => {
  const outlook = states.find((state) => state.connectorId === "outlook");
  assert.equal(outlook?.canConnect, false);
  assert.equal(outlook?.operatorSetupRequired, false);
  assert.equal(outlook?.userOAuthSetupRequired, true);
});
```

- [ ] **Step 2: Run focused tests to verify RED**

Run: `npm.cmd test`

Expected: FAIL because canonical app targets and verified state do not expose user OAuth setup readiness.

- [ ] **Step 3: Complete canonical targets and provider identity verification**

Use Microsoft Graph `/v1.0/me` for Microsoft identity and Dropbox `/2/users/get_current_account` for Dropbox identity. Reuse existing Google, Slack, GitHub, Notion, and Discord verification. Normalize only provider account ID, account label/email, workspace ID/name, and granted scopes.

- [ ] **Step 4: Derive connection truth from owner configuration**

```ts
export type VerifiedConnectionState = {
  connectorId: string;
  label: string;
  logoPath: string;
  status: "connected" | "not_connected" | "needs_reconnect";
  authMode: "oauth" | "credential" | null;
  accountLabel: string | null;
  verifiedAt: string | null;
  canConnect: boolean;
  operatorSetupRequired: boolean;
  userOAuthSetupRequired: boolean;
};
```

`canConnect` is true when the owner has an active OAuth app config or the app has direct Credential fields. It is never derived solely from process environment variables.

- [ ] **Step 5: Run provider, truth, and OAuth tests**

Run: `npm.cmd test && npm.cmd run typecheck`

Expected: all provider targets resolve, unverified tokens never become connected, and owner isolation passes.

- [ ] **Step 6: Commit provider coverage**

```powershell
git add -- src/lib/oauth/oauth-provider-adapter.ts src/lib/oauth/provider-verification.ts src/lib/integrations/verified-connection.service.ts src/lib/automation/app-registry.ts tests/oauth-provider-verification.test.ts tests/integration-connection-truth.test.ts tests/oauth-integration-flow.test.ts
git commit -m "feat: verify all oauth integration providers"
```

---

### Task 6: Drive Automation readiness and chat guidance from the same connection contract

**Files:**
- Modify: `src/lib/automation/action-credential.service.ts`
- Modify: `src/lib/automation/runtime/workflow-validator.ts`
- Modify: `src/lib/automation/registry/action-guide.ts`
- Modify: `app/api/automation/analysis/route.ts`
- Test: `tests/automation-action-guide.test.ts`
- Test: `tests/integration-connection-truth.test.ts`
- Test: `tests/automation-runtime-execution.test.ts`

**Interfaces:**
- Consumes: `getVerifiedConnectionStates`, canonical app `connectionGuide`, ActionDefinition `requiredScopes`.
- Produces: typed `CONNECTION_REQUIRED`, `CREDENTIAL_INVALID`, `SCOPE_INSUFFICIENT` findings and non-secret guide output.

- [ ] **Step 1: Add failing guide and preflight tests**

```ts
test("connection guide tells users which fields and redirect URI to configure", () => {
  const guide = getActionGuide("gmail", "send-email");
  assert.deepEqual(guide.connection.oauthFields, ["Client ID", "Client Secret"]);
  assert.match(guide.connection.redirectUri, /\/api\/integrations\/google\/callback$/u);
  assert.match(guide.connection.officialSetupUrl, /^https:\/\//u);
  assert.doesNotMatch(JSON.stringify(guide), /clientSecretValue|accessToken/u);
});

test("workflow validation reports insufficient scopes before queueing", async () => {
  const result = await validateWorkflowForExecution(workflow, ownerContextWithScopes(["openid"]));
  assert.equal(result.findings[0]?.code, "SCOPE_INSUFFICIENT");
  assert.equal(result.canQueue, false);
});
```

- [ ] **Step 2: Run focused tests to prove RED**

Run: `npm.cmd test`

Expected: FAIL because the guide lacks user OAuth fields and preflight is not driven by owner config/scopes.

- [ ] **Step 3: Add connection setup and remediation DTOs**

```ts
export type ActionConnectionGuide = {
  authModes: AutomationAuthMode[];
  oauthFields: string[];
  credentialFields: string[];
  redirectUri: string | null;
  requiredScopes: string[];
  officialSetupUrl: string;
  steps: string[];
};
```

Generate this DTO from `AutomationAppDefinition` plus the selected `ActionDefinition`. Chat responses list field names and source steps only; they never interpolate persisted values.

- [ ] **Step 4: Block Queue insertion on connection/scope findings**

Use the selected owner connection ID, verify owner membership, status, expiration, config version, and required scopes. Correctable connection findings persist `waiting_connection` without a Queue row and include a deep link to the exact app/node.

- [ ] **Step 5: Run focused and full Automation tests**

Run: `npm.cmd test && npm.cmd run typecheck`

Expected: tests pass; missing connection and scope failures never appear as indefinitely queued jobs.

- [ ] **Step 6: Commit shared readiness and guidance**

```powershell
git add -- src/lib/automation/action-credential.service.ts src/lib/automation/runtime/workflow-validator.ts src/lib/automation/registry/action-guide.ts app/api/automation/analysis/route.ts tests/automation-action-guide.test.ts tests/integration-connection-truth.test.ts tests/automation-runtime-execution.test.ts tests/automation-execution-pipeline.test.ts
git commit -m "feat: unify automation connection guidance"
```

---

### Task 7: Complete Google, Microsoft, Dropbox, and messaging Action gaps

**Files:**
- Modify: `src/lib/automation/adapters/google.adapter.ts`
- Modify: `src/lib/automation/adapters/microsoft.adapter.ts`
- Modify: `src/lib/automation/adapters/dropbox.adapter.ts`
- Modify: `src/lib/automation/adapters/messaging.adapter.ts`
- Modify: `src/lib/automation/adapters/adapter-availability.ts`
- Test: `tests/automation-action-registry.test.ts`
- Test: `tests/automation-execution-pipeline.test.ts`

**Interfaces:**
- Consumes: provider-verified Connection tokens, `ActionAdapter`, `idempotencyKey`, `oauthJsonRequest`, canonical Action schemas.
- Produces: real Adapter coverage for currently catalogued Google, Microsoft, Dropbox, Discord, Telegram, and Slack actions that the provider API supports.

- [ ] **Step 1: Write failing inventory and provider-request tests**

```ts
test("every Google, Microsoft, Dropbox, and messaging action advertised as executable reaches a concrete branch", async () => {
  const coveredApps = new Set(["gmail", "google-sheets", "calendar", "drive", "youtube", "outlook", "microsoft-teams", "onedrive", "dropbox", "slack", "discord", "telegram"]);
  const missing = ACTION_CATALOG
    .filter((action) => coveredApps.has(action.appId) && isActionExecutable(action.appId, action.id))
    .filter((action) => !hasConcreteAdapterBranch(action.adapterKey));
  assert.deepEqual(missing.map((action) => action.adapterKey), []);
});

test("Gmail attachment actions and Drive destructive actions send exact provider requests", async () => {
  await execute("gmail.save-attachment", gmailAttachmentInput);
  await execute("drive.delete-file", driveDeleteInput);
  assert.equal(calls[0]?.url.pathname.includes("attachments"), true);
  assert.equal(calls[1]?.method, "DELETE");
});
```

- [ ] **Step 2: Run the complete suite to prove RED**

Run: `npm.cmd test`

Expected: FAIL on the newly added inventory/provider request assertions for concrete branches missing from the current broad availability list.

- [ ] **Step 3: Implement provider-specific branches with least privilege**

Use the existing normalized input helpers and provider clients. Add explicit branches for catalogued operations including Gmail forward/attachment handling, remaining Drive/Sheets/Calendar/YouTube calls, Outlook/Teams/OneDrive operations, Dropbox file operations, Slack/Discord/Telegram actions. Each branch must:

```ts
return executeProviderMutation({
  ownerId: input.ownerId,
  connectionId: input.connectionId,
  idempotencyKey: input.idempotencyKey,
  method,
  url,
  body,
  mapOutput: (payload, response) => ({
    data: normalizeProviderOutput(payload),
    apiRequestId: response.headers.get("x-request-id")
  })
});
```

Do not add an action to `IMPLEMENTED_ACTIONS` until its branch, validation, output mapping, and safe error mapping exist.

- [ ] **Step 4: Run the complete suite and typecheck**

Run: `npm.cmd test && npm.cmd run typecheck`

Expected: full suite passes and no executable action falls through to a generic “not implemented” error.

- [ ] **Step 5: Commit provider Action coverage**

```powershell
git add -- src/lib/automation/adapters/google.adapter.ts src/lib/automation/adapters/microsoft.adapter.ts src/lib/automation/adapters/dropbox.adapter.ts src/lib/automation/adapters/messaging.adapter.ts src/lib/automation/adapters/adapter-availability.ts tests/automation-action-registry.test.ts tests/automation-execution-pipeline.test.ts
git commit -m "feat: complete core integration actions"
```

---

### Task 8: Add project-management, CRM, commerce, and payment Action Adapters

**Files:**
- Create: `src/lib/automation/adapters/project-management.adapter.ts`
- Create: `src/lib/automation/adapters/crm-commerce.adapter.ts`
- Modify: `src/lib/automation/adapters/action-adapter.registry.ts`
- Modify: `src/lib/automation/adapters/adapter-availability.ts`
- Test: `tests/automation-provider-adapters.test.ts`
- Test: `tests/automation-risk-approval.test.ts`

**Interfaces:**
- Consumes: verified direct Credentials/OAuth tokens, canonical Action input, idempotency key, shared secret masking and HTTP safety helpers.
- Produces: real Action branches for Airtable, Trello, Asana, Jira, Linear, HubSpot, Salesforce, Stripe, and Shopify.

- [ ] **Step 1: Write failing provider-table tests**

```ts
test("project and CRM/commerce actions map to exact methods and provider origins", async () => {
  for (const fixture of providerActionFixtures) {
    const result = await executeRegisteredActionAdapter(fixture.input);
    assert.equal(result.status, "succeeded");
    assert.equal(capturedRequest.origin, fixture.expectedOrigin);
    assert.equal(capturedRequest.method, fixture.expectedMethod);
  }
});

test("Stripe refunds, Shopify refunds, and destructive bulk actions retain high or critical approval", () => {
  for (const key of ["stripe.refund-payment", "shopify.refund-order", "hubspot.bulk-delete-contacts"]) {
    const action = requireActionByAdapterKey(key);
    assert.ok(["high", "critical"].includes(action.riskLevel));
    assert.ok(action.confirmationPhrase);
  }
});
```

- [ ] **Step 2: Run the complete suite to prove RED**

Run: `npm.cmd test`

Expected: FAIL because the new provider Adapters are not registered.

- [ ] **Step 3: Implement project-management requests**

Implement explicit origins and request builders for Airtable, Trello, Asana, Jira, and Linear. Validate tenant/site URLs with the existing safe HTTPS validator; never interpolate an unchecked origin. Normalize created/updated resource ID, status, request ID, and rate-limit headers.

- [ ] **Step 4: Implement CRM, commerce, and payment requests**

Implement explicit HubSpot, Salesforce, Stripe, and Shopify operations. Forward the Automation `idempotencyKey` through `Idempotency-Key` or provider-equivalent headers where supported. High/critical mutations remain behind Preview and two-stage Approval; Adapter code must not bypass the common pipeline.

- [ ] **Step 5: Register only concrete branches and verify**

Run: `npm.cmd test && npm.cmd run typecheck`

Expected: full suite passes, unsafe origins fail closed, idempotency headers are asserted, and high-risk execution never calls the Adapter before approval.

- [ ] **Step 6: Commit project/CRM/commerce coverage**

```powershell
git add -- src/lib/automation/adapters/project-management.adapter.ts src/lib/automation/adapters/crm-commerce.adapter.ts src/lib/automation/adapters/action-adapter.registry.ts src/lib/automation/adapters/adapter-availability.ts tests/automation-provider-adapters.test.ts tests/automation-risk-approval.test.ts
git commit -m "feat: add business integration actions"
```

---

### Task 9: Add publishing and social Action Adapters

**Files:**
- Create: `src/lib/automation/adapters/publishing.adapter.ts`
- Modify: `src/lib/automation/adapters/action-adapter.registry.ts`
- Modify: `src/lib/automation/adapters/adapter-availability.ts`
- Test: `tests/automation-provider-adapters.test.ts`
- Test: `tests/automation-risk-approval.test.ts`

**Interfaces:**
- Consumes: verified WordPress, Facebook, Instagram, X, and LinkedIn connection credentials and the common approval pipeline.
- Produces: provider-specific create/publish/comment/delete operations supported by current provider APIs and account types.

- [ ] **Step 1: Add failing publishing request and confirmation tests**

```ts
test("public social publishing requires SEND confirmation and calls no provider before approval", async () => {
  const preview = await previewExecution(publicPublishingWorkflow);
  assert.equal(preview.requiredConfirmationPhrase, "SEND");
  assert.equal(providerCalls.length, 0);
});

test("approved publishing requests use provider-specific resource paths", async () => {
  await executeApproved("wordpress.publish-post", wordpressInput);
  await executeApproved("instagram.publish-media", instagramInput);
  assert.match(calls[0]!.pathname, /wp-json\/wp\/v2\/posts/u);
  assert.match(calls[1]!.pathname, /media_publish/u);
});
```

- [ ] **Step 2: Run the complete suite to prove RED**

Run: `npm.cmd test`

Expected: FAIL because publishing/social Adapters are absent.

- [ ] **Step 3: Implement explicit provider operations**

Use WordPress REST, Meta Graph, X, and LinkedIn documented endpoints for the exact catalogued operations. Instagram media publishing uses the required create-container then publish sequence with persisted idempotency. If a provider/account tier does not support an operation, keep that action disabled with a setup explanation rather than returning a fabricated success.

- [ ] **Step 4: Verify approval, rate limit, and safe errors**

Run: `npm.cmd test && npm.cmd run typecheck`

Expected: full suite passes; public publishing is high risk, bulk deletion remains high/critical, and provider errors are mapped without raw response bodies.

- [ ] **Step 5: Commit publishing coverage**

```powershell
git add -- src/lib/automation/adapters/publishing.adapter.ts src/lib/automation/adapters/action-adapter.registry.ts src/lib/automation/adapters/adapter-availability.ts tests/automation-provider-adapters.test.ts tests/automation-risk-approval.test.ts
git commit -m "feat: add publishing integration actions"
```

---

### Task 10: Enforce that every selectable Action has a real Adapter

**Files:**
- Modify: `src/lib/automation/adapters/adapter-availability.ts`
- Modify: `src/lib/automation/registry/action-registry.ts`
- Modify: `src/lib/automation/action-ui-model.ts`
- Modify: `components/Automation/ActionPicker.tsx`
- Modify: `components/Automation/AutomationActionGuide.tsx`
- Test: `tests/automation-action-registry.test.ts`
- Test: `tests/automation-action-ui.test.ts`

**Interfaces:**
- Consumes: concrete Adapter `supports()` results and canonical Action definitions.
- Produces: `listActionAvailability()` with `ready | setup_required | unavailable`, and UI that disables unavailable actions.

- [ ] **Step 1: Write the failing selectable-action invariant**

```ts
test("every selectable action resolves to a registered concrete adapter", () => {
  const violations = listActionUiModels()
    .filter((item) => item.selectable)
    .filter((item) => !hasRegisteredActionAdapter(item.definition));
  assert.deepEqual(violations.map((item) => item.definition.adapterKey), []);
});

test("unavailable actions are disabled with a setup or provider limitation reason", () => {
  for (const item of listActionUiModels().filter((entry) => !entry.selectable)) {
    assert.ok(item.disabledReason);
    assert.notEqual(item.status, "ready");
  }
});
```

- [ ] **Step 2: Run the complete suite to prove RED**

Run: `npm.cmd test`

Expected: FAIL with the exact remaining Adapter keys that are incorrectly selectable.

- [ ] **Step 3: Replace the duplicated availability allowlist with Adapter-derived truth**

```ts
export function getActionAvailability(definition: ActionDefinition): ActionAvailability {
  if (!hasRegisteredActionAdapter(definition)) {
    return { status: "unavailable", selectable: false, disabledReason: "이 작업의 서버 Adapter가 아직 구현되지 않았습니다." };
  }
  return { status: "ready", selectable: true, disabledReason: null };
}
```

Adapters may expose explicit supported keys; do not keep a separate hand-maintained list that can disagree with execution branches.

- [ ] **Step 4: Render disabled actions without changing the existing design**

Keep the existing list/card styling. Add only disabled state, `준비 중` or provider limitation text, and `aria-disabled`. An unavailable action cannot be selected, saved into a new Workflow, activated, or executed.

- [ ] **Step 5: Run full verification**

Run: `npm.cmd test && npm.cmd run lint && npm.cmd run typecheck`

Expected: all selectable actions have concrete Adapters and all unavailable actions are consistently blocked across UI, activation, and execution.

- [ ] **Step 6: Commit executable-action truth**

```powershell
git add -- src/lib/automation/adapters/adapter-availability.ts src/lib/automation/registry/action-registry.ts src/lib/automation/action-ui-model.ts components/Automation/ActionPicker.tsx components/Automation/AutomationActionGuide.tsx tests/automation-action-registry.test.ts tests/automation-action-ui.test.ts
git commit -m "fix: expose only executable automation actions"
```

---

### Task 11: Document, verify, and harden the complete user OAuth flow

**Files:**
- Create: `docs/user-managed-oauth-connections.md`
- Modify: `.env.example`
- Modify: `README.md`
- Test: `tests/oauth-user-credentials-flow.test.ts`
- Test: `tests/admin-auth-coupon-integration.test.ts`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: operator/user setup documentation and final regression evidence.

- [ ] **Step 1: Add failing documentation contract tests**

```ts
test("user OAuth guide covers every canonical OAuth provider without secret examples", () => {
  const guide = fs.readFileSync("docs/user-managed-oauth-connections.md", "utf8");
  for (const provider of ["Google", "Slack", "GitHub", "Notion", "Discord", "Microsoft", "Dropbox"]) {
    assert.match(guide, new RegExp(provider, "u"));
  }
  assert.match(guide, /Redirect URI/u);
  assert.match(guide, /Client ID/u);
  assert.match(guide, /Client Secret/u);
  assert.doesNotMatch(guide, /sk-[A-Za-z0-9]|ghp_[A-Za-z0-9]|Bearer [A-Za-z0-9]/u);
});
```

- [ ] **Step 2: Run documentation test to verify RED**

Run: `npm.cmd test`

Expected: FAIL because the user-managed OAuth guide does not exist.

- [ ] **Step 3: Write the exact provider setup and recovery guide**

Document for every provider: developer console location, app type, exact callback shown by DREAMWISH, required fields, scope consent, token refresh behavior, reconnect steps, and the fact that Client Secrets are user-owned encrypted data rather than Railway variables. Retain platform Kakao/Naver login variables as separate operator concerns.

- [ ] **Step 4: Run the full web verification**

Run: `npm.cmd run lint`

Expected: exit 0.

Run: `npm.cmd run typecheck`

Expected: exit 0.

Run: `npm.cmd test`

Expected: every test passes.

Run: `npm.cmd run build`

Expected: Next.js production build exits 0.

- [ ] **Step 5: Inspect the diff for leaked secrets and duplicate registries**

Run: `rg -n "client_secret|access_token|refresh_token|api[_-]?key" app src components docs .env.example`

Expected: only field definitions, encrypted storage, masked labels, documentation variable names, and test fixtures are present; no real values exist.

Run: `rg -n "AUTOMATION_APPS|AutomationAppDefinition" src components app`

Expected: one canonical definition array in `src/lib/automation/app-registry.ts`; consumers import it rather than copy app metadata.

- [ ] **Step 6: Commit documentation and final integration fixes**

```powershell
git add -- docs/user-managed-oauth-connections.md .env.example README.md tests/oauth-user-credentials-flow.test.ts tests/admin-auth-coupon-integration.test.ts
git commit -m "docs: explain user managed oauth connections"
```

## Final Evidence

Record the following before moving to Automation diagnostics or Billing:

- exact commit range;
- full lint/typecheck/test/build results;
- providers verified with local mocked HTTP contracts;
- sandbox/provider flows that still require real user Client IDs;
- connection state screenshots or browser checks for Automation and Integrations pages;
- explicit confirmation that no OAuth Secret, token, or API key is present in Git history or public DTO fixtures.
