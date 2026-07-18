import { getPostgres } from "../../db/postgres";
import { getAutomationWorkerHealth, type AutomationWorkerHealth } from "../queue/worker-heartbeat.repository";
import { getAutomationErrorDescriptor, toAutomationErrorCode, type AutomationErrorCode } from "./automation-error-catalog";
import type { AutomationExecution, AutomationStepRun } from "./types";
import { ensureAutomationRuntimeSchema } from "./schema";

export type ExecutionQueueState = {
  position: number | null;
  nextRunAt: string | null;
  attempt: number;
  maxAttempts: number;
};

export type ExecutionDiagnosis = {
  code: AutomationErrorCode;
  title: string;
  safeReason: string;
  recoverySteps: string[];
  action: {
    kind: "open_node" | "open_connection" | "retry" | "open_admin_health";
    href: string;
  } | null;
  retryEligible: boolean;
  retryAt: string | null;
  failingStepId: string | null;
  failingNodeId: string | null;
  apiRequestId: string | null;
  rateLimitRemaining: number | null;
  adapterLatencyMs: number | null;
};

export type ExecutionDiagnosticView = {
  executionStatus: AutomationExecution["status"];
  queue: ExecutionQueueState;
  diagnosis: ExecutionDiagnosis | null;
};

export function buildExecutionDiagnosticView(input: {
  execution: AutomationExecution;
  steps: readonly AutomationStepRun[];
  queue: ExecutionQueueState | null;
  workerHealth: AutomationWorkerHealth;
  isAdmin: boolean;
  now?: Date;
}): ExecutionDiagnosticView {
  const now = input.now || new Date();
  const queue = input.queue || { position: null, nextRunAt: null, attempt: 0, maxAttempts: 0 };
  const failingStep = [...input.steps].reverse().find((step) =>
    Boolean(step.errorCode) || ["failed", "waiting_connection"].includes(step.status)
  ) || null;
  let rawCode = input.execution.errorCode || failingStep?.errorCode || null;
  if (!rawCode && input.execution.status === "waiting_connection") rawCode = "CONNECTION_REQUIRED";
  const queuedAgeMs = now.getTime() - new Date(input.execution.createdAt).getTime();
  if (
    input.execution.status === "queued" &&
    queuedAgeMs > 30_000 &&
    input.workerHealth.status !== "healthy"
  ) {
    rawCode = "WORKER_OFFLINE";
  }
  if (!rawCode) return { executionStatus: input.execution.status, queue, diagnosis: null };

  const code = toAutomationErrorCode(rawCode);
  const descriptor = getAutomationErrorDescriptor(code);
  const retryEligible = failingStep?.retryEligible ?? input.execution.retryEligible;
  const retryAt = failingStep?.retryAt ?? input.execution.retryAt;
  return {
    executionStatus: input.execution.status,
    queue,
    diagnosis: {
      code,
      title: descriptor.title,
      safeReason: descriptor.safeReason,
      recoverySteps: [...descriptor.recoverySteps],
      action: diagnosisAction({
        code,
        workflowId: input.execution.workflowId,
        executionId: input.execution.id,
        nodeId: failingStep?.nodeId || null,
        retryEligible,
        isAdmin: input.isAdmin
      }),
      retryEligible,
      retryAt,
      failingStepId: failingStep?.id || null,
      failingNodeId: failingStep?.nodeId || null,
      apiRequestId: failingStep?.apiRequestId || null,
      rateLimitRemaining: failingStep?.rateLimitRemaining ?? null,
      adapterLatencyMs: failingStep?.adapterLatencyMs ?? null
    }
  };
}

export async function getExecutionDiagnosticViews(
  ownerId: string,
  executions: readonly AutomationExecution[],
  isAdmin: boolean
) {
  if (executions.length === 0) return new Map<string, ExecutionDiagnosticView>();
  await ensureAutomationRuntimeSchema();
  const sql = getPostgres();
  const [workerHealth, queueRows, stepRows] = await Promise.all([
    getAutomationWorkerHealth(),
    sql`
      WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY queue_name
          ORDER BY priority DESC, next_run_at ASC, created_at ASC
        ) AS queue_position
        FROM automation_queue_jobs
        WHERE status = 'queued'
      ), latest AS (
        SELECT DISTINCT ON (job.execution_id)
          job.execution_id, job.status, job.next_run_at, job.attempt, job.max_attempts,
          ranked.queue_position, job.created_at
        FROM automation_queue_jobs AS job
        LEFT JOIN ranked ON ranked.id = job.id
        WHERE job.owner_id = ${ownerId} AND job.execution_id IS NOT NULL
        ORDER BY job.execution_id, job.created_at DESC
      )
      SELECT * FROM latest
    `,
    sql`
      SELECT DISTINCT ON (step.execution_id) step.*
      FROM automation_step_runs AS step
      JOIN automation_executions AS execution
        ON execution.id = step.execution_id AND execution.owner_id = step.owner_id
      WHERE step.owner_id = ${ownerId}
        AND (step.error_code IS NOT NULL OR step.status IN ('failed', 'waiting_connection'))
      ORDER BY step.execution_id, step.created_at DESC, step.id DESC
    `
  ]);
  const executionIds = new Set(executions.map((execution) => execution.id));
  const queues = new Map<string, ExecutionQueueState>();
  for (const row of queueRows) {
    const executionId = String(row.execution_id);
    if (!executionIds.has(executionId)) continue;
    queues.set(executionId, {
      position: row.queue_position === null ? null : Number(row.queue_position),
      nextRunAt: toIso(row.next_run_at),
      attempt: Number(row.attempt || 0),
      maxAttempts: Number(row.max_attempts || 0)
    });
  }
  const steps = new Map<string, AutomationStepRun[]>();
  for (const row of stepRows) {
    const executionId = String(row.execution_id);
    if (!executionIds.has(executionId)) continue;
    steps.set(executionId, [mapDiagnosticStep(row)]);
  }
  return new Map(executions.map((execution) => [
    execution.id,
    buildExecutionDiagnosticView({
      execution,
      steps: steps.get(execution.id) || [],
      queue: queues.get(execution.id) || null,
      workerHealth,
      isAdmin
    })
  ]));
}

function diagnosisAction(input: {
  code: AutomationErrorCode;
  workflowId: string;
  executionId: string;
  nodeId: string | null;
  retryEligible: boolean;
  isAdmin: boolean;
}): ExecutionDiagnosis["action"] {
  if (input.code === "WORKER_OFFLINE") {
    return input.isAdmin ? { kind: "open_admin_health", href: "/?view=admin&section=system" } : null;
  }
  if (["CONNECTION_REQUIRED", "CONNECTION_NOT_FOUND", "CONNECTION_APP_MISMATCH", "CREDENTIAL_INVALID", "SCOPE_INSUFFICIENT", "PROVIDER_AUTH_FAILED"].includes(input.code)) {
    const search = new URLSearchParams({ view: "automation", scenario: safeId(input.workflowId), connection: "1" });
    if (input.nodeId) search.set("node", safeId(input.nodeId));
    return { kind: "open_connection", href: `/?${search.toString()}` };
  }
  if (input.nodeId) {
    const search = new URLSearchParams({ view: "automation", scenario: safeId(input.workflowId), node: safeId(input.nodeId) });
    return { kind: "open_node", href: `/?${search.toString()}` };
  }
  if (input.retryEligible) {
    return { kind: "retry", href: `/api/automation/executions/${encodeURIComponent(safeId(input.executionId))}/retry` };
  }
  return null;
}

function safeId(value: string) {
  return value.replace(/[^A-Za-z0-9 _.-]/gu, "").slice(0, 160);
}

function mapDiagnosticStep(row: Record<string, unknown>): AutomationStepRun {
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
    riskLevel: String(row.risk_level) as AutomationStepRun["riskLevel"],
    status: String(row.status),
    attempt: Number(row.attempt),
    retryCount: Number(row.retry_count),
    durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
    apiRequestId: row.api_request_id ? String(row.api_request_id) : null,
    rateLimitRemaining: row.rate_limit_remaining === null ? null : Number(row.rate_limit_remaining),
    adapterLatencyMs: row.adapter_latency_ms === null ? null : Number(row.adapter_latency_ms),
    errorCode: row.error_code ? String(row.error_code) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    retryEligible: row.retry_eligible === true,
    retryAt: toIso(row.retry_at),
    maskedInput: {},
    maskedOutput: null,
    previewData: null,
    fencingToken: Number(row.fencing_token || 0)
  };
}

function toIso(value: unknown) {
  return value ? new Date(value as Date | string).toISOString() : null;
}
