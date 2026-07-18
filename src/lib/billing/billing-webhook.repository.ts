import { randomUUID } from "node:crypto";
import { getPostgres } from "../db/postgres";
import { ensureBillingSchema } from "./billing-schema";
import type { BillingEnvironment, BillingProvider } from "./billing-gateway.types";

export type NormalizedBillingWebhook = {
  provider: Exclude<BillingProvider, "polar">; environment: BillingEnvironment;
  eventKey: string; providerPaymentId: string; occurredAt: string;
  safePayload?: Record<string, unknown>;
};

export async function receiveBillingWebhook(input: NormalizedBillingWebhook) {
  await ensureBillingSchema();
  const sql = getPostgres();
  const id = randomUUID();
  const rows = await sql`
    INSERT INTO billing_webhook_inbox (
      id, provider, environment, event_key, provider_payment_id, occurred_at, safe_payload
    ) VALUES (
      ${id}, ${input.provider}, ${input.environment}, ${input.eventKey}, ${input.providerPaymentId},
      ${input.occurredAt}, ${sql.json((input.safePayload || {}) as never)}
    ) ON CONFLICT (provider, environment, event_key) DO UPDATE SET event_key = EXCLUDED.event_key
    RETURNING *
  `;
  return { row: rows[0]!, inserted: String(rows[0]!.id) === id };
}

export async function completeBillingWebhook(id: string) {
  await ensureBillingSchema();
  await getPostgres()`UPDATE billing_webhook_inbox SET status = 'processed', processed_at = NOW() WHERE id = ${id}`;
}

export async function failBillingWebhook(id: string, safeMessage: string) {
  await ensureBillingSchema();
  await getPostgres()`
    UPDATE billing_webhook_inbox SET status = 'failed', safe_error_message = ${safeMessage.slice(0, 500)} WHERE id = ${id}
  `;
}

