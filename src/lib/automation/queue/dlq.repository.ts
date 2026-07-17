import { getPostgres } from "../../db/postgres";
import { maskAutomationSecrets } from "../runtime/secret-masker";
import { createExecution, getExecution } from "../runtime/execution.repository";
import { getExecutionTriggerPayload, saveExecutionTriggerPayload } from "../runtime/trigger-payload.repository";
import { PostgresAutomationQueue } from "./postgres-queue";
import { appendAutomationAuditEvent } from "../runtime/audit.repository";
import { randomUUID } from "node:crypto";
import { ensureAutomationRuntimeSchema } from "../runtime/schema";

export async function listDeadLetterJobs(limit = 200) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const rows = await sql`
    SELECT id, owner_id, queue_name, job_type, execution_id, step_run_id,
      priority, attempt, max_attempts, safe_payload, dead_letter_reason, updated_at
    FROM automation_queue_jobs
    WHERE status = 'dead_letter'
    ORDER BY updated_at DESC
    LIMIT ${Math.max(1, Math.min(500, Math.trunc(limit)))}
  `;
  return rows.map((row) => ({
    id: String(row.id), ownerId: String(row.owner_id), queueName: String(row.queue_name), jobType: String(row.job_type),
    executionId: row.execution_id ? String(row.execution_id) : null, stepRunId: row.step_run_id ? String(row.step_run_id) : null,
    priority: Number(row.priority), attempt: Number(row.attempt), maxAttempts: Number(row.max_attempts),
    safePayload: maskAutomationSecrets(row.safe_payload || {}), deadLetterReason: String(row.dead_letter_reason || "Unknown failure"),
    updatedAt: new Date(row.updated_at as Date | string).toISOString()
  }));
}

export async function reexecuteDeadLetterJob(input: { source: Awaited<ReturnType<typeof listDeadLetterJobs>>[number]; actorId: string }) {
  if (!input.source.executionId) throw new Error("Dead-letter job has no execution to re-run.");
  const parent = await getExecution(input.source.ownerId, input.source.executionId);
  if (!parent) throw new Error("Dead-letter execution was not found.");
  const execution = await createExecution({
    ownerId: parent.ownerId,
    workflowId: parent.workflowId,
    workflowVersion: parent.workflowVersion,
    parentExecutionId: parent.id,
    resumedFromStepId: input.source.stepRunId,
    executionMode: parent.executionMode,
    triggerType: `dlq_reexecution:${parent.triggerType}`,
    triggerEventId: null,
    idempotencyKey: `dlq:${input.source.id}:${randomUUID()}`
  });
  const triggerPayload = await getExecutionTriggerPayload(parent.ownerId, parent.id);
  if (triggerPayload) await saveExecutionTriggerPayload(parent.ownerId, execution.id, triggerPayload);
  const job = await new PostgresAutomationQueue().enqueue({
    queueName: "automation",
    jobType: "execute_workflow",
    ownerId: parent.ownerId,
    executionId: execution.id,
    priority: input.source.priority,
    maxAttempts: input.source.maxAttempts,
    idempotencyKey: `execute:${execution.id}`,
    safePayload: { requeuedFromJobId: input.source.id }
  });
  await appendAutomationAuditEvent({ ownerId: parent.ownerId, userId: input.actorId, workflowId: parent.workflowId, executionId: execution.id, approvalResult: "new_approval_required_for_high_risk_steps", executionResult: "dlq_reexecution_queued", metadata: { parentExecutionId: parent.id, sourceJobId: input.source.id, newJobId: job.id } });
  return { execution, job };
}
