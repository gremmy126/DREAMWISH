import assert from "node:assert/strict";
import fs from "node:fs/promises";

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

test("Business messages expose a protected POST sync endpoint with scope checks", async () => {
  const source = await fs.readFile("app/api/business/messages/sync/route.ts", "utf8");
  assert.match(source, /requireOwnerContext\(request\)/u);
  assert.match(source, /gmail\.readonly/u);
  assert.match(source, /runManualIntegrationSync/u);
  assert.match(source, /conversations/u);
  assert.match(source, /sync\.status === "failed"/u);
});

test("Business message UI auto-syncs Gmail once per mounted session and keeps manual sync", async () => {
  const source = await fs.readFile("components/Business/MessageWorkspace.tsx", "utf8");
  assert.match(source, /useRef/u);
  assert.match(source, /autoSyncAttempted/u);
  assert.match(source, /fetch\("\/api\/business\/messages\/sync"/u);
  assert.match(source, /method:\s*"POST"/u);
  assert.match(source, /최근 30일/u);
});

test("Business message GET remains a cache-only read", async () => {
  const source = await fs.readFile("app/api/business/messages/route.ts", "utf8");
  assert.doesNotMatch(source, /runManualIntegrationSync/u);
  assert.doesNotMatch(source, /searchParams\.get\("sync"\)/u);
});
