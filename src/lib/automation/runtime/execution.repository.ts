import { createHash, randomUUID } from "node:crypto";
import { getPostgres } from "../../db/postgres";
import { decryptToken, encryptToken } from "../../oauth/token-encryption";
import { appendExecutionEvent } from "./event.repository";
import { ensureAutomationRuntimeSchema } from "./schema";
import { resolveExecutionTransition } from "./transition-table";
import type {
  AutomationExecution,
  AutomationStepRun,
  ExecutionActor,
  ExecutionEventType,
  ExecutionMode,
  ExecutionStatus,
  SafeEventMetadata
} from "./types";
import type { ActionRiskLevel, ActionValue } from "../registry/action.types";

export type CreateExecutionInput = {
  ownerId: string;
  workflowId: string;
  workflowVersion: number;
  parentExecutionId?: string | null;
  resumedFromStepId?: string | null;
  executionMode: ExecutionMode;
  triggerType: string;
  triggerEventId?: string | null;
  idempotencyKey: string;
  status?: ExecutionStatus;
};

export type AutomationAiResult = {
  id: string;
  executionId: string;
  workflowId: string;
  workflowName: string;
  workflowVersion: number;
  nodeId: string;
  appId: "ai" | "openai";
  actionId: string;
  output: Record<string, ActionValue>;
  completedAt: string;
};

export async function createExecution(input: CreateExecutionInput): Promise<AutomationExecution> {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const id = randomUUID();
  const status = input.status || "queued";
  return sql.begin(async (transaction) => {
    const inserted = await transaction`
      INSERT INTO automation_executions (
        id, owner_id, workflow_id, workflow_version, parent_execution_id,
        resumed_from_step_id, execution_mode, trigger_type, trigger_event_id,
        idempotency_key, status
      ) VALUES (
        ${id}, ${input.ownerId}, ${input.workflowId}, ${input.workflowVersion},
        ${input.parentExecutionId || null}, ${input.resumedFromStepId || null},
        ${input.executionMode}, ${input.triggerType}, ${input.triggerEventId || null},
        ${input.idempotencyKey}, ${status}
      )
      ON CONFLICT (owner_id, idempotency_key) DO NOTHING
      RETURNING *
    `;
    if (inserted[0]) {
      await appendExecutionEvent({
        ownerId: input.ownerId,
        executionId: id,
        newState: status,
        eventType: "EXECUTION_CREATED",
        actorType: "system"
      }, transaction);
      return mapExecution(inserted[0]);
    }
    const existing = await transaction`
      SELECT * FROM automation_executions
      WHERE owner_id = ${input.ownerId} AND idempotency_key = ${input.idempotencyKey}
      LIMIT 1
    `;
    if (!existing[0]) throw new Error("Execution idempotency conflict could not be resolved.");
    return mapExecution(existing[0]);
  }) as Promise<AutomationExecution>;
}

export async function createStepRun(input: {
  ownerId: string;
  executionId: string;
  nodeId: string;
  actionId: string;
  actionVersion: number;
  adapterKey: string;
  adapterVersion: number;
  integrationConnectionId?: string | null;
  riskLevel: ActionRiskLevel;
  attempt?: number;
  retryCount?: number;
  maskedInput: Record<string, ActionValue>;
  executionInput: Record<string, ActionValue>;
  previewData?: Record<string, ActionValue> | null;
  fencingToken?: number;
}) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const id = randomUUID();
  const serialized = JSON.stringify(input.executionInput);
  if (Buffer.byteLength(serialized, "utf8") > 256 * 1024) {
    throw Object.assign(new Error("Step execution input exceeds 256 KiB."), { code: "STEP_INPUT_TOO_LARGE", retryable: false });
  }
  const ciphertext = encryptToken(serialized);
  const inputHash = createHash("sha256").update(serialized).digest("hex");
  return sql.begin(async (transaction) => {
    const rows = await transaction`
      INSERT INTO automation_step_runs (
        id, owner_id, execution_id, node_id, action_id, action_version, adapter_key,
        adapter_version, integration_connection_id, risk_level, status, attempt,
        retry_count, masked_input, preview_data, fencing_token, started_at
      ) VALUES (
        ${id}, ${input.ownerId}, ${input.executionId}, ${input.nodeId}, ${input.actionId},
        ${input.actionVersion}, ${input.adapterKey}, ${input.adapterVersion},
        ${input.integrationConnectionId || null}, ${input.riskLevel}, 'running', ${input.attempt || 1},
        ${input.retryCount || 0}, ${transaction.json(input.maskedInput as never)},
        ${input.previewData ? transaction.json(input.previewData as never) : null}, ${input.fencingToken || 0}, NOW()
      ) RETURNING *
    `;
    await transaction`
      INSERT INTO automation_step_execution_inputs (
        step_run_id, owner_id, input_ciphertext, input_hash
      ) VALUES (
        ${id}, ${input.ownerId}, ${ciphertext}, ${inputHash}
      )
    `;
    return rows[0]!;
  });
}

export async function getStepExecutionInput(
  ownerId: string,
  stepRunId: string
): Promise<Record<string, ActionValue> | null> {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const rows = await sql`
    SELECT input_ciphertext, input_hash
    FROM automation_step_execution_inputs
    WHERE owner_id = ${ownerId} AND step_run_id = ${stepRunId}
    LIMIT 1
  `;
  if (!rows[0]) return null;
  const serialized = decryptToken(String(rows[0].input_ciphertext));
  const actualHash = createHash("sha256").update(serialized).digest("hex");
  if (actualHash !== String(rows[0].input_hash)) {
    throw Object.assign(new Error("Encrypted step input failed its integrity check."), { code: "STEP_INPUT_INTEGRITY_FAILED", retryable: false });
  }
  const parsed = JSON.parse(serialized) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw Object.assign(new Error("Encrypted step input has an invalid shape."), { code: "STEP_INPUT_INVALID", retryable: false });
  }
  return parsed as Record<string, ActionValue>;
}

export async function finishStepRun(input: {
  ownerId: string;
  stepRunId: string;
  fencingToken: number;
  status: "completed" | "failed" | "waiting_warning" | "waiting_final_approval" | "skipped";
  maskedOutput?: Record<string, ActionValue> | null;
  durationMs?: number | null;
  apiRequestId?: string | null;
  rateLimitRemaining?: number | null;
  adapterLatencyMs?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  riskLevel?: ActionRiskLevel;
  previewData?: Record<string, ActionValue> | null;
}) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const rows = await sql`
    UPDATE automation_step_runs
    SET status = ${input.status},
        risk_level = COALESCE(${input.riskLevel || null}, risk_level),
        preview_data = COALESCE(${input.previewData ? sql.json(input.previewData as never) : null}, preview_data),
        masked_output = ${input.maskedOutput ? sql.json(input.maskedOutput as never) : null},
        duration_ms = ${input.durationMs ?? null},
        api_request_id = ${input.apiRequestId || null},
        rate_limit_remaining = ${input.rateLimitRemaining ?? null},
        adapter_latency_ms = ${input.adapterLatencyMs ?? null},
        error_code = ${input.errorCode || null},
        error_message = ${input.errorMessage || null},
        completed_at = NOW(), updated_at = NOW()
    WHERE owner_id = ${input.ownerId}
      AND id = ${input.stepRunId}
      AND fencing_token = ${input.fencingToken}
    RETURNING *
  `;
  if (!rows[0]) throw new Error("Step lease was lost or the step is not owned by this user.");
  return rows[0];
}

export async function listExecutionStepRuns(ownerId: string, executionId: string): Promise<AutomationStepRun[]> {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const rows = await sql`
    SELECT * FROM automation_step_runs
    WHERE owner_id = ${ownerId} AND execution_id = ${executionId}
    ORDER BY created_at, id
  `;
  return rows.map(mapStepRun);
}

export async function getStepRun(ownerId: string, stepRunId: string): Promise<AutomationStepRun | null> {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const rows = await sql`
    SELECT * FROM automation_step_runs
    WHERE owner_id = ${ownerId} AND id = ${stepRunId}
    LIMIT 1
  `;
  return rows[0] ? mapStepRun(rows[0]) : null;
}

export async function leaseStepRunForResume(input: {
  ownerId: string;
  stepRunId: string;
  fencingToken: number;
  retryCount: number;
}) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const rows = await sql`
    UPDATE automation_step_runs
    SET status = 'running', fencing_token = ${input.fencingToken},
        retry_count = ${Math.max(0, Math.trunc(input.retryCount))},
        started_at = NOW(), completed_at = NULL, updated_at = NOW()
    WHERE owner_id = ${input.ownerId}
      AND id = ${input.stepRunId}
      AND status IN ('waiting_warning', 'waiting_final_approval', 'failed', 'running')
    RETURNING *
  `;
  if (!rows[0]) throw new Error("Approved step is unavailable or already completed.");
  return mapStepRun(rows[0]);
}

export async function updateStepRunWaitingState(input: {
  ownerId: string;
  stepRunId: string;
  from: "waiting_warning";
  to: "waiting_final_approval";
}) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const rows = await sql`
    UPDATE automation_step_runs
    SET status = ${input.to}, updated_at = NOW()
    WHERE owner_id = ${input.ownerId} AND id = ${input.stepRunId} AND status = ${input.from}
    RETURNING *
  `;
  if (!rows[0]) throw new Error("Step approval state changed concurrently.");
  return mapStepRun(rows[0]);
}

export async function setStepApprovalTerminalStatus(
  ownerId: string,
  stepRunId: string,
  status: "rejected" | "expired"
) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  await sql`
    UPDATE automation_step_runs
    SET status = ${status}, completed_at = NOW(), updated_at = NOW()
    WHERE owner_id = ${ownerId} AND id = ${stepRunId}
      AND status IN ('waiting_warning', 'waiting_final_approval')
  `;
}

export async function recordExecutionError(input: {
  ownerId: string;
  executionId: string;
  errorCode: string;
  errorMessage: string;
}) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  await sql`
    UPDATE automation_executions
    SET error_code = ${input.errorCode.slice(0, 120)},
        error_message = ${input.errorMessage.slice(0, 2_000)},
        updated_at = NOW()
    WHERE owner_id = ${input.ownerId} AND id = ${input.executionId}
  `;
}

export async function getExecution(ownerId: string, executionId: string): Promise<AutomationExecution | null> {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const rows = await sql`
    SELECT * FROM automation_executions
    WHERE owner_id = ${ownerId} AND id = ${executionId}
    LIMIT 1
  `;
  return rows[0] ? mapExecution(rows[0]) : null;
}

export async function listExecutions(ownerId: string, limit = 100): Promise<AutomationExecution[]> {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const rows = await sql`
    SELECT * FROM automation_executions
    WHERE owner_id = ${ownerId}
    ORDER BY created_at DESC
    LIMIT ${Math.max(1, Math.min(500, Math.trunc(limit)))}
  `;
  return rows.map(mapExecution);
}

export async function listAutomationAiResults(
  ownerId: string,
  limit = 20
): Promise<AutomationAiResult[]> {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const rows = await sql`
    SELECT step.id, step.execution_id, execution.workflow_id, workflow.name AS workflow_name,
      execution.workflow_version, step.node_id, node.app_id, step.action_id,
      step.masked_output, step.completed_at
    FROM automation_step_runs AS step
    JOIN automation_executions AS execution
      ON execution.id = step.execution_id AND execution.owner_id = step.owner_id
    JOIN automation_workflows AS workflow
      ON workflow.id = execution.workflow_id AND workflow.owner_id = execution.owner_id
    JOIN automation_nodes AS node
      ON node.owner_id = step.owner_id
      AND node.workflow_id = execution.workflow_id
      AND node.workflow_version = execution.workflow_version
      AND node.node_id = step.node_id
    WHERE step.owner_id = ${ownerId}
      AND step.status = 'completed'
      AND step.masked_output IS NOT NULL
      AND node.app_id IN ('ai', 'openai')
    ORDER BY step.completed_at DESC, step.id DESC
    LIMIT ${Math.max(1, Math.min(100, Math.trunc(limit)))}
  `;
  return rows.map((row) => ({
    id: String(row.id),
    executionId: String(row.execution_id),
    workflowId: String(row.workflow_id),
    workflowName: String(row.workflow_name),
    workflowVersion: Number(row.workflow_version),
    nodeId: String(row.node_id),
    appId: String(row.app_id) as "ai" | "openai",
    actionId: String(row.action_id),
    output: structuredClone((row.masked_output || {}) as Record<string, ActionValue>),
    completedAt: toIso(row.completed_at) || new Date(0).toISOString()
  }));
}

export async function listExecutionsWaitingForConnection(ownerId: string, connectionId: string) {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const rows = await sql`
    SELECT DISTINCT execution.*
    FROM automation_executions AS execution
    JOIN automation_step_runs AS step ON step.execution_id = execution.id AND step.owner_id = execution.owner_id
    WHERE execution.owner_id = ${ownerId}
      AND execution.status = 'waiting_connection'
      AND step.integration_connection_id = ${connectionId}
    ORDER BY execution.created_at
  `;
  return rows.map(mapExecution);
}

export async function getExecutionDetail(ownerId: string, executionId: string) {
  const execution = await getExecution(ownerId, executionId);
  if (!execution) return null;
  const sql = getPostgres();
  const steps = await sql`
    SELECT step.id, step.node_id, node.app_id, step.action_id, step.action_version,
      step.adapter_key, step.adapter_version, step.integration_connection_id,
      step.risk_level, step.status, step.attempt, step.retry_count,
      step.masked_input, step.masked_output, step.preview_data, step.duration_ms,
      step.api_request_id, step.rate_limit_remaining, step.adapter_latency_ms,
      step.error_code, step.error_message, step.started_at, step.completed_at
    FROM automation_step_runs AS step
    LEFT JOIN automation_nodes AS node
      ON node.owner_id = step.owner_id
      AND node.workflow_id = ${execution.workflowId}
      AND node.workflow_version = ${execution.workflowVersion}
      AND node.node_id = step.node_id
    WHERE step.owner_id = ${ownerId} AND step.execution_id = ${executionId}
    ORDER BY step.started_at, step.id
  `;
  return {
    execution,
    steps: steps.map((row) => ({
      id: String(row.id), nodeId: String(row.node_id), appId: row.app_id ? String(row.app_id) : "unknown", actionId: String(row.action_id),
      actionVersion: Number(row.action_version), adapterKey: String(row.adapter_key),
      adapterVersion: Number(row.adapter_version), integrationConnectionId: row.integration_connection_id ? String(row.integration_connection_id) : null,
      riskLevel: String(row.risk_level), status: String(row.status), attempt: Number(row.attempt), retryCount: Number(row.retry_count),
      input: structuredClone((row.masked_input || {}) as Record<string, ActionValue>),
      output: structuredClone((row.masked_output || {}) as Record<string, ActionValue>),
      preview: structuredClone((row.preview_data || {}) as Record<string, ActionValue>),
      durationMs: row.duration_ms === null ? null : Number(row.duration_ms), apiRequestId: row.api_request_id ? String(row.api_request_id) : null,
      rateLimitRemaining: row.rate_limit_remaining === null ? null : Number(row.rate_limit_remaining),
      adapterLatencyMs: row.adapter_latency_ms === null ? null : Number(row.adapter_latency_ms),
      errorCode: row.error_code ? String(row.error_code) : null, errorMessage: row.error_message ? String(row.error_message) : null,
      startedAt: toIso(row.started_at), completedAt: toIso(row.completed_at)
    }))
  };
}

export async function transitionExecution(input: {
  ownerId: string;
  executionId: string;
  event: ExecutionEventType;
  actor: ExecutionActor;
  actorId?: string | null;
  stepRunId?: string | null;
  metadata?: SafeEventMetadata;
}): Promise<AutomationExecution> {
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  return sql.begin(async (transaction) => {
    const currentRows = await transaction`
      SELECT * FROM automation_executions
      WHERE owner_id = ${input.ownerId} AND id = ${input.executionId}
      FOR UPDATE
    `;
    if (!currentRows[0]) throw new Error("Automation execution was not found.");
    const current = mapExecution(currentRows[0]);
    const transition = resolveExecutionTransition(current.status, input.event, input.actor);
    const rows = await transaction`
      UPDATE automation_executions
      SET status = ${transition.to},
          started_at = CASE WHEN ${transition.to} = 'running' THEN COALESCE(started_at, NOW()) ELSE started_at END,
          completed_at = CASE WHEN ${transition.to} IN ('completed', 'rejected', 'expired', 'failed', 'cancelled') THEN NOW() ELSE completed_at END,
          updated_at = NOW()
      WHERE owner_id = ${input.ownerId}
        AND id = ${input.executionId}
        AND status = ${transition.from}
      RETURNING *
    `;
    if (!rows[0]) throw new Error("Automation execution changed concurrently; reload and retry.");
    await appendExecutionEvent({
      ownerId: input.ownerId,
      executionId: input.executionId,
      stepRunId: input.stepRunId,
      priorState: transition.from,
      newState: transition.to,
      eventType: transition.event,
      actorType: input.actor,
      actorId: input.actorId,
      metadata: input.metadata
    }, transaction);
    return mapExecution(rows[0]);
  }) as Promise<AutomationExecution>;
}

function mapExecution(row: Record<string, unknown>): AutomationExecution {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    workflowId: String(row.workflow_id),
    workflowVersion: Number(row.workflow_version),
    parentExecutionId: row.parent_execution_id ? String(row.parent_execution_id) : null,
    resumedFromStepId: row.resumed_from_step_id ? String(row.resumed_from_step_id) : null,
    executionMode: String(row.execution_mode) as ExecutionMode,
    triggerType: String(row.trigger_type),
    triggerEventId: row.trigger_event_id ? String(row.trigger_event_id) : null,
    idempotencyKey: String(row.idempotency_key),
    status: String(row.status) as ExecutionStatus,
    errorCode: row.error_code ? String(row.error_code) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    startedAt: toIso(row.started_at),
    completedAt: toIso(row.completed_at),
    createdAt: toIso(row.created_at)!,
    updatedAt: toIso(row.updated_at)!
  };
}

function mapStepRun(row: Record<string, unknown>): AutomationStepRun {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    executionId: String(row.execution_id),
    nodeId: String(row.node_id),
    actionId: String(row.action_id),
    actionVersion: Number(row.action_version),
    adapterKey: String(row.adapter_key),
    adapterVersion: Number(row.adapter_version),
    integrationConnectionId: row.integration_connection_id ? String(row.integration_connection_id) : null,
    riskLevel: String(row.risk_level) as ActionRiskLevel,
    status: String(row.status),
    attempt: Number(row.attempt),
    retryCount: Number(row.retry_count),
    durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
    apiRequestId: row.api_request_id ? String(row.api_request_id) : null,
    rateLimitRemaining: row.rate_limit_remaining === null ? null : Number(row.rate_limit_remaining),
    adapterLatencyMs: row.adapter_latency_ms === null ? null : Number(row.adapter_latency_ms),
    maskedInput: structuredClone((row.masked_input || {}) as Record<string, ActionValue>),
    maskedOutput: row.masked_output ? structuredClone(row.masked_output as Record<string, ActionValue>) : null,
    previewData: row.preview_data ? structuredClone(row.preview_data as Record<string, ActionValue>) : null,
    fencingToken: Number(row.fencing_token || 0)
  };
}

function toIso(value: unknown) {
  return value ? new Date(value as Date | string).toISOString() : null;
}
