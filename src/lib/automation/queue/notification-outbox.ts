import { createHash, randomUUID } from "node:crypto";
import { getPostgres } from "../../db/postgres";
import type { ActionValue } from "../registry/action.types";
import { ensureAutomationRuntimeSchema } from "../runtime/schema";

export type NotificationChannel = "in_app" | "email" | "slack" | "browser" | "mobile" | "mobile_push";
const CHANNELS: readonly NotificationChannel[] = ["in_app", "email", "slack", "browser", "mobile", "mobile_push"];

export function normalizeNotificationChannels(channels: readonly string[]): NotificationChannel[] {
  const unique = [...new Set(channels.filter((channel): channel is NotificationChannel => CHANNELS.includes(channel as NotificationChannel)))];
  return unique.length > 0 ? unique : ["in_app"];
}

export function notificationDedupeKey(subjectId: string, eventType: string, channel: NotificationChannel, recipientId: string) {
  return createHash("sha256")
    .update(`automation-notification-v1\0${subjectId}\0${eventType}\0${channel}\0${recipientId}`)
    .digest("hex");
}

export async function enqueueApprovalNotifications(input: {
  ownerId: string;
  recipientId: string;
  approvalRequestId: string;
  eventType: string;
  channels: string[];
  safePayload: Record<string, ActionValue>;
}) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const inserted: string[] = [];
  for (const channel of normalizeNotificationChannels(input.channels)) {
    const id = randomUUID();
    const dedupeKey = notificationDedupeKey(input.approvalRequestId, input.eventType, channel, input.recipientId);
    const rows = await sql`
      INSERT INTO automation_notification_outbox (
        id, owner_id, approval_request_id, event_id, channel, dedupe_key, safe_payload
      ) VALUES (
        ${id}, ${input.ownerId}, ${input.approvalRequestId}, ${input.eventType}, ${channel},
        ${dedupeKey}, ${sql.json(input.safePayload as never)}
      )
      ON CONFLICT (dedupe_key) DO NOTHING
      RETURNING id
    `;
    if (rows[0]) inserted.push(String(rows[0].id));
  }
  return inserted;
}

export async function enqueueConnectionNotification(input: {
  ownerId: string;
  connectionId: string;
  eventType: string;
  channels?: string[];
  safePayload: Record<string, ActionValue>;
}) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const inserted: string[] = [];
  for (const channel of normalizeNotificationChannels(input.channels || ["in_app", "email"])) {
    const id = randomUUID();
    const dedupeKey = notificationDedupeKey(input.connectionId, input.eventType, channel, input.ownerId);
    const rows = await sql`
      INSERT INTO automation_notification_outbox (
        id, owner_id, event_id, channel, dedupe_key, safe_payload
      ) VALUES (
        ${id}, ${input.ownerId}, ${`connection:${input.connectionId}:${input.eventType}`}, ${channel},
        ${dedupeKey}, ${sql.json(input.safePayload as never)}
      )
      ON CONFLICT (dedupe_key) DO NOTHING
      RETURNING id
    `;
    if (rows[0]) inserted.push(String(rows[0].id));
  }
  return inserted;
}

export async function claimNotification(workerId: string, leaseMs = 30_000) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const boundedLease = Math.max(5_000, Math.min(300_000, Math.trunc(leaseMs)));
  return sql.begin(async (transaction) => {
    const candidates = await transaction`
      SELECT id FROM automation_notification_outbox
      WHERE sent_at IS NULL
        AND next_attempt_at <= NOW()
        AND attempt < max_attempts
        AND (locked_until IS NULL OR locked_until < NOW())
      ORDER BY next_attempt_at, created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `;
    if (!candidates[0]) return null;
    const rows = await transaction`
      UPDATE automation_notification_outbox
      SET worker_id = ${workerId}, locked_until = NOW() + (${boundedLease} * INTERVAL '1 millisecond'),
          attempt = attempt + 1, updated_at = NOW()
      WHERE id = ${String(candidates[0].id)}
      RETURNING *
    `;
    return rows[0] || null;
  });
}

export async function markNotificationSent(input: { id: string; workerId: string; providerReceiptId?: string | null }) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const rows = await sql`
    UPDATE automation_notification_outbox
    SET sent_at = NOW(), provider_receipt_id = ${input.providerReceiptId || null},
        locked_until = NULL, worker_id = NULL, updated_at = NOW()
    WHERE id = ${input.id} AND worker_id = ${input.workerId} AND locked_until > NOW()
    RETURNING id
  `;
  return Boolean(rows[0]);
}

export async function markNotificationFailed(input: { id: string; workerId: string; errorCode?: string; errorMessage?: string }) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const rows = await sql`
    UPDATE automation_notification_outbox
    SET next_attempt_at = NOW() + (LEAST(900000, 1000 * POWER(2, attempt)) * INTERVAL '1 millisecond'),
        error_code = ${input.errorCode || null}, error_message = ${input.errorMessage || null},
        locked_until = NULL, worker_id = NULL, updated_at = NOW()
    WHERE id = ${input.id} AND worker_id = ${input.workerId}
    RETURNING id
  `;
  return Boolean(rows[0]);
}

export async function recordNotificationInbox(input: {
  ownerId: string;
  channel: NotificationChannel;
  providerReceiptId: string;
  dedupeKey: string;
  safePayload?: Record<string, ActionValue>;
}) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const rows = await sql`
    INSERT INTO automation_notification_inbox (
      id, owner_id, channel, provider_receipt_id, dedupe_key, safe_payload
    ) VALUES (
      ${randomUUID()}, ${input.ownerId}, ${input.channel}, ${input.providerReceiptId},
      ${input.dedupeKey}, ${sql.json((input.safePayload || {}) as never)}
    )
    ON CONFLICT (dedupe_key) DO NOTHING
    RETURNING id
  `;
  return rows[0] ? String(rows[0].id) : null;
}
