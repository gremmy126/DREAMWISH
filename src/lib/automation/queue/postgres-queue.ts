import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { getPostgres } from "../../db/postgres";
import { ensureAutomationRuntimeSchema } from "../runtime/schema";
import {
  computeRetryDelayMs,
  type AutomationQueueAdapter,
  type AutomationQueueJob,
  type QueueLease,
  type SafeQueuePayload
} from "./queue.adapter";

export class PostgresAutomationQueue implements AutomationQueueAdapter {
  async enqueue(input: Parameters<AutomationQueueAdapter["enqueue"]>[0]) {
    await ensureAutomationRuntimeSchema();
    const sql = getPostgres();
    const id = randomUUID();
    const rows = await sql`
      INSERT INTO automation_queue_jobs (
        id, queue_name, job_type, owner_id, execution_id, step_run_id,
        priority, next_run_at, max_attempts, idempotency_key, safe_payload
      ) VALUES (
        ${id}, ${input.queueName}, ${input.jobType}, ${input.ownerId},
        ${input.executionId || null}, ${input.stepRunId || null}, ${normalizePriority(input.priority)},
        ${input.nextRunAt || new Date().toISOString()}, ${normalizeAttempts(input.maxAttempts)},
        ${input.idempotencyKey}, ${sql.json((input.safePayload || {}) as never)}
      )
      ON CONFLICT (queue_name, idempotency_key) DO UPDATE
        SET queue_name = EXCLUDED.queue_name
      RETURNING *
    `;
    const job = mapJob(rows[0]!);
    if (job.id === id) await appendQueueEvent(job.ownerId, job.id, "enqueued", null, null, {}, sql);
    return job;
  }

  async claim(queueName: string, workerId: string, leaseMs = 30_000) {
    await ensureAutomationRuntimeSchema();
    const sql = getPostgres();
    const boundedLease = normalizeLease(leaseMs);
    return sql.begin(async (transaction) => {
      const candidates = await transaction`
        SELECT id
        FROM automation_queue_jobs
        WHERE queue_name = ${queueName}
          AND status = 'queued'
          AND next_run_at <= NOW()
          AND (locked_until IS NULL OR locked_until < NOW())
        ORDER BY priority DESC, next_run_at ASC, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `;
      if (!candidates[0]) return null;
      const rows = await transaction`
        UPDATE automation_queue_jobs
        SET status = 'running',
            attempt = attempt + 1,
            worker_id = ${workerId},
            locked_until = NOW() + (${boundedLease} * INTERVAL '1 millisecond'),
            fencing_token = fencing_token + 1,
            updated_at = NOW()
        WHERE id = ${String(candidates[0].id)}
        RETURNING *
      `;
      const job = mapJob(rows[0]!);
      await appendQueueEvent(job.ownerId, job.id, "claimed", workerId, job.fencingToken, {}, transaction);
      return job;
    }) as Promise<AutomationQueueJob | null>;
  }

  async heartbeat(lease: QueueLease, leaseMs = 30_000) {
    await ensureAutomationRuntimeSchema();
    const sql = getPostgres();
    const rows = await sql`
      UPDATE automation_queue_jobs
      SET locked_until = NOW() + (${normalizeLease(leaseMs)} * INTERVAL '1 millisecond'),
          updated_at = NOW()
      WHERE id = ${lease.jobId}
        AND status = 'running'
        AND worker_id = ${lease.workerId}
        AND fencing_token = ${lease.fencingToken}
        AND locked_until > NOW()
      RETURNING owner_id
    `;
    if (!rows[0]) return false;
    await appendQueueEvent(String(rows[0].owner_id), lease.jobId, "heartbeat", lease.workerId, lease.fencingToken, {}, sql);
    return true;
  }

  async complete(lease: QueueLease) {
    await ensureAutomationRuntimeSchema();
    const sql = getPostgres();
    return sql.begin(async (transaction) => {
      const rows = await transaction`
        UPDATE automation_queue_jobs
        SET status = 'completed', completed_at = NOW(), locked_until = NULL,
            worker_id = NULL, updated_at = NOW()
        WHERE id = ${lease.jobId}
          AND status = 'running'
          AND worker_id = ${lease.workerId}
          AND fencing_token = ${lease.fencingToken}
        RETURNING owner_id
      `;
      if (!rows[0]) return false;
      await appendQueueEvent(String(rows[0].owner_id), lease.jobId, "completed", lease.workerId, lease.fencingToken, {}, transaction);
      return true;
    }) as Promise<boolean>;
  }

  async retry(lease: QueueLease, input: { errorCode?: string; errorMessage?: string; retryAfterMs?: number }) {
    await ensureAutomationRuntimeSchema();
    const sql = getPostgres();
    return sql.begin(async (transaction) => {
      const current = await transaction`
        SELECT * FROM automation_queue_jobs
        WHERE id = ${lease.jobId}
          AND status = 'running'
          AND worker_id = ${lease.workerId}
          AND fencing_token = ${lease.fencingToken}
        FOR UPDATE
      `;
      if (!current[0]) throw new Error("Queue lease was lost.");
      const job = mapJob(current[0]);
      if (job.attempt >= job.maxAttempts) {
        const dead = await updateDeadLetter(transaction, lease, input.errorMessage || input.errorCode || "Retry attempts exhausted");
        await appendQueueEvent(dead.ownerId, dead.id, "dead_lettered", lease.workerId, lease.fencingToken, { exhausted: true }, transaction);
        return dead;
      }
      const nextRunAt = new Date(Date.now() + computeRetryDelayMs(job.attempt, { retryAfterMs: input.retryAfterMs })).toISOString();
      const rows = await transaction`
        UPDATE automation_queue_jobs
        SET status = 'queued', next_run_at = ${nextRunAt}, locked_until = NULL,
            worker_id = NULL, last_error_code = ${input.errorCode || null},
            last_error_message = ${input.errorMessage || null}, updated_at = NOW()
        WHERE id = ${lease.jobId}
          AND worker_id = ${lease.workerId}
          AND fencing_token = ${lease.fencingToken}
        RETURNING *
      `;
      const retried = mapJob(rows[0]!);
      await appendQueueEvent(retried.ownerId, retried.id, "retry_scheduled", lease.workerId, lease.fencingToken, { nextRunAt }, transaction);
      return retried;
    }) as Promise<AutomationQueueJob>;
  }

  async moveToDeadLetter(lease: QueueLease, reason: string) {
    await ensureAutomationRuntimeSchema();
    const sql = getPostgres();
    return sql.begin(async (transaction) => {
      const job = await updateDeadLetter(transaction, lease, reason);
      await appendQueueEvent(job.ownerId, job.id, "dead_lettered", lease.workerId, lease.fencingToken, {}, transaction);
      return job;
    }) as Promise<AutomationQueueJob>;
  }

  async requeueDeadLetter(ownerId: string, jobId: string, actorId: string) {
    await ensureAutomationRuntimeSchema();
    const sql = getPostgres();
    return sql.begin(async (transaction) => {
      const sourceRows = await transaction`
        SELECT * FROM automation_queue_jobs
        WHERE owner_id = ${ownerId} AND id = ${jobId} AND status = 'dead_letter'
        FOR UPDATE
      `;
      if (!sourceRows[0]) throw new Error("Dead-letter job was not found.");
      const source = mapJob(sourceRows[0]);
      const id = randomUUID();
      const rows = await transaction`
        INSERT INTO automation_queue_jobs (
          id, queue_name, job_type, owner_id, execution_id, step_run_id,
          priority, next_run_at, max_attempts, idempotency_key, safe_payload
        ) VALUES (
          ${id}, ${source.queueName}, ${source.jobType}, ${source.ownerId}, ${source.executionId},
          ${source.stepRunId}, ${source.priority}, NOW(), ${source.maxAttempts},
          ${`${source.idempotencyKey}:dlq:${id}`}, ${transaction.json(source.safePayload as never)}
        ) RETURNING *
      `;
      const requeued = mapJob(rows[0]!);
      await appendQueueEvent(source.ownerId, source.id, "requeued", null, source.fencingToken, { actorId, newJobId: requeued.id }, transaction);
      await appendQueueEvent(requeued.ownerId, requeued.id, "enqueued", null, null, { requeuedFromJobId: source.id }, transaction);
      return requeued;
    }) as Promise<AutomationQueueJob>;
  }
}

async function updateDeadLetter(query: postgres.TransactionSql, lease: QueueLease, reason: string) {
  const rows = await query`
    UPDATE automation_queue_jobs
    SET status = 'dead_letter', dead_letter_reason = ${reason.slice(0, 2_000)},
        locked_until = NULL, worker_id = NULL, updated_at = NOW()
    WHERE id = ${lease.jobId}
      AND status = 'running'
      AND worker_id = ${lease.workerId}
      AND fencing_token = ${lease.fencingToken}
    RETURNING *
  `;
  if (!rows[0]) throw new Error("Queue lease was lost.");
  return mapJob(rows[0]);
}

async function appendQueueEvent(
  ownerId: string,
  jobId: string,
  eventType: string,
  workerId: string | null,
  fencingToken: number | null,
  metadata: SafeQueuePayload,
  query: postgres.Sql | postgres.TransactionSql
) {
  await query`
    INSERT INTO automation_queue_events (
      id, owner_id, queue_job_id, event_type, worker_id, fencing_token, safe_metadata
    ) VALUES (
      ${randomUUID()}, ${ownerId}, ${jobId}, ${eventType}, ${workerId}, ${fencingToken},
      ${query.json(metadata as never)}
    )
  `;
}

function mapJob(row: Record<string, unknown>): AutomationQueueJob {
  return {
    id: String(row.id),
    queueName: String(row.queue_name),
    jobType: String(row.job_type),
    ownerId: String(row.owner_id),
    executionId: row.execution_id ? String(row.execution_id) : null,
    stepRunId: row.step_run_id ? String(row.step_run_id) : null,
    priority: Number(row.priority),
    nextRunAt: new Date(row.next_run_at as Date | string).toISOString(),
    status: String(row.status) as AutomationQueueJob["status"],
    attempt: Number(row.attempt),
    maxAttempts: Number(row.max_attempts),
    idempotencyKey: String(row.idempotency_key),
    lockedUntil: row.locked_until ? new Date(row.locked_until as Date | string).toISOString() : null,
    workerId: row.worker_id ? String(row.worker_id) : null,
    fencingToken: Number(row.fencing_token),
    safePayload: structuredClone((row.safe_payload || {}) as SafeQueuePayload),
    deadLetterReason: row.dead_letter_reason ? String(row.dead_letter_reason) : null
  };
}

function normalizeLease(value: number) { return Math.max(5_000, Math.min(5 * 60_000, Math.trunc(value))); }
function normalizePriority(value?: number) { return Math.max(-100, Math.min(100, Math.trunc(value || 0))); }
function normalizeAttempts(value?: number) { return Math.max(1, Math.min(25, Math.trunc(value || 5))); }
