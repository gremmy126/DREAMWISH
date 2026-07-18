import { getPostgres } from "../db/postgres";
import { ensureBillingSchema } from "./billing-schema";
import type { BillingProvider } from "./billing-gateway.types";
import { appendBillingEvent } from "./billing-event.repository";

type DomesticProvider = Exclude<BillingProvider, "polar">;

export async function getDomesticPrimaryProvider(fallback: DomesticProvider) {
  await ensureBillingSchema();
  const rows = await getPostgres()`SELECT primary_provider FROM billing_provider_settings WHERE singleton = TRUE`;
  return (rows[0]?.primary_provider ? String(rows[0].primary_provider) : fallback) as DomesticProvider;
}

export async function setDomesticPrimaryProvider(input: {
  provider: DomesticProvider;
  actorId: string;
}) {
  await ensureBillingSchema();
  await getPostgres()`
    INSERT INTO billing_provider_settings (singleton, primary_provider, updated_by)
    VALUES (TRUE, ${input.provider}, ${input.actorId})
    ON CONFLICT (singleton) DO UPDATE SET
      primary_provider = EXCLUDED.primary_provider, updated_by = EXCLUDED.updated_by, updated_at = NOW()
  `;
  await appendBillingEvent({
    ownerId: input.actorId,
    eventType: "primary_provider_changed",
    idempotencyKey: `provider-switch:${input.actorId}:${Date.now()}:${input.provider}`,
    occurredAt: new Date().toISOString(),
    safeMetadata: { provider: input.provider, appliesTo: "new_subscriptions_only" }
  });
  return input.provider;
}

