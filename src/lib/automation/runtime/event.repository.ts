import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { getPostgres } from "../../db/postgres";
import { ensureAutomationRuntimeSchema } from "./schema";
import type { ExecutionActor, ExecutionEventType, ExecutionStatus, SafeEventMetadata } from "./types";

export type AppendExecutionEventInput = {
  ownerId: string;
  executionId: string;
  stepRunId?: string | null;
  priorState?: ExecutionStatus | null;
  newState: ExecutionStatus;
  eventType: ExecutionEventType;
  actorType: ExecutionActor;
  actorId?: string | null;
  metadata?: SafeEventMetadata;
};

export async function appendExecutionEvent(
  input: AppendExecutionEventInput,
  query: postgres.Sql | postgres.TransactionSql = getPostgres()
) {
  const id = randomUUID();
  await query`
    INSERT INTO automation_execution_events (
      id, owner_id, execution_id, step_run_id, prior_state, new_state,
      event_type, actor_type, actor_id, safe_metadata
    ) VALUES (
      ${id}, ${input.ownerId}, ${input.executionId}, ${input.stepRunId || null},
      ${input.priorState || null}, ${input.newState}, ${input.eventType},
      ${input.actorType}, ${input.actorId || null}, ${query.json((input.metadata || {}) as never)}
    )
  `;
  return id;
}

export async function listExecutionEvents(ownerId: string, executionId: string) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const rows = await sql`
    SELECT * FROM automation_execution_events
    WHERE owner_id = ${ownerId} AND execution_id = ${executionId}
    ORDER BY created_at, id
  `;
  return rows.map((row) => ({
    id: String(row.id),
    priorState: row.prior_state ? String(row.prior_state) as ExecutionStatus : null,
    newState: String(row.new_state) as ExecutionStatus,
    eventType: String(row.event_type) as ExecutionEventType,
    actorType: String(row.actor_type) as ExecutionActor,
    actorId: row.actor_id ? String(row.actor_id) : null,
    metadata: structuredClone(row.safe_metadata as SafeEventMetadata),
    createdAt: new Date(row.created_at as Date | string).toISOString()
  }));
}
