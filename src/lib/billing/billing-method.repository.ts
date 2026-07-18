import { randomUUID } from "node:crypto";
import { getPostgres } from "../db/postgres";
import { decryptToken, encryptToken } from "../oauth/token-encryption";
import { ensureBillingSchema } from "./billing-schema";
import type { BillingEnvironment, BillingProvider } from "./billing-gateway.types";

export type PublicBillingMethod = {
  id: string; ownerId: string; provider: Exclude<BillingProvider, "polar">;
  environment: BillingEnvironment; status: "active" | "revoked";
  cardBrand: string | null; cardLast4: string | null; createdAt: string; revokedAt: string | null;
};

export async function createBillingMethod(input: {
  ownerId: string; provider: Exclude<BillingProvider, "polar">; environment: BillingEnvironment;
  providerReference: string; cardBrand?: string | null; cardLast4?: string | null;
}) {
  await ensureBillingSchema();
  const rows = await getPostgres()`
    INSERT INTO billing_methods (
      id, owner_id, provider, environment, provider_reference_ciphertext, status, card_brand, card_last4
    ) VALUES (
      ${randomUUID()}, ${input.ownerId}, ${input.provider}, ${input.environment},
      ${encryptToken(input.providerReference)}, 'active', ${input.cardBrand || null}, ${safeLast4(input.cardLast4)}
    ) RETURNING *
  `;
  return publicMethod(rows[0]!);
}

export async function getBillingMethodWithReference(id: string, ownerId: string) {
  await ensureBillingSchema();
  const rows = await getPostgres()`SELECT * FROM billing_methods WHERE id = ${id} AND owner_id = ${ownerId}`;
  if (!rows[0]) return null;
  return { ...publicMethod(rows[0]), providerReference: decryptToken(String(rows[0].provider_reference_ciphertext)) };
}

export async function revokeBillingMethod(id: string, ownerId: string) {
  await ensureBillingSchema();
  const rows = await getPostgres()`
    UPDATE billing_methods SET status = 'revoked', revoked_at = NOW()
    WHERE id = ${id} AND owner_id = ${ownerId} AND status = 'active' RETURNING *
  `;
  return rows[0] ? publicMethod(rows[0]) : null;
}

function publicMethod(row: Record<string, unknown>): PublicBillingMethod {
  return {
    id: String(row.id), ownerId: String(row.owner_id), provider: String(row.provider) as PublicBillingMethod["provider"],
    environment: String(row.environment) as BillingEnvironment, status: String(row.status) as PublicBillingMethod["status"],
    cardBrand: row.card_brand ? String(row.card_brand) : null, cardLast4: row.card_last4 ? String(row.card_last4) : null,
    createdAt: new Date(row.created_at as Date | string).toISOString(),
    revokedAt: row.revoked_at ? new Date(row.revoked_at as Date | string).toISOString() : null
  };
}

function safeLast4(value?: string | null) { return value && /^\d{4}$/u.test(value) ? value : null; }

