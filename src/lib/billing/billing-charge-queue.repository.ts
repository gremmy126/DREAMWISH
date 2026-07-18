import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { getPostgres } from "../db/postgres";
import { ensureBillingSchema } from "./billing-schema";
import type { BillingEnvironment, BillingProvider } from "./billing-gateway.types";

export type BillingChargeJob = {
  id: string; ownerId: string; subscriptionId: string; provider: Exclude<BillingProvider, "polar">;
  environment: BillingEnvironment; idempotencyKey: string; amount: number; currency: "KRW";
  status: "pending" | "running" | "completed" | "failed" | "dead_letter" | "canceled";
  priority: number; attempt: number; maxAttempts: number; nextRunAt: string;
  lockedUntil: string | null; workerId: string | null; fencingToken: number; paymentAttemptId: string | null;
};
export type BillingJobLease = { jobId: string; workerId: string; fencingToken: number };

export async function enqueueBillingChargeJob(input: {
  ownerId: string; subscriptionId: string; provider: Exclude<BillingProvider, "polar">;
  environment: BillingEnvironment; idempotencyKey: string; amount: number; nextRunAt: string;
  priority?: number; maxAttempts?: number;
}) {
  await ensureBillingSchema();
  const rows = await getPostgres()`
    INSERT INTO billing_charge_jobs (
      id, owner_id, subscription_id, provider, environment, idempotency_key,
      amount, currency, next_run_at, priority, max_attempts
    ) VALUES (
      ${randomUUID()}, ${input.ownerId}, ${input.subscriptionId}, ${input.provider}, ${input.environment},
      ${input.idempotencyKey}, ${input.amount}, 'KRW', ${input.nextRunAt}, ${input.priority || 0}, ${input.maxAttempts || 5}
    ) ON CONFLICT (provider, environment, idempotency_key) DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
    RETURNING *
  `;
  return mapJob(rows[0]!);
}

export async function claimDueBillingJobs(workerId: string, limit = 10, now = new Date(), leaseMs = 60_000) {
  await ensureBillingSchema();
  const sql = getPostgres();
  return sql.begin(async (transaction) => {
    const candidates = await transaction`
      SELECT id FROM billing_charge_jobs
      WHERE next_run_at <= ${now.toISOString()}
        AND (status = 'pending' OR (status = 'running' AND locked_until < ${now.toISOString()}))
      ORDER BY priority DESC, next_run_at ASC, created_at ASC
      FOR UPDATE SKIP LOCKED LIMIT ${Math.max(1, Math.min(100, Math.trunc(limit)))}
    `;
    if (candidates.length === 0) return [];
    const ids = candidates.map((row) => String(row.id));
    const rows = await transaction`
      UPDATE billing_charge_jobs SET
        status = 'running', worker_id = ${workerId}, attempt = attempt + 1,
        fencing_token = fencing_token + 1,
        locked_until = ${new Date(now.getTime() + Math.max(10_000, leaseMs)).toISOString()}, updated_at = NOW()
      WHERE id IN ${transaction(ids)} RETURNING *
    `;
    return rows.map(mapJob);
  }) as Promise<BillingChargeJob[]>;
}

export async function completeBillingJob(lease: BillingJobLease, paymentAttemptId: string) {
  return updateLeasedJob(lease, "completed", { paymentAttemptId });
}

export async function retryBillingJob(lease: BillingJobLease, safeError: { code: string; message: string }, nextRunAt: string) {
  return updateLeasedJob(lease, "pending", { safeError, nextRunAt });
}

export async function deadLetterBillingJob(lease: BillingJobLease, safeError: { code: string; message: string }) {
  return updateLeasedJob(lease, "dead_letter", { safeError });
}

export async function cancelPendingBillingJobs(subscriptionId: string) {
  await ensureBillingSchema();
  return getPostgres()`
    UPDATE billing_charge_jobs SET status = 'canceled', updated_at = NOW()
    WHERE subscription_id = ${subscriptionId} AND status = 'pending'
  `;
}

async function updateLeasedJob(
  lease: BillingJobLease,
  status: BillingChargeJob["status"],
  input: { paymentAttemptId?: string; safeError?: { code: string; message: string }; nextRunAt?: string }
) {
  await ensureBillingSchema();
  const rows = await getPostgres()`
    UPDATE billing_charge_jobs SET
      status = ${status}, payment_attempt_id = COALESCE(${input.paymentAttemptId || null}, payment_attempt_id),
      last_error_code = ${input.safeError?.code || null},
      safe_last_error_message = ${input.safeError?.message.slice(0, 500) || null},
      next_run_at = COALESCE(${input.nextRunAt || null}, next_run_at),
      locked_until = NULL, worker_id = NULL, updated_at = NOW(),
      completed_at = CASE WHEN ${status} = 'completed' THEN NOW() ELSE completed_at END
    WHERE id = ${lease.jobId} AND status = 'running' AND worker_id = ${lease.workerId}
      AND fencing_token = ${lease.fencingToken}
    RETURNING *
  `;
  if (!rows[0]) throw new Error("Billing job lease was lost.");
  return mapJob(rows[0]);
}

function mapJob(row: postgres.Row): BillingChargeJob {
  return {
    id: String(row.id), ownerId: String(row.owner_id), subscriptionId: String(row.subscription_id),
    provider: String(row.provider) as BillingChargeJob["provider"], environment: String(row.environment) as BillingEnvironment,
    idempotencyKey: String(row.idempotency_key), amount: Number(row.amount), currency: "KRW",
    status: String(row.status) as BillingChargeJob["status"], priority: Number(row.priority), attempt: Number(row.attempt),
    maxAttempts: Number(row.max_attempts), nextRunAt: new Date(row.next_run_at as Date | string).toISOString(),
    lockedUntil: row.locked_until ? new Date(row.locked_until as Date | string).toISOString() : null,
    workerId: row.worker_id ? String(row.worker_id) : null, fencingToken: Number(row.fencing_token),
    paymentAttemptId: row.payment_attempt_id ? String(row.payment_attempt_id) : null
  };
}
