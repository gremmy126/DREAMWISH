import { randomUUID } from "node:crypto";
import { getPostgres } from "../db/postgres";
import { ensureBillingSchema } from "./billing-schema";
import type { BillingProvider } from "./billing-gateway.types";

type DomesticProvider = Exclude<BillingProvider, "polar">;

export type BillingRefundRequest = {
  id: string;
  paymentAttemptId: string;
  ownerId: string;
  provider: DomesticProvider;
  providerPaymentId: string;
  providerRefundId: string | null;
  amount: number;
  status: "processing" | "pending_provider" | "succeeded" | "failed";
  idempotencyKey: string;
};

export async function beginBillingRefund(input: {
  provider: DomesticProvider;
  providerPaymentId: string;
  amount: number;
  reason: string;
  requestedBy: string;
}) {
  await ensureBillingSchema();
  const sql = getPostgres();
  return sql.begin(async (transaction) => {
    const idempotencyKey = `refund:${input.provider}:live:${input.providerPaymentId}:${input.amount}`;
    const existingRows = await transaction`
      SELECT * FROM billing_refund_requests WHERE idempotency_key = ${idempotencyKey} FOR UPDATE
    `;
    if (existingRows[0]) return { request: mapRefund(existingRows[0]), duplicate: true, attempt: null };

    const attemptRows = await transaction`
      SELECT * FROM billing_payment_attempts
      WHERE provider = ${input.provider} AND environment = 'live'
        AND provider_payment_id = ${input.providerPaymentId} AND status = 'succeeded'
      FOR UPDATE
    `;
    const attempt = attemptRows[0];
    if (!attempt) throw new Error("Refundable payment was not found.");
    const totals = await transaction`
      SELECT COALESCE(SUM(amount), 0) AS reserved_amount
      FROM billing_refund_requests
      WHERE payment_attempt_id = ${String(attempt.id)}
        AND status IN ('processing', 'pending_provider', 'succeeded')
    `;
    const remaining = Number(attempt.expected_amount) - Number(totals[0]?.reserved_amount || 0);
    if (!Number.isSafeInteger(input.amount) || input.amount < 1 || input.amount > remaining) {
      throw new Error("Refund amount exceeds the remaining refundable amount.");
    }
    const rows = await transaction`
      INSERT INTO billing_refund_requests (
        id, payment_attempt_id, owner_id, provider, environment, provider_payment_id,
        amount, currency, reason, idempotency_key, status, requested_by
      ) VALUES (
        ${randomUUID()}, ${String(attempt.id)}, ${String(attempt.owner_id)}, ${input.provider}, 'live',
        ${input.providerPaymentId}, ${input.amount}, 'KRW', ${input.reason.slice(0, 200)},
        ${idempotencyKey}, 'processing', ${input.requestedBy}
      ) RETURNING *
    `;
    return {
      request: mapRefund(rows[0]!),
      duplicate: false,
      attempt: {
        id: String(attempt.id),
        ownerId: String(attempt.owner_id),
        expectedAmount: Number(attempt.expected_amount),
        safeMetadata: structuredClone((attempt.safe_metadata || {}) as Record<string, unknown>)
      }
    };
  });
}

export async function completeBillingRefund(
  id: string,
  input: { providerRefundId: string; status: "pending_provider" | "succeeded" }
) {
  await ensureBillingSchema();
  const rows = await getPostgres()`
    UPDATE billing_refund_requests SET
      provider_refund_id = ${input.providerRefundId}, status = ${input.status},
      updated_at = NOW(), completed_at = CASE WHEN ${input.status} = 'succeeded' THEN NOW() ELSE completed_at END
    WHERE id = ${id} AND status = 'processing' RETURNING *
  `;
  if (!rows[0]) throw new Error("Refund request is no longer processing.");
  return mapRefund(rows[0]);
}

export async function failBillingRefund(id: string, safeMessage: string) {
  await ensureBillingSchema();
  await getPostgres()`
    UPDATE billing_refund_requests SET status = 'failed', safe_error_message = ${safeMessage.slice(0, 500)}, updated_at = NOW()
    WHERE id = ${id} AND status = 'processing'
  `;
}

export async function listRefundablePayments(limit = 100) {
  await ensureBillingSchema();
  const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));
  const rows = await getPostgres()`
    SELECT a.id, a.owner_id, a.provider, a.provider_payment_id, a.expected_amount,
      a.currency, a.order_name, a.safe_metadata, a.verified_at,
      COALESCE(SUM(r.amount) FILTER (WHERE r.status IN ('processing', 'pending_provider', 'succeeded')), 0) AS refunded_amount
    FROM billing_payment_attempts a
    LEFT JOIN billing_refund_requests r ON r.payment_attempt_id = a.id
    WHERE a.environment = 'live' AND a.status = 'succeeded' AND a.purpose IN ('general', 'subscription_charge')
    GROUP BY a.id
    ORDER BY a.verified_at DESC NULLS LAST
    LIMIT ${safeLimit}
  `;
  return rows.map((row) => ({
    attemptId: String(row.id),
    ownerId: String(row.owner_id),
    provider: String(row.provider) as DomesticProvider,
    providerPaymentId: String(row.provider_payment_id),
    amount: Number(row.expected_amount),
    refundedAmount: Number(row.refunded_amount),
    remainingAmount: Math.max(0, Number(row.expected_amount) - Number(row.refunded_amount)),
    currency: "KRW" as const,
    orderName: String(row.order_name),
    verifiedAt: row.verified_at ? new Date(row.verified_at as Date | string).toISOString() : null
  }));
}

function mapRefund(row: Record<string, unknown>): BillingRefundRequest {
  return {
    id: String(row.id),
    paymentAttemptId: String(row.payment_attempt_id),
    ownerId: String(row.owner_id),
    provider: String(row.provider) as DomesticProvider,
    providerPaymentId: String(row.provider_payment_id),
    providerRefundId: row.provider_refund_id ? String(row.provider_refund_id) : null,
    amount: Number(row.amount),
    status: String(row.status) as BillingRefundRequest["status"],
    idempotencyKey: String(row.idempotency_key)
  };
}
