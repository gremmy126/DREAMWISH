import { randomUUID } from "node:crypto";
import { getPostgres } from "../db/postgres";
import { ensureBillingSchema } from "./billing-schema";
import type { BillingEnvironment, BillingProvider } from "./billing-gateway.types";

export async function appendBillingEvent(input: {
  ownerId: string; provider?: BillingProvider | null; environment?: BillingEnvironment | null;
  eventType: string; idempotencyKey: string; amount?: number | null; currency?: "KRW" | null;
  occurredAt: string; safeMetadata?: Record<string, unknown>;
}) {
  await ensureBillingSchema();
  const sql = getPostgres();
  const rows = await sql`
    INSERT INTO billing_events (
      id, owner_id, provider, environment, event_type, idempotency_key, amount, currency, occurred_at, safe_metadata
    ) VALUES (
      ${randomUUID()}, ${input.ownerId}, ${input.provider || null}, ${input.environment || null}, ${input.eventType},
      ${input.idempotencyKey}, ${input.amount ?? null}, ${input.currency || null}, ${input.occurredAt},
      ${sql.json((input.safeMetadata || {}) as never)}
    ) ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id, owner_id, provider, environment, event_type, idempotency_key, amount, currency, occurred_at, safe_metadata, created_at
  `;
  return rows[0]!;
}

export async function listBillingEvents(ownerId: string, eventType?: string) {
  await ensureBillingSchema();
  const sql = getPostgres();
  return eventType
    ? sql`SELECT * FROM billing_events WHERE owner_id = ${ownerId} AND event_type = ${eventType} ORDER BY occurred_at DESC`
    : sql`SELECT * FROM billing_events WHERE owner_id = ${ownerId} ORDER BY occurred_at DESC`;
}
