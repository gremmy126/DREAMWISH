import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { readJsonStore, withJsonStoreLock, writeJsonStore } from "../local-db/json-store";

export type AutomationWebhook = {
  id: string;
  ownerId: string;
  scenarioId: string;
  secret: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  /** Recent external event ids, kept for idempotent redelivery handling. */
  recentEventIds: string[];
  requestCount: number;
  lastRequestAt: string | null;
};

type WebhookDb = { webhooks: AutomationWebhook[] };

const FILE_NAME = "automation-webhooks.json";
const EMPTY_DB: WebhookDb = { webhooks: [] };
const MAX_RECENT_EVENTS = 200;

export async function createAutomationWebhook(ownerId: string, scenarioId: string) {
  return accessDb((db) => {
    const existing = db.webhooks.find(
      (webhook) => webhook.ownerId === ownerId && webhook.scenarioId === scenarioId
    );
    if (existing) return structuredClone(existing);
    const now = new Date().toISOString();
    const webhook: AutomationWebhook = {
      id: randomUUID().replace(/-/gu, ""),
      ownerId,
      scenarioId,
      secret: randomBytes(24).toString("base64url"),
      active: true,
      createdAt: now,
      updatedAt: now,
      recentEventIds: [],
      requestCount: 0,
      lastRequestAt: null
    };
    db.webhooks.unshift(webhook);
    return structuredClone(webhook);
  });
}

export async function listAutomationWebhooks(ownerId: string, scenarioId?: string) {
  return accessDb((db) =>
    db.webhooks
      .filter(
        (webhook) =>
          webhook.ownerId === ownerId && (!scenarioId || webhook.scenarioId === scenarioId)
      )
      .map((webhook) => structuredClone(webhook))
  );
}

/** Global lookup for the public delivery route — the webhook id IS the credential scope. */
export async function findAutomationWebhookById(webhookId: string) {
  return accessDb((db) => {
    const webhook = db.webhooks.find((candidate) => candidate.id === webhookId);
    return webhook ? structuredClone(webhook) : null;
  });
}

export async function setAutomationWebhookActive(
  ownerId: string,
  webhookId: string,
  active: boolean
) {
  return accessDb((db) => {
    const webhook = db.webhooks.find(
      (candidate) => candidate.ownerId === ownerId && candidate.id === webhookId
    );
    if (!webhook) return null;
    webhook.active = active;
    webhook.updatedAt = new Date().toISOString();
    return structuredClone(webhook);
  });
}

/**
 * Records a delivery; returns false when the external event id was already
 * processed so redeliveries never run the workflow twice.
 */
export async function recordWebhookDelivery(
  webhookId: string,
  externalEventId: string | null
): Promise<boolean> {
  return accessDb((db) => {
    const webhook = db.webhooks.find((candidate) => candidate.id === webhookId);
    if (!webhook) return false;
    if (externalEventId) {
      if (webhook.recentEventIds.includes(externalEventId)) return false;
      webhook.recentEventIds.unshift(externalEventId);
      if (webhook.recentEventIds.length > MAX_RECENT_EVENTS) {
        webhook.recentEventIds = webhook.recentEventIds.slice(0, MAX_RECENT_EVENTS);
      }
    }
    webhook.requestCount += 1;
    webhook.lastRequestAt = new Date().toISOString();
    return true;
  });
}

/** Constant-time secret comparison; also accepts an HMAC-SHA256 signature of the body. */
export function verifyWebhookSecret(
  webhook: Pick<AutomationWebhook, "secret">,
  provided: { secretHeader?: string | null; signatureHeader?: string | null; rawBody?: string }
): boolean {
  if (provided.secretHeader) {
    return safeEqual(provided.secretHeader, webhook.secret);
  }
  if (provided.signatureHeader && provided.rawBody !== undefined) {
    const expected = `sha256=${createHmac("sha256", webhook.secret)
      .update(provided.rawBody)
      .digest("hex")}`;
    return safeEqual(provided.signatureHeader, expected);
  }
  return false;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

async function accessDb<T>(operation: (db: WebhookDb) => T | Promise<T>): Promise<T> {
  return withJsonStoreLock(FILE_NAME, async () => {
    const raw = await readJsonStore<WebhookDb>(FILE_NAME, EMPTY_DB);
    const db: WebhookDb = { webhooks: Array.isArray(raw.webhooks) ? raw.webhooks : [] };
    const result = await operation(db);
    await writeJsonStore(FILE_NAME, db);
    return result;
  });
}
