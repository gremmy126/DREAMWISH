# Account Storage, Verified Connections, Mobile Pairing, and Gmail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace browser-wide storage metrics with account-owned usage, make verified direct credentials persist safely, make mobile pairing instructions actionable, and make connected Gmail conversations synchronize and display reliably.

**Architecture:** Server APIs remain the source of truth and always derive `ownerId` from the authenticated session. Storage aggregation calls existing owner-scoped repositories, credential encryption records the selected key identifier, the mobile companion reference modules consume the existing pairing contract, and Gmail synchronization uses a Gmail-service token plus one grouped thread upsert per thread. Client components render server state and never infer connection or ownership from browser-local data.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 5.7, Node.js crypto AES-256-GCM, Firebase-backed owner sessions, repository JSON/PostgreSQL adapters, Kotlin Android reference client, SwiftUI iOS reference client.

## Global Constraints

- Every server read and write must be scoped with `requireOwnerContext(request).uid`; request bodies never choose an owner.
- Production credential encryption fails closed when all approved keys are absent; `AUTH_SESSION_SECRET` is never an encryption fallback.
- Credential API responses never include secrets, ciphertext, IVs, or authentication tags.
- The production OAuth callbacks remain exactly `https://dreamwish.co.kr/api/integrations/github/callback`, `https://dreamwish.co.kr/api/integrations/notion/callback`, and `https://dreamwish.co.kr/api/integrations/slack/callback`.
- Mobile reference code must not request SMS or call-log access and must not be described as an installable store build.
- Gmail first-load synchronization runs at most once per mounted client session, covers 30 days and at most 50 messages, and preserves cached conversations when synchronization fails.
- Existing AI Chat, Memory, Files, CRM, OAuth, and Polar behavior must remain operational.

---

### Task 1: Account-owned storage usage

**Files:**
- Create: `src/lib/storage/account-storage.ts`
- Create: `app/api/storage/usage/route.ts`
- Create: `tests/account-storage-usage.test.ts`
- Modify: `components/Common/StorageStatus.tsx`
- Modify: `src/lib/i18n/messages.ts`

**Interfaces:**
- Consumes: `listFileRecords(ownerId)`, `readMemoryDb(ownerId)`, `listKnowledgeNotes(ownerId)`, `listBusinessConversations(ownerId, provider)`, `listAutomations(ownerId)`, `listScenarios(ownerId)`, and `listCredentials(ownerId)`.
- Produces: `calculateAccountStorageUsage(ownerId): Promise<AccountStorageUsage>` and authenticated `GET /api/storage/usage`.

- [ ] **Step 1: Write the failing owner-isolation and UI-contract tests**

```ts
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { calculateAccountStorageUsage } from "../src/lib/storage/account-storage";
import { saveFileRecord } from "../src/lib/files/file.repository";

test("account storage contains only owner records and a new owner starts at zero", async () => {
  const previous = process.env.DATA_DIR;
  process.env.DATA_DIR = await fs.mkdtemp(path.join(os.tmpdir(), "dreamwish-storage-"));
  try {
    await saveFileRecord({ ownerId: "owner-a", name: "a.pdf", mimeType: "application/pdf", size: 4096, storageKey: "a", projectId: null, folderId: null });
    assert.equal((await calculateAccountStorageUsage("owner-a")).breakdown.files, 4096);
    assert.equal((await calculateAccountStorageUsage("owner-b")).usageBytes, 0);
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = previous;
  }
});

test("storage UI reads the authenticated API instead of browser-wide storage", async () => {
  const source = await fs.readFile("components/Common/StorageStatus.tsx", "utf8");
  assert.match(source, /fetch\("\/api\/storage\/usage"/u);
  assert.doesNotMatch(source, /localStorage|navigator\.storage/u);
});
```

- [ ] **Step 2: Run the suite and confirm the new module test fails**

Run: `npm.cmd test`

Expected: FAIL because `src/lib/storage/account-storage.ts` does not exist.

- [ ] **Step 3: Implement the owner-scoped aggregate and protected route**

```ts
export type AccountStorageUsage = {
  usageBytes: number;
  quotaBytes: number | null;
  breakdown: { files: number; memories: number; knowledge: number; chat: number; business: number; automation: number };
  measuredAt: string;
};

export function utf8JsonBytes(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

export async function calculateAccountStorageUsage(ownerId: string): Promise<AccountStorageUsage> {
  const [files, memories, knowledge, gmail, slack, automations, scenarios, credentials] = await Promise.all([
    listFileRecords(ownerId), readMemoryDb(ownerId), listKnowledgeNotes(ownerId),
    listBusinessConversations(ownerId, "gmail"), listBusinessConversations(ownerId, "slack"),
    listAutomations(ownerId), listScenarios(ownerId), listCredentials(ownerId)
  ]);
  const breakdown = {
    files: files.reduce((total, file) => total + Math.max(0, file.size), 0),
    memories: utf8JsonBytes(memories), knowledge: utf8JsonBytes(knowledge), chat: 0,
    business: utf8JsonBytes({ gmail, slack }), automation: utf8JsonBytes({ automations, scenarios, credentials })
  };
  return { usageBytes: Object.values(breakdown).reduce((sum, value) => sum + value, 0), quotaBytes: null, breakdown, measuredAt: new Date().toISOString() };
}
```

```ts
export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  return NextResponse.json(await calculateAccountStorageUsage(owner.uid));
}
```

- [ ] **Step 4: Replace `StorageStatus` browser measurement with API loading**

```tsx
useEffect(() => {
  let active = true;
  void fetch("/api/storage/usage", { cache: "no-store" })
    .then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "저장공간을 확인하지 못했습니다.");
      if (active) setInfo(result);
    })
    .catch(() => { if (active) setError(true); });
  return () => { active = false; };
}, []);
```

Render `내 저장공간`, the account total, `한도 미설정` when `quotaBytes` is null, the measurement time, and a retryable error without showing browser origin usage.

- [ ] **Step 5: Run verification and commit this independently testable deliverable**

Run: `npm.cmd test && npm.cmd run typecheck`

Expected: all tests pass and TypeScript exits 0.

Commit: `git add app/api/storage/usage/route.ts components/Common/StorageStatus.tsx src/lib/storage/account-storage.ts src/lib/i18n/messages.ts tests/account-storage-usage.test.ts && git commit -m "feat: scope storage usage to each account"`

### Task 2: Verified credential encryption and OAuth regression contracts

**Files:**
- Create: `tests/credential-persistence.test.ts`
- Modify: `src/lib/automation/credential.repository.ts`
- Modify: `app/api/automation/credentials/route.ts`
- Modify: `src/lib/integrations/credential-verifier.ts`
- Modify: `.env.example`
- Modify: `docs/integrations-oauth-setup.md`
- Modify: `tests/integration-credential-verification.test.ts`
- Modify: `tests/oauth-integration-flow.test.ts`

**Interfaces:**
- Produces: `CredentialPersistenceError`, `isCredentialPersistenceError(error)`, stored `AutomationCredential.keyId`, and key precedence automation → integration → OAuth → development-only fallback.
- Preserves: public credential objects omit all encrypted material; GitHub, Notion, and Slack callback generation and provider verification remain unchanged.

- [ ] **Step 1: Write failing tests for fallback keys, key identity, fail-closed behavior, safe errors, and Notion version**

```ts
test("production credentials use the integration key when the automation key is absent", async () => {
  await withCredentialEnvironment({ NODE_ENV: "production", INTEGRATION_TOKEN_ENCRYPTION_KEY: "integration-secret" }, async () => {
    const saved = await saveCredentialValues({ ownerId: "owner-a", appId: "notion", label: "Notion", values: { integrationToken: "secret-token" } });
    assert.equal(saved.keyId, "integration");
    assert.deepEqual(JSON.parse((await revealCredential("owner-a", saved.id)) || "{}"), { integrationToken: "secret-token" });
  });
});

test("production credential storage fails closed with a typed safe code", async () => {
  await withCredentialEnvironment({ NODE_ENV: "production" }, async () => {
    await assert.rejects(() => saveCredentialValues({ ownerId: "owner-a", appId: "notion", label: "Notion", values: { integrationToken: "secret" } }),
      (error: unknown) => isCredentialPersistenceError(error) && error.code === "CREDENTIAL_ENCRYPTION_NOT_CONFIGURED");
  });
});

test("Notion verification uses the current API version", async () => {
  await verifyIntegrationCredential("notion", { integrationToken: "secret" }, async (_url, init) => {
    assert.equal(new Headers(init?.headers).get("notion-version"), "2026-03-11");
    return Response.json({ id: "bot-1", name: "DREAMWISH" });
  });
});
```

- [ ] **Step 2: Run the suite and confirm encryption tests fail**

Run: `npm.cmd test`

Expected: FAIL because fallback keys, `keyId`, and typed persistence errors are not implemented and Notion still sends `2022-06-28`.

- [ ] **Step 3: Implement key selection, stored key identity, and legacy decryption**

```ts
export type CredentialKeyId = "automation" | "integration" | "oauth" | "development";
export type CredentialPersistenceCode = "CREDENTIAL_ENCRYPTION_NOT_CONFIGURED" | "CREDENTIAL_DATABASE_UNAVAILABLE" | "CREDENTIAL_WRITE_FAILED";

export class CredentialPersistenceError extends Error {
  constructor(public readonly code: CredentialPersistenceCode, message: string, public readonly status = 500) {
    super(message); this.name = "CredentialPersistenceError";
  }
}

function selectEncryptionKey(preferred?: CredentialKeyId) {
  const keys = {
    automation: process.env.AUTOMATION_CREDENTIAL_ENCRYPTION_KEY?.trim(),
    integration: process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY?.trim(),
    oauth: process.env.OAUTH_TOKEN_ENCRYPTION_KEY?.trim(),
    development: process.env.NODE_ENV === "production" ? undefined : "dreamwish-local-development-only"
  } satisfies Record<CredentialKeyId, string | undefined>;
  const keyId = preferred || (["automation", "integration", "oauth", "development"] as const).find((id) => keys[id]);
  if (!keyId || !keys[keyId]) throw new CredentialPersistenceError("CREDENTIAL_ENCRYPTION_NOT_CONFIGURED", "서버 암호화 키 설정이 필요합니다.");
  return { keyId, key: createHash("sha256").update(keys[keyId]).digest() };
}
```

Encrypt with the selected `{ keyId, key }`, store `keyId`, decrypt by stored `keyId`, and for records without `keyId` try the legacy automation key before the remaining configured keys. Wrap database adapter failures as `CREDENTIAL_DATABASE_UNAVAILABLE` and local write failures as `CREDENTIAL_WRITE_FAILED` without embedding the original secret or provider payload.

- [ ] **Step 4: Map persistence codes to safe API errors and update provider/docs contracts**

```ts
if (isCredentialPersistenceError(error)) {
  return NextResponse.json({ code: error.code, error: error.message }, { status: error.status });
}
```

Change the Notion request header to `"Notion-Version": "2026-03-11"`. Document the exact production callback URIs and approved key precedence in `.env.example` and `docs/integrations-oauth-setup.md`; state that Client IDs and secrets live only in the deployment environment.

- [ ] **Step 5: Run verification and commit**

Run: `npm.cmd test && npm.cmd run typecheck`

Expected: all credential and OAuth regression tests pass; no public response contains encrypted fields.

Commit: `git add .env.example app/api/automation/credentials/route.ts docs/integrations-oauth-setup.md src/lib/automation/credential.repository.ts src/lib/integrations/credential-verifier.ts tests/credential-persistence.test.ts tests/integration-credential-verification.test.ts tests/oauth-integration-flow.test.ts && git commit -m "fix: persist verified app credentials safely"`

### Task 3: Actionable Android and iPhone pairing reference flows

**Files:**
- Create: `mobile-companion/android/PairingActivity.kt`
- Create: `mobile-companion/android/SignedEnvelope.kt`
- Create: `mobile-companion/android/ContactSyncWorker.kt`
- Create: `mobile-companion/android/CalendarSyncWorker.kt`
- Create: `mobile-companion/ios/PairingView.swift`
- Create: `mobile-companion/ios/SignedEnvelope.swift`
- Create: `mobile-companion/ios/ContactSyncService.swift`
- Create: `mobile-companion/ios/CalendarSyncService.swift`
- Modify: `components/Business/DeviceConnectionPanel.tsx`
- Modify: `mobile-companion/README.md`
- Modify: `tests/device-pairing.test.ts`

**Interfaces:**
- Consumes: existing `POST /api/devices/pair` request `{ challengeId, code, platform, name, publicKey }` and existing device envelope sync endpoint.
- Produces: numeric six-digit input reference screens, explicit in-product path instructions, and signed contact/calendar payload helpers.

- [ ] **Step 1: Add failing source-contract tests**

```ts
test("pairing dialog explains exactly where the six digit code is entered", async () => {
  const panel = await fs.readFile("components/Business/DeviceConnectionPanel.tsx", "utf8");
  assert.match(panel, /설정 → DREAMWISH 연결 → 웹 코드 입력/u);
  assert.match(panel, /웹사이트 입력창이 아니라 휴대폰 컴패니언 앱/u);
  assert.match(panel, /PairingActivity\.kt/u);
  assert.match(panel, /PairingView\.swift/u);
});

test("mobile reference clients validate exactly six digits and use the pairing endpoint", async () => {
  for (const file of ["mobile-companion/android/PairingActivity.kt", "mobile-companion/ios/PairingView.swift"]) {
    const source = await fs.readFile(file, "utf8");
    assert.match(source, /\\d\{6\}|count == 6|count === 6/u);
    assert.match(source, /\/api\/devices\/pair/u);
  }
});
```

- [ ] **Step 2: Run the suite and confirm missing reference files fail**

Run: `npm.cmd test`

Expected: FAIL with file-not-found for `PairingActivity.kt` or `PairingView.swift`.

- [ ] **Step 3: Implement the modal copy and reference client contracts**

The web modal must render this ordered text verbatim:

```tsx
<ol>
  <li>DREAMWISH Companion 앱을 엽니다.</li>
  <li>설정 → DREAMWISH 연결 → 웹 코드 입력으로 이동합니다.</li>
  <li>페어링 코드 입력칸에 아래 6자리를 입력합니다.</li>
  <li>앱에서 연결을 누릅니다.</li>
  <li>웹에서 기기 상태와 연락처·캘린더 권한을 확인합니다.</li>
</ol>
<p>6자리 코드는 웹사이트 입력창이 아니라 휴대폰 컴패니언 앱의 페어링 코드 입력칸에 입력합니다.</p>
```

Android `PairingActivity` filters `Regex("\\d{6}")`, posts the challenge payload, and stores the returned device secret using Android Keystore-backed encrypted preferences. iOS `PairingView` filters `CharacterSet.decimalDigits`, requires `code.count == 6`, posts the same payload, and persists the returned secret in Keychain. Signed-envelope helpers calculate HMAC-SHA256 over the deterministic request payload; contact and calendar services send only user-approved records. The README labels these as source references requiring an application ID, bundle ID, signing certificates, and native project integration before installation.

- [ ] **Step 4: Run verification and commit**

Run: `npm.cmd test && npm.cmd run typecheck`

Expected: device owner-isolation and no-SMS/call-log tests continue to pass; source contracts pass.

Commit: `git add components/Business/DeviceConnectionPanel.tsx mobile-companion tests/device-pairing.test.ts && git commit -m "feat: add mobile pairing entry references"`

### Task 4: Gmail service-token synchronization and threaded Business conversations

**Files:**
- Create: `app/api/business/messages/sync/route.ts`
- Create: `tests/gmail-business-sync.test.ts`
- Modify: `src/lib/integrations/sync-engine.ts`
- Modify: `src/lib/business/business-message.service.ts`
- Modify: `app/api/business/messages/route.ts`
- Modify: `components/Business/MessageWorkspace.tsx`
- Modify: `tests/business-messaging.test.ts`
- Modify: `tests/integration-sync-owner-isolation.test.ts`

**Interfaces:**
- Consumes: `getActiveAccessToken(ownerId, "google", "gmail")`, `getOAuthConnectionStatus(ownerId, "google", "gmail")`, and owner-scoped Gmail repositories.
- Produces: `POST /api/business/messages/sync`, result `{ provider, sync, status, conversations }`, grouped Gmail thread persistence, one-session first-load synchronization, and safe visible errors.

- [ ] **Step 1: Write failing service-token, thread-grouping, route, and UI tests**

```ts
test("Gmail synchronization selects only the Gmail service token", async () => {
  const source = await fs.readFile("src/lib/integrations/sync-engine.ts", "utf8");
  assert.match(source, /getActiveAccessToken\(ownerId,\s*"google",\s*"gmail"\)/u);
});

test("Gmail synchronization groups all fetched message ids by thread before upsert", async () => {
  const source = await fs.readFile("src/lib/integrations/sync-engine.ts", "utf8");
  assert.match(source, /groupGmailThreads/u);
  assert.doesNotMatch(source, /messageIds:\s*\[detail\.id\][\s\S]*upsertGmailThreads/u);
});

test("Business UI uses the POST sync endpoint and limits first-load auto sync to one attempt", async () => {
  const source = await fs.readFile("components/Business/MessageWorkspace.tsx", "utf8");
  assert.match(source, /fetch\("\/api\/business\/messages\/sync",\s*\{\s*method:\s*"POST"/u);
  assert.match(source, /autoSyncAttempted/u);
});
```

- [ ] **Step 2: Run the suite and confirm Gmail contract tests fail**

Run: `npm.cmd test`

Expected: FAIL because the sync route, service-specific token call, grouped upsert, and auto-sync guard are absent.

- [ ] **Step 3: Implement service-specific synchronization and grouped thread persistence**

```ts
const service = connectorId === "gmail" ? "gmail" : connectorId === "calendar" ? "calendar" : "slack";
const accessToken = await getActiveAccessToken(ownerId, tokenProvider, service);
```

Fetch all Gmail details first. Build `Map<string, GmailMessageDetail[]>`, sort each group by received date, and call `upsertGmailThreads` once with one record per thread whose `messageIds` contains every detail ID. Keep attachment upserts per message and normalized message upserts owner-scoped.

- [ ] **Step 4: Implement explicit sync API and safe status mapping**

```ts
export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = await request.json().catch(() => ({}));
  const provider = parseMessageProvider(body.provider);
  if (!provider) return NextResponse.json({ code: "INVALID_PROVIDER", error: "Gmail 또는 Slack을 선택해주세요." }, { status: 400 });
  const status = await getMessageProviderStatus(owner.uid, provider);
  if (!hasReadScope(provider, status.scope)) return NextResponse.json({ code: "reconnect_required", error: "읽기 권한으로 계정을 다시 연결해주세요." }, { status: 409 });
  const sync = await runManualIntegrationSync(owner.uid, provider, { days: 30, limit: 50 });
  const conversations = await listBusinessConversations(owner.uid, provider);
  return NextResponse.json({ provider, sync, status, conversations }, { status: sync.status === "failed" ? 502 : sync.status === "blocked" ? 409 : 200 });
}
```

`GET /api/business/messages` remains read-only. It may retain `sync=1` only as a compatibility bridge that delegates to the same service and returns the actual sync result.

- [ ] **Step 5: Implement one-session first-load sync, visible errors, cached fallback, and reply refresh**

Use `useRef(new Set<MessageProvider>())` as `autoSyncAttempted`. After the cached GET resolves, if Gmail is connected, the Gmail read scope is present, there are no conversations, and the provider is not in the set, add it and call the POST sync endpoint once. Manual refresh calls the same POST. A failed sync keeps `data.conversations`, renders the safe server error, and offers a retry. After a successful reply, sync and reload the selected provider.

- [ ] **Step 6: Run verification and commit**

Run: `npm.cmd test && npm.cmd run typecheck`

Expected: Gmail service-token, grouping, auto-sync, cached-fallback, route, and owner-isolation tests pass.

Commit: `git add app/api/business/messages components/Business/MessageWorkspace.tsx src/lib/business/business-message.service.ts src/lib/integrations/sync-engine.ts tests/business-messaging.test.ts tests/gmail-business-sync.test.ts tests/integration-sync-owner-isolation.test.ts && git commit -m "fix: sync Gmail conversations in business"`

### Task 5: Whole-product verification, documentation audit, and main publication

**Files:**
- Modify only files required by failures found in the verification commands.
- Review: `components/layout/Sidebar.tsx`, `components/AIChat/AIChatView.tsx`, `components/Memory/MemoryView.tsx`, `components/Files/FileView.tsx`, OAuth callback routes, and Polar checkout routes.

**Interfaces:**
- Produces: one verified main-branch state with all requested changes committed and pushed to `origin/main`.

- [ ] **Step 1: Run the full automated gate**

Run: `npm.cmd test`

Expected: every test prints `ok` and the final line reports all tests passed.

Run: `npm.cmd run typecheck`

Expected: exit code 0 with no TypeScript diagnostics.

Run: `npm.cmd run build`

Expected: Next.js production build exits 0 and includes `/api/storage/usage` and `/api/business/messages/sync`.

- [ ] **Step 2: Run targeted source and git-scope checks**

Run: `rg -n "navigator\.storage|measureLocalStorage|AUTH_SESSION_SECRET.*ENCRYPT|Notion-Version.*2022-06-28|getActiveAccessToken\(ownerId, tokenProvider\)" components src app`

Expected: no matches.

Run: `git status --short && git diff --check`

Expected: no whitespace errors; `.superpowers/` and `h origin main` remain untracked and unstaged.

- [ ] **Step 3: Verify the sidebar ordering and critical regressions**

Confirm `UpgradeButton` still renders immediately before `StorageStatus`, AI Chat remains the `/` home, files remain downloadable and categorized, memory/knowledge remain owner-scoped, and the OAuth/Polar route files are unchanged except for intentional docs or tests.

- [ ] **Step 4: Commit any verification fixes and push main**

If verification required fixes, stage only the named implementation/test/docs files and commit with `fix: complete account connection workflows`. Then run:

```bash
git status --short
git log -5 --oneline
git push origin main
```

Expected: push reports the new main range and exits 0; user-owned untracked files remain untouched.
