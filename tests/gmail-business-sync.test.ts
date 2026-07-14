import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("Gmail readiness rejects a connected token without read scope", async () => {
  const { hasGmailReadScope } = await import(
    "../src/lib/integrations/gmail-readiness"
  );

  assert.equal(hasGmailReadScope(["openid", "email"]), false);
  assert.equal(
    hasGmailReadScope(["https://www.googleapis.com/auth/gmail.readonly"]),
    true
  );
});

test("Gmail readiness checks the verified Gmail service token", async () => {
  const source = await fs.readFile(
    "src/lib/integrations/gmail-readiness.ts",
    "utf8"
  );

  assert.match(
    source,
    /getOAuthConnectionStatus\(ownerId,\s*"google",\s*"gmail"\)/u
  );
  assert.match(
    source,
    /getActiveAccessToken\(ownerId,\s*"google",\s*"gmail"\)/u
  );
});

test("Gmail thread grouping keeps every message in chronological order", async () => {
  const { groupGmailThreads } = await import(
    "../src/lib/integrations/gmail-thread-grouping"
  );
  const threads = groupGmailThreads([
    { id: "message-2", threadId: "thread-a", subject: "Re: Project", receivedAt: "2026-07-14T02:00:00.000Z" },
    { id: "message-1", threadId: "thread-a", subject: "Project", receivedAt: "2026-07-14T01:00:00.000Z" },
    { id: "message-3", threadId: "thread-b", subject: "Invoice", receivedAt: "2026-07-14T03:00:00.000Z" }
  ]);

  assert.deepEqual(threads, [
    {
      id: "gmail_thread_thread-b",
      threadId: "thread-b",
      messageIds: ["message-3"],
      subject: "Invoice",
      updatedAt: "2026-07-14T03:00:00.000Z"
    },
    {
      id: "gmail_thread_thread-a",
      threadId: "thread-a",
      messageIds: ["message-1", "message-2"],
      subject: "Re: Project",
      updatedAt: "2026-07-14T02:00:00.000Z"
    }
  ]);
});

test("Gmail sync selects the Gmail service token and groups before thread upsert", async () => {
  const source = await fs.readFile("src/lib/integrations/sync-engine.ts", "utf8");
  assert.match(source, /getActiveAccessToken\(ownerId,\s*"google",\s*"gmail"\)/u);
  assert.match(source, /groupGmailThreads/u);
  assert.doesNotMatch(source, /messageIds:\s*\[detail\.id\][\s\S]*upsertGmailThreads/u);
});

test("Gmail sync requests the latest 50 messages without a date filter", async () => {
  const { buildGmailMessageListUrl } = await import(
    "../src/lib/integrations/gmail-message-list-url"
  );
  const url = buildGmailMessageListUrl(50);

  assert.equal(url.searchParams.get("maxResults"), "50");
  assert.equal(url.searchParams.has("q"), false);
});

test("Gmail detail work preserves order with bounded concurrency", async () => {
  const { mapWithConcurrency } = await import(
    "../src/lib/integrations/promise-pool"
  );
  let active = 0;
  let maximum = 0;
  const values = Array.from({ length: 12 }, (_, index) => index);
  const result = await mapWithConcurrency(values, 3, async (value) => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    return value * 2;
  });

  assert.deepEqual(result, values.map((value) => value * 2));
  assert.ok(maximum <= 3);
});

test("Gmail sync bounds detail concurrency and aborts stalled provider calls", async () => {
  const source = await fs.readFile("src/lib/integrations/sync-engine.ts", "utf8");
  assert.match(source, /mapWithConcurrency/u);
  assert.match(source, /AbortSignal\.timeout/u);
});

test("Gmail thread upsert preserves message ids from earlier syncs", async () => {
  await withTempDataDir(async () => {
    const { listGmailThreads, upsertGmailThreads } = await import(
      "../src/lib/repositories/gmail-thread.repository"
    );

    await upsertGmailThreads("owner-a", [
      {
        id: "gmail_thread_thread-a",
        threadId: "thread-a",
        messageIds: ["message-1"],
        subject: "Project",
        updatedAt: "2026-07-14T01:00:00.000Z"
      }
    ]);
    await upsertGmailThreads("owner-a", [
      {
        id: "gmail_thread_thread-a",
        threadId: "thread-a",
        messageIds: ["message-2"],
        subject: "Re: Project",
        updatedAt: "2026-07-14T02:00:00.000Z"
      }
    ]);

    assert.deepEqual(await listGmailThreads("owner-a"), [
      {
        ownerId: "owner-a",
        id: "gmail_thread_thread-a",
        threadId: "thread-a",
        messageIds: ["message-1", "message-2"],
        subject: "Re: Project",
        updatedAt: "2026-07-14T02:00:00.000Z"
      }
    ]);
  });
});

test("Business messages expose a protected POST sync endpoint with scope checks", async () => {
  const source = await fs.readFile("app/api/business/messages/sync/route.ts", "utf8");
  assert.match(source, /requireOwnerContext\(request\)/u);
  assert.match(source, /getGmailSyncReadiness/u);
  assert.match(source, /runManualIntegrationSync/u);
  assert.match(source, /conversations/u);
  assert.match(source, /sync\.status === "failed"/u);
});

test("Business message GET exposes Gmail readiness and latest sync summary", async () => {
  const source = await fs.readFile("app/api/business/messages/route.ts", "utf8");
  assert.match(source, /getGmailSyncReadiness/u);
  assert.match(source, /syncReady/u);
  assert.match(source, /syncBlockReason/u);
  assert.match(source, /latestSync/u);
});

test("Business message UI auto-syncs Gmail once and explains blocked or empty states", async () => {
  const source = await fs.readFile("components/Business/MessageWorkspace.tsx", "utf8");
  assert.match(source, /useRef/u);
  assert.match(source, /autoSyncAttempted/u);
  assert.match(source, /fetch\("\/api\/business\/messages\/sync"/u);
  assert.match(source, /method:\s*"POST"/u);
  assert.match(source, /syncReady/u);
  assert.match(source, /missing_read_scope/u);
  assert.match(source, /최신 50개/u);
});

test("Business message GET remains a cache-only read", async () => {
  const source = await fs.readFile("app/api/business/messages/route.ts", "utf8");
  assert.doesNotMatch(source, /runManualIntegrationSync/u);
  assert.doesNotMatch(source, /searchParams\.get\("sync"\)/u);
});

test("Integration sync button enables settings only after a successful sync", async () => {
  const source = await fs.readFile("components/integrations/SyncButton.tsx", "utf8");
  assert.match(source, /response\.ok/u);
  assert.match(source, /data\.status\s*!==\s*"success"/u);
  assert.match(source, /await saveSetting\(true\)/u);
  assert.match(source, /최신 50개 Sync/u);
});

async function withTempDataDir(run: () => Promise<void>) {
  const previous = process.env.DATA_DIR;
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "gmail-sync-test-"));
  process.env.DATA_DIR = dataDir;
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}
