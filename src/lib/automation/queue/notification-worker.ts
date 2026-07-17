import { randomUUID } from "node:crypto";
import type { ActionValue } from "../registry/action.types";
import type { NotificationChannel } from "./notification-outbox";
import {
  claimNotification,
  markNotificationFailed,
  markNotificationSent,
  recordNotificationInbox
} from "./notification-outbox";

export type NotificationEnvelope = {
  id: string;
  ownerId: string;
  channel: NotificationChannel;
  dedupeKey: string;
  safePayload: Record<string, ActionValue>;
};

export interface NotificationChannelAdapter {
  supports(channel: NotificationChannel): boolean;
  send(envelope: NotificationEnvelope): Promise<{ providerReceiptId: string }>;
}

export class NotificationOutboxWorker {
  constructor(
    private readonly workerId: string,
    private readonly adapters: readonly NotificationChannelAdapter[] = defaultNotificationAdapters()
  ) {}

  async runOnce() {
    const row = await claimNotification(this.workerId);
    if (!row) return { claimed: false as const };
    const envelope = mapEnvelope(row as Record<string, unknown>);
    const adapter = this.adapters.find((candidate) => candidate.supports(envelope.channel));
    try {
      if (!adapter) throw Object.assign(new Error(`Notification channel is not configured: ${envelope.channel}`), { code: "NOTIFICATION_CHANNEL_UNCONFIGURED" });
      const result = await adapter.send(envelope);
      await recordNotificationInbox({
        ownerId: envelope.ownerId,
        channel: envelope.channel,
        providerReceiptId: result.providerReceiptId,
        dedupeKey: envelope.dedupeKey,
        safePayload: envelope.safePayload
      });
      await markNotificationSent({ id: envelope.id, workerId: this.workerId, providerReceiptId: result.providerReceiptId });
      return { claimed: true as const, sent: true as const, id: envelope.id };
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "NOTIFICATION_SEND_FAILED";
      const message = error instanceof Error ? error.message : "Notification send failed.";
      await markNotificationFailed({ id: envelope.id, workerId: this.workerId, errorCode: code, errorMessage: message.slice(0, 1_000) });
      return { claimed: true as const, sent: false as const, id: envelope.id };
    }
  }
}

function defaultNotificationAdapters(): NotificationChannelAdapter[] {
  return [inAppNotificationAdapter, webhookNotificationAdapter];
}

const inAppNotificationAdapter: NotificationChannelAdapter = {
  supports(channel) { return channel === "in_app"; },
  async send(envelope) { return { providerReceiptId: `in-app:${envelope.dedupeKey}` }; }
};

const webhookNotificationAdapter: NotificationChannelAdapter = {
  supports(channel) { return channel !== "in_app" && Boolean(notificationEndpoint(channel)); },
  async send(envelope) {
    const endpoint = notificationEndpoint(envelope.channel);
    if (!endpoint) throw Object.assign(new Error(`Notification provider is not configured for ${envelope.channel}.`), { code: "NOTIFICATION_PROVIDER_UNCONFIGURED" });
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": envelope.dedupeKey },
      body: JSON.stringify({ ownerId: envelope.ownerId, channel: envelope.channel, event: envelope.safePayload })
    });
    if (!response.ok) throw Object.assign(new Error(`Notification provider returned HTTP ${response.status}.`), { code: "NOTIFICATION_PROVIDER_FAILED" });
    return { providerReceiptId: response.headers.get("x-request-id") || `notification:${randomUUID()}` };
  }
};

function notificationEndpoint(channel: NotificationChannel) {
  if (channel === "email") return process.env.AUTOMATION_EMAIL_NOTIFICATION_URL?.trim() || null;
  if (channel === "slack") return process.env.AUTOMATION_SLACK_NOTIFICATION_URL?.trim() || null;
  if (channel === "browser") return process.env.AUTOMATION_BROWSER_NOTIFICATION_URL?.trim() || null;
  if (channel === "mobile" || channel === "mobile_push") return process.env.AUTOMATION_MOBILE_PUSH_NOTIFICATION_URL?.trim() || null;
  return null;
}

function mapEnvelope(row: Record<string, unknown>): NotificationEnvelope {
  const channel = String(row.channel) as NotificationChannel;
  if (!["in_app", "email", "slack", "browser", "mobile", "mobile_push"].includes(channel)) {
    throw new Error("Notification Outbox contains an unsupported channel.");
  }
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    channel,
    dedupeKey: String(row.dedupe_key),
    safePayload: structuredClone((row.safe_payload || {}) as Record<string, ActionValue>)
  };
}
