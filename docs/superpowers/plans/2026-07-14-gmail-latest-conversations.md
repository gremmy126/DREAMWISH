# Gmail Latest Conversations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a verified Gmail connection synchronize and display the latest 50 messages as threaded Business conversations, with explicit reconnect and retry states.

**Architecture:** Add one shared Gmail readiness module used by both Business message routes and the UI response contract. Remove the 30-day Gmail query, merge newly fetched message IDs into existing threads, and keep cached conversations on every blocked or failed response.

**Tech Stack:** Next.js 15 route handlers, React 19, TypeScript, Gmail REST API, owner-scoped JSON repositories, custom TypeScript test runner.

## Global Constraints

- Gmail reads exactly the latest 50 messages without a `newer_than` query.
- A connected token without a Gmail read scope is not sync-ready.
- Cached conversations remain visible when refresh, provider, or scope checks fail.
- Server responses never include OAuth access or refresh tokens.
- All Gmail records remain scoped by the authenticated `ownerId`.
- No background worker, webhook, or full-mailbox backfill is added.

---

### Task 1: Shared Gmail readiness

**Files:**
- Create: `src/lib/integrations/gmail-readiness.ts`
- Modify: `src/lib/oauth/token.service.ts`
- Test: `tests/gmail-business-sync.test.ts`

**Interfaces:**
- Consumes: `OAuthConnectionState`, `getOAuthConnectionStatus(ownerId, "google", "gmail")`, `getActiveAccessToken(ownerId, "google", "gmail")`.
- Produces: `hasGmailReadScope(scope: readonly string[]): boolean` and `getGmailSyncReadiness(ownerId: string): Promise<GmailSyncReadiness>`.

- [ ] **Step 1: Write failing readiness tests**

```ts
test("Gmail readiness rejects a connected token without read scope", async () => {
  const { hasGmailReadScope } = await import("../src/lib/integrations/gmail-readiness");
  assert.equal(hasGmailReadScope(["openid", "email"]), false);
  assert.equal(hasGmailReadScope(["https://www.googleapis.com/auth/gmail.readonly"]), true);
});

test("Gmail readiness module checks the Gmail service token", async () => {
  const source = await fs.readFile("src/lib/integrations/gmail-readiness.ts", "utf8");
  assert.match(source, /getOAuthConnectionStatus\(ownerId,\s*"google",\s*"gmail"\)/u);
  assert.match(source, /getActiveAccessToken\(ownerId,\s*"google",\s*"gmail"\)/u);
});
```

- [ ] **Step 2: Run the suite and verify RED**

Run: `npm test`

Expected: FAIL because `gmail-readiness.ts` does not exist.

- [ ] **Step 3: Implement the minimal readiness module**

```ts
export type GmailSyncReadiness = {
  status: Awaited<ReturnType<typeof getOAuthConnectionStatus>>;
  syncReady: boolean;
  syncBlockReason: "reconnect_required" | "missing_read_scope" | "token_unavailable" | null;
};

export function hasGmailReadScope(scope: readonly string[]) {
  return scope.some((item) =>
    item.includes("gmail.readonly") ||
    item.includes("gmail.modify") ||
    item.includes("mail.google.com")
  );
}

export async function getGmailSyncReadiness(ownerId: string): Promise<GmailSyncReadiness> {
  let status = await getOAuthConnectionStatus(ownerId, "google", "gmail");
  if (!hasGmailReadScope(status.scope)) {
    return { status, syncReady: false, syncBlockReason: "missing_read_scope" };
  }
  if (!["connected", "expired"].includes(status.connectionState)) {
    return { status, syncReady: false, syncBlockReason: "reconnect_required" };
  }
  try {
    const token = await getActiveAccessToken(ownerId, "google", "gmail");
    status = await getOAuthConnectionStatus(ownerId, "google", "gmail");
    return token
      ? { status, syncReady: true, syncBlockReason: null }
      : { status, syncReady: false, syncBlockReason: "token_unavailable" };
  } catch {
    return { status, syncReady: false, syncBlockReason: "token_unavailable" };
  }
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test`

Expected: readiness tests and the existing suite pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/integrations/gmail-readiness.ts tests/gmail-business-sync.test.ts
git commit -m "fix: classify Gmail sync readiness"
```

---

### Task 2: Latest-50 fetch and durable thread merge

**Files:**
- Modify: `src/lib/integrations/sync-engine.ts`
- Modify: `src/lib/repositories/gmail-thread.repository.ts`
- Modify: `src/lib/integrations/gmail-thread-grouping.ts`
- Test: `tests/gmail-business-sync.test.ts`

**Interfaces:**
- Consumes: `ManualSyncOptions.limit`, existing Gmail thread records for one owner.
- Produces: `buildGmailMessageListUrl(limit: number): URL` and merge-on-upsert thread persistence.

- [ ] **Step 1: Write failing latest-message and merge tests**

```ts
test("Gmail list URL requests the latest fifty messages without a date query", async () => {
  const { buildGmailMessageListUrl } = await import("../src/lib/integrations/sync-engine");
  const url = buildGmailMessageListUrl(50);
  assert.equal(url.searchParams.get("maxResults"), "50");
  assert.equal(url.searchParams.has("q"), false);
});

test("Gmail thread upsert retains existing message ids", async () => {
  await withTempDataDir(async () => {
    const { upsertGmailThreads, listGmailThreads } = await import("../src/lib/repositories/gmail-thread.repository");
    await upsertGmailThreads("owner-a", [{ id: "t", threadId: "thread-a", messageIds: ["m1"], subject: "One", updatedAt: "2026-01-01T00:00:00.000Z" }]);
    await upsertGmailThreads("owner-a", [{ id: "t", threadId: "thread-a", messageIds: ["m2"], subject: "Two", updatedAt: "2026-01-02T00:00:00.000Z" }]);
    assert.deepEqual((await listGmailThreads("owner-a"))[0]?.messageIds, ["m1", "m2"]);
  });
});
```

- [ ] **Step 2: Run the suite and verify RED**

Run: `npm test`

Expected: FAIL because the URL builder is not exported and thread upsert replaces `messageIds`.

- [ ] **Step 3: Implement the list URL and merge**

```ts
export function buildGmailMessageListUrl(limit: number) {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("maxResults", String(Math.min(50, Math.max(1, limit))));
  return url;
}
```

In `upsertGmailThreads`, replace an existing thread with:

```ts
const existing = db.threads[index]!;
db.threads[index] = {
  ...thread,
  messageIds: [...new Set([...existing.messageIds, ...thread.messageIds])]
};
```

Use `buildGmailMessageListUrl(50)` in `fetchGmailMessages`; do not set `q`.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test`

Expected: latest-message, merge, grouping, and owner-isolation tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/integrations/sync-engine.ts src/lib/repositories/gmail-thread.repository.ts src/lib/integrations/gmail-thread-grouping.ts tests/gmail-business-sync.test.ts
git commit -m "fix: sync latest Gmail conversations"
```

---

### Task 3: Business API readiness and safe cached failures

**Files:**
- Modify: `app/api/business/messages/route.ts`
- Modify: `app/api/business/messages/sync/route.ts`
- Test: `tests/gmail-business-sync.test.ts`
- Test: `tests/business-messaging.test.ts`

**Interfaces:**
- Consumes: `getGmailSyncReadiness(ownerId)` and `listBusinessConversations(ownerId, provider)`.
- Produces: response fields `syncReady: boolean` and `syncBlockReason: string | null` on Gmail GET and sync responses.

- [ ] **Step 1: Write failing route-contract tests**

```ts
test("Business Gmail GET exposes sync readiness", async () => {
  const source = await fs.readFile("app/api/business/messages/route.ts", "utf8");
  assert.match(source, /getGmailSyncReadiness/u);
  assert.match(source, /syncReady/u);
  assert.match(source, /syncBlockReason/u);
});

test("Business Gmail sync returns cached conversations for blocked readiness", async () => {
  const source = await fs.readFile("app/api/business/messages/sync/route.ts", "utf8");
  assert.match(source, /getGmailSyncReadiness/u);
  assert.match(source, /conversations:\s*cached/u);
  assert.match(source, /status:\s*409/u);
});
```

- [ ] **Step 2: Run the suite and verify RED**

Run: `npm test`

Expected: FAIL because the response fields and shared readiness call are absent.

- [ ] **Step 3: Implement route contracts**

For Gmail GET, return:

```ts
const readiness = await getGmailSyncReadiness(owner.uid);
return NextResponse.json({
  provider,
  status: readiness.status,
  syncReady: readiness.syncReady,
  syncBlockReason: readiness.syncBlockReason,
  conversations
});
```

For Gmail sync, check readiness before `runManualIntegrationSync`; use HTTP 409 with cached conversations when blocked and HTTP 502 with cached conversations when provider sync fails.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test`

Expected: Business route contracts pass.

- [ ] **Step 5: Commit**

```bash
git add app/api/business/messages/route.ts app/api/business/messages/sync/route.ts tests/gmail-business-sync.test.ts tests/business-messaging.test.ts
git commit -m "fix: expose Gmail sync readiness"
```

---

### Task 4: Business and Integrations UI states

**Files:**
- Modify: `components/Business/MessageWorkspace.tsx`
- Modify: `components/integrations/SyncButton.tsx`
- Test: `tests/gmail-business-sync.test.ts`

**Interfaces:**
- Consumes: `syncReady`, `syncBlockReason`, cached `conversations`, and `ConnectorSyncResult.status`.
- Produces: visible reconnect, retry, latest-50 empty state, and truthful manual sync status.

- [ ] **Step 1: Write failing UI contract tests**

```ts
test("Business Gmail UI distinguishes reconnect from an empty latest-fifty result", async () => {
  const source = await fs.readFile("components/Business/MessageWorkspace.tsx", "utf8");
  assert.match(source, /syncReady/u);
  assert.match(source, /Gmail 읽기 권한으로 다시 연결/u);
  assert.match(source, /최신 50개 Gmail 메일이 없습니다/u);
  assert.doesNotMatch(source, /최근 30일/u);
});

test("Integration sync button enables sync only after a successful result", async () => {
  const source = await fs.readFile("components/integrations/SyncButton.tsx", "utf8");
  assert.match(source, /data\.status === "success"/u);
  assert.match(source, /response\.ok/u);
});
```

- [ ] **Step 2: Run the suite and verify RED**

Run: `npm test`

Expected: FAIL on the new copy and success-only sync handling.

- [ ] **Step 3: Implement the UI state machine**

Extend `ResponseData` with:

```ts
syncReady?: boolean;
syncBlockReason?: "reconnect_required" | "missing_read_scope" | "token_unavailable" | null;
```

Auto-sync only when `result.syncReady === true`. When `missing_read_scope`, show the reconnect CTA and text `Gmail 읽기 권한으로 다시 연결해주세요.`. After a successful zero-result sync, show `최신 50개 Gmail 메일이 없습니다.`. In `SyncButton`, call `saveSetting(true)` only when `response.ok && data.status === "success"`; otherwise show the returned error or message.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test`

Expected: Gmail UI and integration sync tests pass.

- [ ] **Step 5: Run full verification**

Run: `npm run typecheck && npm run lint`

Expected: both commands exit 0 with no TypeScript or lint errors.

- [ ] **Step 6: Commit**

```bash
git add components/Business/MessageWorkspace.tsx components/integrations/SyncButton.tsx tests/gmail-business-sync.test.ts
git commit -m "fix: show truthful Gmail sync states"
```

