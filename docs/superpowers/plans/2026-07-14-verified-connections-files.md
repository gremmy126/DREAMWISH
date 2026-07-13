# Verified Connections and Durable Files Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make recommendation acceptance reflect real verified app connections, verify every key-based app before encrypted persistence, and store downloadable files with real folders and type filters.

**Architecture:** A provider-verifier registry validates app-specific credential fields and calls the provider identity endpoint before `credential.repository` writes encrypted data. A unified connection-state service combines verified credentials with existing OAuth status and feeds AI Chat, Memory, Integrations, and Automation. File metadata remains owner-scoped while original bytes are stored under `DATA_DIR/files/<owner-hash>/<file-id>` and served only through an authenticated download route.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Node `crypto`/`fs`, existing owner context and JSON/PostgreSQL owner stores, Firebase session auth, existing AES-256-GCM credential encryption.

## Global Constraints

- Work in the current `main` checkout because the user explicitly requested implementation and push to `main`.
- Preserve the existing `.superpowers/` directory and `h origin main` file as user-owned untracked files.
- A credential is connected only after a real provider verification response succeeds.
- OAuth-only apps never expose the Automation quick-token field.
- Provider-supplied secrets never appear in API responses, logs, tests, or React state after a successful request completes.
- Every file read, write, folder move, and download is scoped by the authenticated owner.
- Maximum uploaded file size is 25 MiB.
- Use `apply_patch` for source edits and `npm.cmd` commands on Windows.

---

### Task 1: Lock the app authentication registry contract

**Files:**
- Modify: `src/lib/automation/app-registry.ts`
- Modify: `tests/automation-app-registry.test.ts`

**Interfaces:**
- Produces: `AutomationAppDefinition.supportedAuthModes`, `oauthTarget`, and `verificationKind`.
- Consumes: existing `AUTOMATION_APPS` and `credentialFields`.

- [ ] **Step 1: Write the failing registry coverage test**

Add assertions that every app has one or more supported modes, every non-OAuth app has required credential fields and a verifier kind, Gmail is OAuth-only, and GitHub/Notion/Discord expose both OAuth and token modes.

```ts
test("every automation app declares an executable authentication contract", () => {
  for (const app of AUTOMATION_APPS) {
    assert.ok(app.supportedAuthModes.length > 0, app.id);
    if (!app.supportedAuthModes.includes("oauth")) {
      assert.ok(app.credentialFields.length > 0, app.id);
      assert.ok(app.verificationKind, app.id);
    }
  }
  assert.deepEqual(getAutomationApp("gmail")?.supportedAuthModes, ["oauth"]);
  for (const id of ["github", "notion", "discord"]) {
    assert.deepEqual(getAutomationApp(id)?.supportedAuthModes, ["oauth", "token"]);
  }
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm.cmd test`

Expected: FAIL because `supportedAuthModes` and `verificationKind` do not exist.

- [ ] **Step 3: Add the minimal registry metadata**

Extend the type and constructors without changing credential field ids.

```ts
export type AutomationAuthMode = "oauth" | "api_key" | "token" | "multi_field";
export type OAuthTarget = { provider: string; service: string };

export type AutomationAppDefinition = {
  id: string;
  label: string;
  logoPath: string;
  color: string;
  authType: "none" | AutomationAuthMode;
  supportedAuthModes: AutomationAuthMode[];
  oauthTarget?: OAuthTarget;
  verificationKind: string | null;
  credentialFields: AutomationCredentialField[];
  help: string;
};
```

Set OAuth-only apps to `supportedAuthModes: ["oauth"]`, key apps to their exact mode, and GitHub/Notion/Discord to `["oauth", "token"]`.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npm.cmd test`

Expected: all tests pass.

---

### Task 2: Verify provider credentials before encrypted persistence

**Files:**
- Create: `src/lib/integrations/credential-verifier.ts`
- Modify: `src/lib/automation/credential.repository.ts`
- Modify: `app/api/automation/credentials/route.ts`
- Create: `tests/integration-credential-verification.test.ts`

**Interfaces:**
- Produces: `verifyIntegrationCredential(appId, values, fetcher?)`, `saveVerifiedCredential(input)`, and safe verification error codes.
- Consumes: `getAutomationApp`, AES-256-GCM encryption, and owner context.

- [ ] **Step 1: Write failing verifier tests**

Cover OpenAI success, Jira field validation, provider 401, provider 503, unsafe custom URL, and repository non-mutation on failure.

```ts
test("OpenAI credentials are verified against the provider before save", async () => {
  const calls: string[] = [];
  const result = await verifyIntegrationCredential("openai", { apiKey: "sk-test" }, async (url, init) => {
    calls.push(String(url));
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer sk-test");
    return Response.json({ data: [] });
  });
  assert.equal(result.accountLabel, "OpenAI API");
  assert.deepEqual(calls, ["https://api.openai.com/v1/models"]);
});

test("unsafe provider URLs are rejected before fetch", async () => {
  await assert.rejects(
    () => verifyIntegrationCredential("jira", { siteUrl: "http://127.0.0.1", email: "a@b.com", apiToken: "x" }),
    /UNSAFE_PROVIDER_URL/u
  );
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm.cmd test`

Expected: FAIL because `credential-verifier.ts` does not exist.

- [ ] **Step 3: Implement the provider verifier registry**

Implement one branch for every key/token app in the approved matrix. Use a common fetch wrapper with an 8-second abort timeout, `redirect: "error"`, normalized 401/403/429/5xx handling, and public HTTPS URL validation.

```ts
export type CredentialVerificationResult = {
  accountLabel: string;
  providerAccountId: string | null;
};

export async function verifyIntegrationCredential(
  appId: string,
  values: Record<string, string>,
  fetcher: typeof fetch = fetch
): Promise<CredentialVerificationResult> {
  const app = getAutomationApp(appId);
  if (!app || !app.verificationKind) throw coded("UNSUPPORTED_CREDENTIAL_APP");
  assertRequiredFields(app, values);
  return VERIFY[app.verificationKind](values, fetcher);
}
```

For X, sign `GET https://api.x.com/2/users/me` with OAuth 1.0a HMAC-SHA1 using the four supplied fields. For Discord and Telegram, verify both identity and the required server/channel or chat id. Validate user-entered Jira, Salesforce, Shopify, and WordPress hosts before any request.

- [ ] **Step 4: Add verified credential persistence**

Extend stored records with `accountLabel`, `verificationStatus`, `verifiedAt`, and `schemaVersion`. Keep v1 records readable but unverified.

```ts
export async function saveVerifiedCredential(input: {
  ownerId: string;
  appId: string;
  label: string;
  values: Record<string, string>;
  accountLabel: string;
}) {
  return saveEncryptedCredential(
    input,
    JSON.stringify(input.values),
    `•••••• · ${Object.keys(input.values).length}개 필드`,
    { accountLabel: input.accountLabel, verificationStatus: "verified", verifiedAt: new Date().toISOString(), schemaVersion: 2 }
  );
}
```

- [ ] **Step 5: Make the API verify before saving**

The route filters values through the app schema, runs `verifyIntegrationCredential`, then calls `saveVerifiedCredential`. OAuth requests return `OAUTH_REQUIRED` without storing.

- [ ] **Step 6: Run the tests and verify GREEN**

Run: `npm.cmd test`

Expected: all tests pass, including every app mapping test.

---

### Task 3: Build one verified connection state and disconnect path

**Files:**
- Create: `src/lib/integrations/verified-connection.service.ts`
- Modify: `app/api/integrations/status/route.ts`
- Create: `app/api/integrations/credentials/[connectorId]/route.ts`
- Modify: `src/lib/integrations/integration-settings.repository.ts`
- Create: `tests/verified-connection-state.test.ts`

**Interfaces:**
- Produces: `getVerifiedConnectionStates(ownerId, requestUrl)` and `disconnectVerifiedCredential(ownerId, connectorId)`.
- Consumes: existing OAuth connection status, credential repository, app registry, and sync settings.

- [ ] **Step 1: Write failing unified-state tests**

```ts
test("sync enabled without verified auth is not connected", async () => {
  await saveIntegrationSyncSetting({ ownerId: "owner-a", connectorId: "openai", enabled: true, syncDays: 30, commandPrefix: "openai" });
  const states = await getVerifiedConnectionStates("owner-a", "https://dreamwish.co.kr");
  assert.equal(states.find((item) => item.connectorId === "openai")?.status, "not_connected");
});
```

Also test verified key, verified OAuth, legacy unverified key, cross-owner isolation, and disconnect disabling sync.

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test`

Expected: FAIL because unified state does not exist.

- [ ] **Step 3: Implement the connection state service**

Return all 29 app ids, merge OAuth and credential states, and expose only safe public fields.

- [ ] **Step 4: Implement owner-scoped key disconnect**

`DELETE /api/integrations/credentials/{connectorId}` removes only that owner's credentials and calls `saveIntegrationSyncSetting(... enabled: false ...)`. OAuth disconnect continues through the existing provider route.

- [ ] **Step 5: Include `connections` in integration status**

```ts
return NextResponse.json({
  items,
  connections: await getVerifiedConnectionStates(owner.uid, request.url),
  firebase: getFirebaseConnectionState(),
  ai: getAIProviderKeyState()
});
```

- [ ] **Step 6: Run and verify GREEN**

Run: `npm.cmd test`

Expected: all tests pass.

---

### Task 4: Make recommendation acceptance and connection UX truthful

**Files:**
- Modify: `app/api/local/connections/accept/route.ts`
- Modify: `components/context/SuggestedConnectionsPanel.tsx`
- Modify: `components/Memory/MemoryView.tsx`
- Modify: `components/layout/AppShell.tsx`
- Modify: `components/integrations/IntegrationCenter.tsx`
- Create: `components/integrations/KeyCredentialPanel.tsx`
- Modify: `components/Automation/AutomationView.tsx`
- Modify: `components/Automation/AutomationSecondaryViews.tsx`
- Create: `tests/connection-acceptance-state.test.ts`

**Interfaces:**
- Produces: navigation event `{ view: "integrations", connectorId }`, truthful recommendation actions, and a reusable key form.
- Consumes: unified `connections`, app registry, OAuth connect buttons, and credential verification API.

- [ ] **Step 1: Write failing source-contract and state tests**

Assert that recommendation acceptance no longer enables an unverified app, navigation carries connector id, connected recommendations render `연결 해제`, OAuth modules do not render `빠른 Token 추가`, and key errors use normalized codes.

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test`

Expected: FAIL on the old unconditional sync-setting save and quick-token UI.

- [ ] **Step 3: Change app recommendation acceptance**

For app targets, the route reads verified state. If disconnected it returns:

```ts
return NextResponse.json({
  applied: false,
  connectionRequired: true,
  connectorId: target.id,
  message: `${target.label} 계정 연결이 필요합니다.`
});
```

If verified, enable sync and return `applied: true`.

- [ ] **Step 4: Propagate connector selection navigation**

`AppShell` stores a pending connector id when receiving `dreamwish:navigate`, opens Integrations, and passes it to `IntegrationCenter`. The center selects that app after status load.

- [ ] **Step 5: Add truthful recommendation buttons**

Both AI Chat and Memory load the same connection states. Disconnected apps show `연결하기`; verified apps show `연결 해제`. After either operation, reload status without a page refresh.

- [ ] **Step 6: Replace Automation quick token**

OAuth-only nodes show a button that navigates to Integrations. Token nodes show a button that opens Connection Management. Remove the legacy single-secret fast-save path.

- [ ] **Step 7: Add the key credential panel**

Render exact registry fields, submit values once, clear secret fields after completion, and reload connection status after successful provider verification.

- [ ] **Step 8: Run and verify GREEN**

Run: `npm.cmd test`

Expected: all recommendation and integration tests pass.

---

### Task 5: Persist original file bytes and folders

**Files:**
- Modify: `src/lib/files/file.repository.ts`
- Create: `src/lib/files/file-storage.ts`
- Modify: `app/api/files/route.ts`
- Create: `app/api/files/[fileId]/route.ts`
- Create: `app/api/files/[fileId]/download/route.ts`
- Create: `app/api/files/folders/route.ts`
- Create: `tests/durable-files.test.ts`

**Interfaces:**
- Produces: `classifyFileCategory`, `storeOwnerFile`, `readOwnerFile`, folder CRUD subset, multipart upload, authenticated download, and folder move.
- Consumes: `getDataDirectory`, owner context, JSON store, Node crypto/fs/path.

- [ ] **Step 1: Write failing repository and route tests**

Test category classification, folder uniqueness, original byte round-trip, owner isolation, legacy content unavailable, safe filename headers, and 25 MiB rejection.

```ts
test("file bytes round trip only for the owning account", async () => {
  const stored = await storeOwnerFile({ ownerId: "owner-a", fileId: "file-1", bytes: Buffer.from("hello") });
  assert.equal((await readOwnerFile("owner-a", stored.storageKey)).toString(), "hello");
  await assert.rejects(() => readOwnerFile("owner-b", stored.storageKey), /FILE_NOT_FOUND/u);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test`

Expected: FAIL because byte storage and folders do not exist.

- [ ] **Step 3: Extend file records compatibly**

Add `category`, `folderId`, `storageKey`, and `sha256` as normalized optional legacy fields. Public list output omits `storageKey`.

- [ ] **Step 4: Implement safe byte storage**

Hash owner id for the directory, use a server-generated file id as the filename, write to a temporary file then rename, and compute SHA-256. Reject path separators and owner mismatches.

- [ ] **Step 5: Convert upload to multipart**

Read `file`, `source`, `projectId`, and `folderId` from form data. Save bytes first, persist metadata second, and delete bytes if metadata persistence fails.

- [ ] **Step 6: Implement download and folder APIs**

Download checks owner and storage key, verifies bytes exist, and returns `Content-Disposition: attachment`. Folder creation and file PATCH validate owner-scoped folder ids.

- [ ] **Step 7: Run and verify GREEN**

Run: `npm.cmd test`

Expected: durable file tests and existing owner-isolation tests pass.

---

### Task 6: Add file download, real folders, filters, and chat uploads

**Files:**
- Modify: `components/Files/FilesView.tsx`
- Modify: `components/Chat/ChatView.tsx`
- Create: `tests/files-ui.test.ts`

**Interfaces:**
- Produces: actual folder create/select/move UI, category filters, download links, and multipart chat attachment upload.
- Consumes: new file and folder APIs.

- [ ] **Step 1: Write failing UI contract tests**

Assert presence of `새 폴더`, `다운로드`, `/api/files/${file.id}/download`, folder PATCH, category state, FormData, and absence of JSON-only file metadata upload.

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test`

Expected: FAIL because current Files and Chat send JSON metadata only.

- [ ] **Step 3: Build the Files workspace**

Use a responsive two-column layout with an owner folder sidebar, top category chips, and file cards. Each card downloads through the authenticated route and moves with a native select. Legacy files disable download and show `원본 파일 없음`.

- [ ] **Step 4: Upload actual bytes from Files and Chat**

```ts
const form = new FormData();
form.set("file", file);
form.set("source", "aichat");
form.set("textPreview", textPreview);
await fetch("/api/files", { method: "POST", body: form });
```

Do not set `Content-Type`; the browser supplies the multipart boundary.

- [ ] **Step 5: Run and verify GREEN**

Run: `npm.cmd test`

Expected: all Files and Chat tests pass.

---

### Task 7: Preserve billing placement and correct the business address

**Files:**
- Modify: `components/layout/Sidebar.tsx`
- Create: `tests/sidebar-business-info.test.ts`

**Interfaces:**
- Produces: exact address copy and a regression contract for UpgradeButton placement.
- Consumes: existing `UpgradeButton compact` and `StorageStatus compact`.

- [ ] **Step 1: Write the failing address test and placement regression**

```ts
test("sidebar keeps billing above storage and shows the corrected address", () => {
  const source = fs.readFileSync("components/layout/Sidebar.tsx", "utf8");
  assert.ok(source.indexOf("<UpgradeButton compact") < source.indexOf("<StorageStatus compact"));
  assert.match(source, /부산 사상구 덕상로 8-37, 202동 2504호/u);
  assert.doesNotMatch(source, /학장로/u);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npm.cmd test`

Expected: FAIL because the address still contains `학장로`.

- [ ] **Step 3: Correct only the address copy**

Change the address value to `부산 사상구 덕상로 8-37, 202동 2504호`; preserve UpgradeButton immediately above StorageStatus.

- [ ] **Step 4: Run and verify GREEN**

Run: `npm.cmd test`

Expected: all tests pass.

---

### Task 8: Verify, commit, and push main

**Files:**
- Verify: all modified and created files

**Interfaces:**
- Produces: a tested production build and pushed `main` commit.
- Consumes: all previous tasks.

- [ ] **Step 1: Run formatting and secret checks**

Run: `git diff --check`

Expected: exit 0 with no whitespace errors.

Run: `rg -n "BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|ghp_[A-Za-z0-9]|xox[baprs]-[A-Za-z0-9]" app components src tests docs`

Expected: no real credential material.

- [ ] **Step 2: Run complete verification**

Run: `npm.cmd test`

Expected: all tests pass.

Run: `npm.cmd run typecheck`

Expected: exit 0.

Run: `npm.cmd run build`

Expected: Next.js production build completes successfully.

- [ ] **Step 3: Review staged scope**

Stage only source, tests, and approved docs. Confirm `.superpowers/` and `h origin main` remain untracked and unstaged.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: verify app connections and persist files"
```

- [ ] **Step 5: Push main**

```bash
git push origin main
```

Expected: local `HEAD` and `origin/main` resolve to the same commit.
