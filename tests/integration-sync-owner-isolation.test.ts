import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listCalendarEvents, upsertCalendarEvents } from "../src/lib/repositories/calendar-event.repository";
import {
  addExternalIdentityMatch,
  listExternalIdentityMatches
} from "../src/lib/repositories/external-identity-match.repository";
import {
  listGmailAttachments,
  upsertGmailAttachments
} from "../src/lib/repositories/gmail-attachment.repository";
import { listGmailMessages, upsertGmailMessages } from "../src/lib/repositories/gmail-message.repository";
import { listGmailThreads, upsertGmailThreads } from "../src/lib/repositories/gmail-thread.repository";
import { listSlackChannels, upsertSlackChannels } from "../src/lib/repositories/slack-channel.repository";
import { listSlackMessages, upsertSlackMessages } from "../src/lib/repositories/slack-message.repository";
import {
  listSlackWorkspaces,
  upsertSlackWorkspace
} from "../src/lib/repositories/slack-workspace.repository";
import { addSyncHistory, listSyncHistory } from "../src/lib/repositories/sync-history.repository";
import type { ExternalEvent, ExternalMessage } from "../src/lib/integrations/types";

test("integration sync storage and read APIs require an authenticated owner", () => {
  const repositories = [
    "src/lib/repositories/gmail-message.repository.ts",
    "src/lib/repositories/gmail-thread.repository.ts",
    "src/lib/repositories/gmail-attachment.repository.ts",
    "src/lib/repositories/calendar-event.repository.ts",
    "src/lib/repositories/slack-message.repository.ts",
    "src/lib/repositories/slack-channel.repository.ts",
    "src/lib/repositories/slack-workspace.repository.ts",
    "src/lib/repositories/external-identity-match.repository.ts",
    "src/lib/repositories/sync-history.repository.ts"
  ];

  for (const repository of repositories) {
    const source = fs.readFileSync(repository, "utf8");
    assert.match(source, /ownerId/u, repository);
    assert.match(source, /item\.ownerId === ownerId/u, repository);
  }

  const syncEngine = fs.readFileSync("src/lib/integrations/sync-engine.ts", "utf8");
  for (const call of [
    "upsertGmailMessages",
    "upsertGmailThreads",
    "upsertGmailAttachments",
    "upsertCalendarEvents",
    "upsertSlackMessages",
    "upsertSlackChannels",
    "addExternalIdentityMatch",
    "addSyncHistory"
  ]) {
    assert.match(syncEngine, new RegExp(`${call}\\(\\s*ownerId`, "u"), call);
  }

  const matchesRoute = fs.readFileSync("app/api/integrations/matches/route.ts", "utf8");
  const historyRoute = fs.readFileSync("app/api/integrations/sync-history/route.ts", "utf8");
  for (const route of [matchesRoute, historyRoute]) {
    assert.match(route, /requireOwnerContext\(request\)/u);
    assert.match(route, /owner\.uid/u);
  }
});

test("integration sync records use owner and external identity as a compound key", async () => {
  await withTempDataDir(async () => {
    const messageA = createMessage("gmail", "A message");
    const messageB = createMessage("gmail", "B message");
    await upsertGmailMessages("owner-a", [messageA]);
    await upsertGmailMessages("owner-b", [messageB]);
    await upsertGmailThreads("owner-a", [createThread("A thread")]);
    await upsertGmailThreads("owner-b", [createThread("B thread")]);
    await upsertGmailAttachments("owner-a", [createAttachment("a.txt")]);
    await upsertGmailAttachments("owner-b", [createAttachment("b.txt")]);

    await upsertCalendarEvents("owner-a", [createEvent("A event")]);
    await upsertCalendarEvents("owner-b", [createEvent("B event")]);
    await upsertSlackMessages("owner-a", [createMessage("slack", "A Slack")]);
    await upsertSlackMessages("owner-b", [createMessage("slack", "B Slack")]);
    await upsertSlackChannels("owner-a", [createChannel("A channel")]);
    await upsertSlackChannels("owner-b", [createChannel("B channel")]);
    await upsertSlackWorkspace("owner-a", createWorkspace("A workspace"));
    await upsertSlackWorkspace("owner-b", createWorkspace("B workspace"));

    await addExternalIdentityMatch("owner-a", createMatch("A contact"));
    await addExternalIdentityMatch("owner-b", createMatch("B contact"));
    await addSyncHistory("owner-a", createHistory("A history"));
    await addSyncHistory("owner-b", createHistory("B history"));

    assert.equal((await listGmailMessages("owner-a"))[0].subject, "A message");
    assert.equal((await listGmailThreads("owner-a"))[0].subject, "A thread");
    assert.equal((await listGmailAttachments("owner-a"))[0].fileName, "a.txt");
    assert.equal((await listCalendarEvents("owner-a"))[0].title, "A event");
    assert.equal((await listSlackMessages("owner-a"))[0].subject, "A Slack");
    assert.equal((await listSlackChannels("owner-a"))[0].name, "A channel");
    assert.equal((await listSlackWorkspaces("owner-a"))[0].teamName, "A workspace");
    assert.equal((await listExternalIdentityMatches("owner-a"))[0].candidateName, "A contact");
    assert.equal((await listSyncHistory("owner-a"))[0].message, "A history");

    for (const records of [
      await listGmailMessages("owner-a"),
      await listGmailThreads("owner-a"),
      await listGmailAttachments("owner-a"),
      await listCalendarEvents("owner-a"),
      await listSlackMessages("owner-a"),
      await listSlackChannels("owner-a"),
      await listSlackWorkspaces("owner-a"),
      await listExternalIdentityMatches("owner-a"),
      await listSyncHistory("owner-a")
    ]) {
      assert.deepEqual(records.map((item) => item.ownerId), ["owner-a"]);
    }
  });
});

test("legacy ownerless sync records remain quarantined", async () => {
  await withTempDataDir(async (dataDir) => {
    await fs.promises.writeFile(
      path.join(dataDir, "gmail-messages.json"),
      JSON.stringify({ messages: [createMessage("gmail", "legacy")] }),
      "utf8"
    );
    await fs.promises.writeFile(
      path.join(dataDir, "external-identity-matches.json"),
      JSON.stringify({ matches: [createMatch("legacy")] }),
      "utf8"
    );
    await fs.promises.writeFile(
      path.join(dataDir, "sync-history.json"),
      JSON.stringify({ history: [createHistory("legacy")] }),
      "utf8"
    );

    assert.deepEqual(await listGmailMessages("owner-a"), []);
    assert.deepEqual(await listExternalIdentityMatches("owner-a"), []);
    assert.deepEqual(await listSyncHistory("owner-a"), []);
  });
});

function createMessage(integrationId: "gmail" | "slack", subject: string): ExternalMessage {
  return {
    id: `${integrationId}-record`,
    integrationId,
    externalId: "shared-external-id",
    source: integrationId,
    sender: "sender@example.com",
    recipients: ["recipient@example.com"],
    subject,
    bodyPreview: subject,
    bodyText: subject,
    receivedAt: "2026-07-13T00:00:00.000Z",
    relatedCustomerId: null,
    relatedProjectId: null,
    createdAt: "2026-07-13T00:00:00.000Z"
  };
}

function createEvent(title: string): ExternalEvent {
  return {
    id: "calendar-record",
    integrationId: "calendar",
    externalId: "shared-external-id",
    title,
    description: title,
    startTime: "2026-07-13T00:00:00.000Z",
    endTime: "2026-07-13T01:00:00.000Z",
    attendees: [],
    location: "",
    relatedCustomerId: null,
    relatedProjectId: null,
    createdAt: "2026-07-13T00:00:00.000Z"
  };
}

function createThread(subject: string) {
  return {
    id: "thread-record",
    threadId: "shared-thread-id",
    messageIds: ["shared-external-id"],
    subject,
    updatedAt: "2026-07-13T00:00:00.000Z"
  };
}

function createAttachment(fileName: string) {
  return {
    id: "attachment-record",
    messageId: "shared-external-id",
    attachmentId: "shared-attachment-id",
    fileName,
    mimeType: "text/plain",
    size: 1,
    createdAt: "2026-07-13T00:00:00.000Z"
  };
}

function createChannel(name: string) {
  return {
    id: "channel-record",
    channelId: "shared-channel-id",
    name,
    isPrivate: false,
    updatedAt: "2026-07-13T00:00:00.000Z"
  };
}

function createWorkspace(teamName: string) {
  return {
    id: "workspace-record",
    teamId: "shared-team-id",
    teamName,
    connectedAt: "2026-07-13T00:00:00.000Z"
  };
}

function createMatch(candidateName: string) {
  return {
    id: "shared-match-id",
    source: "gmail" as const,
    externalId: "shared-external-id",
    email: "candidate@example.com",
    candidateName,
    candidateType: "contact" as const,
    confidence: 0.8,
    status: "suggested" as const,
    createdAt: "2026-07-13T00:00:00.000Z"
  };
}

function createHistory(message: string) {
  return {
    connectorId: "gmail",
    status: "success" as const,
    readCount: 1,
    normalizedCount: 1,
    historyId: "shared-history-id",
    message,
    ranAt: "2026-07-13T00:00:00.000Z"
  };
}

async function withTempDataDir(run: (dataDir: string) => Promise<void>) {
  const previous = process.env.DATA_DIR;
  const dataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "dreamwish-sync-owner-"));
  process.env.DATA_DIR = dataDir;
  try {
    await run(dataDir);
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    await fs.promises.rm(dataDir, { recursive: true, force: true });
  }
}
