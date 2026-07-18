import { randomUUID } from "node:crypto";
import { getPostgres } from "../db/postgres";
import { ensureBillingSchema } from "./billing-schema";
import type { BillingEnvironment, BillingProvider, PaymentAttemptStatus, PaymentPurpose } from "./billing-gateway.types";

export type PaymentAttempt = {
  id: string;
  ownerId: string;
  provider: Exclude<BillingProvider, "polar">;
  environment: BillingEnvironment;
  purpose: PaymentPurpose;
  status: PaymentAttemptStatus;
  idempotencyKey: string;
  providerPaymentId: string | null;
  expectedAmount: number;
  currency: "KRW";
  orderName: string;
  verifiedAt: string | null;
  failureCode: string | null;
  safeFailureMessage: string | null;
  safeMetadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

const PAYMENT_TRANSITIONS: Record<PaymentAttemptStatus, readonly PaymentAttemptStatus[]> = {
  created: ["pending_provider", "failed", "expired"],
  pending_provider: ["verification_pending", "failed", "expired"],
  verification_pending: ["test_succeeded", "succeeded", "failed"],
  test_succeeded: [],
  succeeded: [],
  failed: [],
  expired: []
};

export function canTransitionPaymentAttempt(from: string, to: string, environment: string) {
  if (to === "test_succeeded" && environment !== "sandbox") return false;
  if (to === "succeeded" && environment !== "live") return false;
  return Boolean(PAYMENT_TRANSITIONS[from as PaymentAttemptStatus]?.includes(to as PaymentAttemptStatus));
}

export async function createPaymentAttempt(input: {
  ownerId: string;
  provider: Exclude<BillingProvider, "polar">;
  environment: BillingEnvironment;
  purpose: PaymentPurpose;
  idempotencyKey: string;
  providerPaymentId?: string | null;
  expectedAmount: number;
  orderName: string;
  safeMetadata?: Record<string, unknown>;
}) {
  await ensureBillingSchema();
  const sql = getPostgres();
  const rows = await sql`
    INSERT INTO billing_payment_attempts (
      id, owner_id, provider, environment, purpose, status, idempotency_key,
      provider_payment_id, expected_amount, currency, order_name, safe_metadata
    ) VALUES (
      ${randomUUID()}, ${input.ownerId}, ${input.provider}, ${input.environment}, ${input.purpose},
      'created', ${input.idempotencyKey}, ${input.providerPaymentId || null}, ${input.expectedAmount},
      'KRW', ${input.orderName.slice(0, 200)}, ${sql.json((input.safeMetadata || {}) as never)}
    )
    ON CONFLICT (provider, environment, idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
    RETURNING *
  `;
  return mapAttempt(rows[0]!);
}

export async function getPaymentAttempt(id: string, ownerId?: string) {
  await ensureBillingSchema();
  const sql = getPostgres();
  const rows = ownerId
    ? await sql`SELECT * FROM billing_payment_attempts WHERE id = ${id} AND owner_id = ${ownerId}`
    : await sql`SELECT * FROM billing_payment_attempts WHERE id = ${id}`;
  return rows[0] ? mapAttempt(rows[0]) : null;
}

export async function getPaymentAttemptByProviderPayment(
  provider: Exclude<BillingProvider, "polar">,
  environment: BillingEnvironment,
  providerPaymentId: string
) {
  await ensureBillingSchema();
  const rows = await getPostgres()`
    SELECT * FROM billing_payment_attempts
    WHERE provider = ${provider} AND environment = ${environment} AND provider_payment_id = ${providerPaymentId}
  `;
  return rows[0] ? mapAttempt(rows[0]) : null;
}

export async function transitionPaymentAttempt(
  id: string,
  nextStatus: PaymentAttemptStatus,
  input: {
    providerPaymentId?: string | null;
    failureCode?: string | null;
    safeFailureMessage?: string | null;
    safeMetadata?: Record<string, unknown>;
  } = {}
) {
  await ensureBillingSchema();
  const sql = getPostgres();
  return sql.begin(async (transaction) => {
    const currentRows = await transaction`SELECT * FROM billing_payment_attempts WHERE id = ${id} FOR UPDATE`;
    if (!currentRows[0]) throw new Error("Payment attempt was not found.");
    const current = mapAttempt(currentRows[0]);
    if (current.status === nextStatus) return current;
    if (!canTransitionPaymentAttempt(current.status, nextStatus, current.environment)) {
      throw new Error(`Invalid payment attempt transition: ${current.status} -> ${nextStatus}`);
    }
    const rows = await transaction`
      UPDATE billing_payment_attempts SET
        status = ${nextStatus},
        provider_payment_id = COALESCE(${input.providerPaymentId || null}, provider_payment_id),
        verified_at = CASE WHEN ${nextStatus} IN ('test_succeeded', 'succeeded') THEN NOW() ELSE verified_at END,
        failure_code = ${input.failureCode || null},
        safe_failure_message = ${input.safeFailureMessage?.slice(0, 500) || null},
        safe_metadata = safe_metadata || ${transaction.json((input.safeMetadata || {}) as never)},
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    return mapAttempt(rows[0]!);
  }) as Promise<PaymentAttempt>;
}

export async function attachPaymentAttemptMetadata(id: string, safeMetadata: Record<string, unknown>) {
  await ensureBillingSchema();
  const sql = getPostgres();
  const rows = await sql`
    UPDATE billing_payment_attempts SET
      safe_metadata = safe_metadata || ${sql.json(safeMetadata as never)}, updated_at = NOW()
    WHERE id = ${id} RETURNING *
  `;
  if (!rows[0]) throw new Error("Payment attempt was not found.");
  return mapAttempt(rows[0]);
}

function mapAttempt(row: Record<string, unknown>): PaymentAttempt {
  return {
    id: String(row.id), ownerId: String(row.owner_id),
    provider: String(row.provider) as PaymentAttempt["provider"],
    environment: String(row.environment) as BillingEnvironment,
    purpose: String(row.purpose) as PaymentPurpose,
    status: String(row.status) as PaymentAttemptStatus,
    idempotencyKey: String(row.idempotency_key),
    providerPaymentId: row.provider_payment_id ? String(row.provider_payment_id) : null,
    expectedAmount: Number(row.expected_amount), currency: "KRW", orderName: String(row.order_name),
    verifiedAt: dateString(row.verified_at), failureCode: nullableString(row.failure_code),
    safeFailureMessage: nullableString(row.safe_failure_message),
    safeMetadata: structuredClone((row.safe_metadata || {}) as Record<string, unknown>),
    createdAt: dateString(row.created_at)!, updatedAt: dateString(row.updated_at)!
  };
}

function nullableString(value: unknown) { return value == null ? null : String(value); }
function dateString(value: unknown) { return value == null ? null : new Date(value as Date | string).toISOString(); }
