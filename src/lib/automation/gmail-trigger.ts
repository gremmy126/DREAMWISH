import { readJsonStore, withJsonStoreLock, writeJsonStore } from "../local-db/json-store";
import { getActiveAccessToken } from "../oauth/token.service";
import { recordAutomationRun } from "./run.repository";
import { executeScenarioGraph } from "./workflow-engine";
import type { AutomationScenario, ScenarioNode } from "./scenario-designer";
import { hasPostgresStorage } from "../db/postgres";
import { enqueueScenarioExecution } from "./runtime/execution-enqueue.service";

/**
 * Scheduled Gmail polling trigger: each scheduler pass checks for new mail
 * with the owner's OAuth token, keeps an internalDate cursor plus processed
 * message ids (idempotent across restarts), and runs the workflow once per
 * new message with {{trigger.email.*}} data.
 */

type CursorDb = {
  cursors: Array<{
    ownerId: string;
    scenarioId: string;
    lastInternalDate: number;
    processedIds: string[];
  }>;
};

const FILE_NAME = "automation-trigger-cursors.json";
const EMPTY_DB: CursorDb = { cursors: [] };
const MAX_PROCESSED_IDS = 100;
const MAX_MESSAGES_PER_PASS = 3;

export type GmailPollDeps = {
  fetchFn?: typeof fetch;
  getToken?: (ownerId: string) => Promise<string | null>;
};

export type GmailPollResult = {
  checked: boolean;
  newMessages: number;
  skippedReason?: "not_watching" | "no_token" | "api_error";
};

export function isGmailWatchNode(node: ScenarioNode): boolean {
  return node.appId === "schedule" && node.config?.watchGmail === true;
}

export async function pollGmailForScenario(
  scenario: AutomationScenario,
  deps: GmailPollDeps = {}
): Promise<GmailPollResult> {
  const watchNode = scenario.nodes.find(isGmailWatchNode);
  if (!watchNode) return { checked: false, newMessages: 0, skippedReason: "not_watching" };

  const getToken =
    deps.getToken || ((ownerId: string) => getActiveAccessToken(ownerId, "google", "gmail"));
  const fetchFn = deps.fetchFn || fetch;
  const token = await getToken(scenario.ownerId);
  if (!token) return { checked: false, newMessages: 0, skippedReason: "no_token" };

  const cursor = await readCursor(scenario.ownerId, scenario.id);
  const queryParts = ["-in:chats", "newer_than:2d"];
  const fromFilter = String(watchNode.config.gmailFrom || "").trim();
  const subjectFilter = String(watchNode.config.gmailSubject || "").trim();
  if (fromFilter) queryParts.push(`from:${fromFilter}`);
  if (subjectFilter) queryParts.push(`subject:"${subjectFilter.replace(/"/gu, "")}"`);

  let listData: { messages?: Array<{ id: string }> };
  try {
    const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    listUrl.searchParams.set("q", queryParts.join(" "));
    listUrl.searchParams.set("maxResults", "5");
    const listResponse = await fetchFn(listUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!listResponse.ok) return { checked: true, newMessages: 0, skippedReason: "api_error" };
    listData = (await listResponse.json()) as { messages?: Array<{ id: string }> };
  } catch {
    return { checked: true, newMessages: 0, skippedReason: "api_error" };
  }

  const candidates = (listData.messages || [])
    .map((message) => message.id)
    .filter((id) => !cursor.processedIds.includes(id))
    .slice(0, MAX_MESSAGES_PER_PASS);

  let newMessages = 0;
  let maxInternalDate = cursor.lastInternalDate;
  const processed: string[] = [];

  for (const messageId of candidates) {
    try {
      const getUrl = new URL(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`
      );
      getUrl.searchParams.set("format", "metadata");
      getUrl.searchParams.append("metadataHeaders", "From");
      getUrl.searchParams.append("metadataHeaders", "Subject");
      const messageResponse = await fetchFn(getUrl.toString(), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!messageResponse.ok) continue;
      const message = (await messageResponse.json()) as {
        id: string;
        snippet?: string;
        internalDate?: string;
        payload?: { headers?: Array<{ name: string; value: string }> };
      };
      const internalDate = Number(message.internalDate || 0);
      if (internalDate <= cursor.lastInternalDate) {
        processed.push(messageId);
        continue;
      }
      const headers = new Map(
        (message.payload?.headers || []).map((header) => [header.name.toLowerCase(), header.value])
      );
      const triggerData = {
        email: {
          id: message.id,
          from: headers.get("from") || "",
          subject: headers.get("subject") || "",
          snippet: message.snippet || "",
          receivedAt: internalDate ? new Date(internalDate).toISOString() : null
        }
      };
      if (hasPostgresStorage()) {
        await enqueueScenarioExecution({
          ownerId: scenario.ownerId,
          actorId: "gmail-poll-worker",
          scenario,
          executionMode: "live",
          triggerType: "gmail_watch",
          triggerEventId: message.id,
          triggerData,
          priority: 20
        });
        newMessages += 1;
        processed.push(messageId);
        if (internalDate > maxInternalDate) maxInternalDate = internalDate;
        continue;
      }
      const startedAt = new Date().toISOString();
      const result = executeScenarioGraph(scenario, { triggerData });
      await recordAutomationRun({
        ownerId: scenario.ownerId,
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        trigger: "schedule",
        status: result.status,
        steps: result.steps,
        triggerData,
        waiting: result.waiting ? { ...result.waiting, context: result.context } : null,
        error: null,
        startedAt,
        finishedAt: new Date().toISOString()
      });
      newMessages += 1;
      processed.push(messageId);
      if (internalDate > maxInternalDate) maxInternalDate = internalDate;
    } catch {
      // A single bad message never blocks the polling pass.
    }
  }

  if (processed.length > 0 || maxInternalDate !== cursor.lastInternalDate) {
    await writeCursor(scenario.ownerId, scenario.id, maxInternalDate, [
      ...processed,
      ...cursor.processedIds
    ]);
  }
  return { checked: true, newMessages };
}

async function readCursor(ownerId: string, scenarioId: string) {
  return accessDb((db) => {
    const cursor = db.cursors.find(
      (candidate) => candidate.ownerId === ownerId && candidate.scenarioId === scenarioId
    );
    return cursor
      ? { lastInternalDate: cursor.lastInternalDate, processedIds: [...cursor.processedIds] }
      : { lastInternalDate: 0, processedIds: [] as string[] };
  });
}

async function writeCursor(
  ownerId: string,
  scenarioId: string,
  lastInternalDate: number,
  processedIds: string[]
) {
  await accessDb((db) => {
    const cursor = db.cursors.find(
      (candidate) => candidate.ownerId === ownerId && candidate.scenarioId === scenarioId
    );
    const bounded = processedIds.slice(0, MAX_PROCESSED_IDS);
    if (cursor) {
      cursor.lastInternalDate = lastInternalDate;
      cursor.processedIds = bounded;
    } else {
      db.cursors.push({ ownerId, scenarioId, lastInternalDate, processedIds: bounded });
    }
  });
}

async function accessDb<T>(operation: (db: CursorDb) => T | Promise<T>): Promise<T> {
  return withJsonStoreLock(FILE_NAME, async () => {
    const raw = await readJsonStore<CursorDb>(FILE_NAME, EMPTY_DB);
    const db: CursorDb = { cursors: Array.isArray(raw.cursors) ? raw.cursors : [] };
    const result = await operation(db);
    await writeJsonStore(FILE_NAME, db);
    return result;
  });
}
