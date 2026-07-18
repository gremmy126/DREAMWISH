import { randomUUID } from "node:crypto";
import { getPostgres } from "../db/postgres";
import { ensureBillingSchema } from "./billing-schema";
import type { BillingEnvironment, BillingProvider } from "./billing-gateway.types";

export type DomesticSubscription = {
  id: string; ownerId: string; provider: Exclude<BillingProvider, "polar">;
  environment: BillingEnvironment; billingMethodId: string;
  status: "active" | "past_due" | "canceled" | "ended";
  productKey: string; amount: number; baseAmount: number; discountedAmount: number | null;
  discountRemainingCycles: number; discountForever: boolean; currency: "KRW";
  currentPeriodStart: string; currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean; canceledAt: string | null; createdAt: string; updatedAt: string;
};

export async function createDomesticSubscription(input: {
  ownerId: string; provider: Exclude<BillingProvider, "polar">; environment: BillingEnvironment;
  billingMethodId: string; productKey: string; amount: number; baseAmount: number;
  discountedAmount?: number | null; discountRemainingCycles?: number; discountForever?: boolean;
  currentPeriodStart: string; currentPeriodEnd: string;
}) {
  if (input.environment !== "live") throw new Error("Sandbox attempts cannot create subscriptions.");
  await ensureBillingSchema();
  const rows = await getPostgres()`
    INSERT INTO billing_subscriptions (
      id, owner_id, provider, environment, billing_method_id, status, product_key,
      amount, base_amount, discounted_amount, discount_remaining_cycles, discount_forever,
      currency, current_period_start, current_period_end
    ) VALUES (
      ${randomUUID()}, ${input.ownerId}, ${input.provider}, ${input.environment}, ${input.billingMethodId},
      'active', ${input.productKey}, ${input.amount}, ${input.baseAmount}, ${input.discountedAmount ?? null},
      ${input.discountRemainingCycles || 0}, ${Boolean(input.discountForever)}, 'KRW',
      ${input.currentPeriodStart}, ${input.currentPeriodEnd}
    ) ON CONFLICT (owner_id) WHERE status IN ('active', 'past_due')
      DO UPDATE SET owner_id = EXCLUDED.owner_id
    RETURNING *
  `;
  return mapSubscription(rows[0]!);
}

export async function getDomesticSubscription(id: string, ownerId?: string) {
  await ensureBillingSchema();
  const sql = getPostgres();
  const rows = ownerId
    ? await sql`SELECT * FROM billing_subscriptions WHERE id = ${id} AND owner_id = ${ownerId}`
    : await sql`SELECT * FROM billing_subscriptions WHERE id = ${id}`;
  return rows[0] ? mapSubscription(rows[0]) : null;
}

export async function getDomesticSubscriptionByOwner(ownerId: string) {
  await ensureBillingSchema();
  const rows = await getPostgres()`
    SELECT * FROM billing_subscriptions WHERE owner_id = ${ownerId}
    ORDER BY created_at DESC LIMIT 1
  `;
  return rows[0] ? mapSubscription(rows[0]) : null;
}

export async function listActiveSubscriptionProviders() {
  await ensureBillingSchema();
  const rows = await getPostgres()`
    SELECT DISTINCT provider FROM billing_subscriptions WHERE status IN ('active', 'past_due')
  `;
  return rows.map((row) => String(row.provider) as DomesticSubscription["provider"]);
}

export async function markSubscriptionPastDue(id: string, safeReason: string) {
  await ensureBillingSchema();
  const rows = await getPostgres()`
    UPDATE billing_subscriptions SET status = 'past_due', updated_at = NOW()
    WHERE id = ${id} AND status = 'active' RETURNING *
  `;
  void safeReason;
  return rows[0] ? mapSubscription(rows[0]) : null;
}

export async function advanceSubscriptionPeriod(id: string, expectedPeriodEnd: string, nextPeriodEnd: string) {
  await ensureBillingSchema();
  const rows = await getPostgres()`
    UPDATE billing_subscriptions SET
      current_period_start = current_period_end, current_period_end = ${nextPeriodEnd},
      amount = CASE
        WHEN discount_forever AND discounted_amount IS NOT NULL THEN discounted_amount
        WHEN discount_remaining_cycles > 1 AND discounted_amount IS NOT NULL THEN discounted_amount
        ELSE base_amount
      END,
      discount_remaining_cycles = GREATEST(0, discount_remaining_cycles - 1),
      status = 'active', updated_at = NOW()
    WHERE id = ${id} AND current_period_end = ${expectedPeriodEnd} AND status IN ('active', 'past_due')
    RETURNING *
  `;
  return rows[0] ? mapSubscription(rows[0]) : null;
}

export async function scheduleSubscriptionCancellation(id: string, ownerId: string) {
  await ensureBillingSchema();
  const rows = await getPostgres()`
    UPDATE billing_subscriptions SET cancel_at_period_end = TRUE, canceled_at = NOW(), updated_at = NOW()
    WHERE id = ${id} AND owner_id = ${ownerId} AND status IN ('active', 'past_due') RETURNING *
  `;
  return rows[0] ? mapSubscription(rows[0]) : null;
}

export async function endDomesticSubscription(id: string, ownerId: string) {
  await ensureBillingSchema();
  const rows = await getPostgres()`
    UPDATE billing_subscriptions SET status = 'ended', cancel_at_period_end = TRUE,
      canceled_at = COALESCE(canceled_at, NOW()), updated_at = NOW()
    WHERE id = ${id} AND owner_id = ${ownerId} AND status IN ('active', 'past_due', 'canceled')
    RETURNING *
  `;
  return rows[0] ? mapSubscription(rows[0]) : null;
}

function mapSubscription(row: Record<string, unknown>): DomesticSubscription {
  return {
    id: String(row.id), ownerId: String(row.owner_id), provider: String(row.provider) as DomesticSubscription["provider"],
    environment: String(row.environment) as BillingEnvironment, billingMethodId: String(row.billing_method_id),
    status: String(row.status) as DomesticSubscription["status"], productKey: String(row.product_key),
    amount: Number(row.amount), baseAmount: Number(row.base_amount ?? row.amount),
    discountedAmount: row.discounted_amount == null ? null : Number(row.discounted_amount),
    discountRemainingCycles: Number(row.discount_remaining_cycles || 0), discountForever: Boolean(row.discount_forever),
    currency: "KRW", currentPeriodStart: date(row.current_period_start),
    currentPeriodEnd: date(row.current_period_end), cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    canceledAt: row.canceled_at ? date(row.canceled_at) : null, createdAt: date(row.created_at), updatedAt: date(row.updated_at)
  };
}
function date(value: unknown) { return new Date(value as Date | string).toISOString(); }
