import type { AutomationQueueAdapter } from "../queue/queue.adapter";
import { getExecution, transitionExecution } from "../runtime/execution.repository";
import type { ApprovalDecision, ApprovalPolicyInput, BuildApprovalSnapshotInput } from "./approval.types";
import { buildApprovalSnapshot, verifyApprovalSnapshot } from "./approval-hash";
import {
  continueApprovalWarning,
  createApprovalRequest as persistApprovalRequest,
  expireApproval,
  getApprovalRequest,
  markFinalApproved,
  rejectApproval,
  listExpiredPendingApprovalIds,
  listExpiredPendingApprovals,
  supersedeApproval
} from "./approval.repository";
import { getPostgres } from "../../db/postgres";
import { getIntegrationConnection } from "../../repositories/integration-connection.repository";
import type { ActionDefinition, ActionValue } from "../registry/action.types";
import { validateActionInput } from "../registry/schema-runtime";
import { buildActionPreviewFromDefinition } from "../action-ui-model";
import { maskAutomationSecrets } from "../runtime/secret-masker";
import { createExecution, createStepRun, getStepExecutionInput, setStepApprovalTerminalStatus, updateStepRunWaitingState } from "../runtime/execution.repository";
import { appendAutomationAuditEvent } from "../runtime/audit.repository";
import { enqueueApprovalNotifications } from "../queue/notification-outbox";
import { getPinnedWorkflowActionDefinition } from "../runtime/workflow.repository";

export function evaluateActionPolicy(input: ApprovalPolicyInput): { decision: ApprovalDecision; reason: string } {
  if (input.riskLevel === "read" || !input.externalChange) return { decision: "automatic", reason: "read_only" };
  if (input.riskLevel === "critical") return { decision: "critical", reason: "critical_always_requires_approval" };
  if (input.riskLevel === "high") return { decision: "two_stage", reason: "high_always_requires_approval" };
  if (input.executionMode === "test" || input.executionMode === "manual") {
    return { decision: "preview_approval", reason: "draft_test_manual_external_change" };
  }
  if (input.approvalPolicy === "all_external_changes") return { decision: "preview_approval", reason: "all_external_changes" };
  if (input.riskLevel === "medium" && input.approvalPolicy === "medium_and_above") {
    return { decision: "preview_approval", reason: "medium_policy" };
  }
  return { decision: "automatic", reason: "active_workflow_default" };
}

export async function continueWarning(input: { ownerId: string; requestId: string; actorId: string }) {
  const request = await continueApprovalWarning(input.ownerId, input.requestId, input.actorId);
  await updateStepRunWaitingState({
    ownerId: input.ownerId,
    stepRunId: request.stepRunId,
    from: "waiting_warning",
    to: "waiting_final_approval"
  });
  await transitionExecution({
    ownerId: input.ownerId,
    executionId: request.executionId,
    event: "WARNING_CONTINUED",
    actor: "owner",
    actorId: input.actorId,
    stepRunId: request.stepRunId
  });
  await enqueueApprovalNotifications({
    ownerId: input.ownerId,
    recipientId: input.ownerId,
    approvalRequestId: request.id,
    eventType: "final_approval_required",
    channels: request.channels,
    safePayload: {
      approvalRequestId: request.id,
      workflowId: request.snapshot.workflowId,
      executionId: request.snapshot.executionId,
      actionId: request.snapshot.actionId,
      riskLevel: request.snapshot.riskLevel,
      approvalExpiresAt: request.snapshot.approvalExpiresAt
    }
  });
  await appendAutomationAuditEvent({
    ownerId: input.ownerId,
    userId: input.actorId,
    approverId: input.actorId,
    workflowId: request.snapshot.workflowId,
    executionId: request.executionId,
    stepRunId: request.stepRunId,
    actionId: request.snapshot.actionId,
    riskLevel: request.snapshot.riskLevel,
    warningAcknowledgedAt: new Date().toISOString(),
    approvedInputHash: request.snapshot.inputHash,
    approvalChannels: request.channels,
    approvalResult: "warning_continued"
  });
  return request;
}

export async function finalApproveAndQueue(input: {
  ownerId: string;
  requestId: string;
  actorId: string;
  actualSnapshotInput: BuildApprovalSnapshotInput;
  phrase?: string | null;
  criticalAuthResult?: string | null;
  queue: AutomationQueueAdapter;
}) {
  const current = await getApprovalRequest(input.ownerId, input.requestId);
  if (!current) throw new Error("Approval request was not found.");
  const actual = buildApprovalSnapshot(input.actualSnapshotInput);
  verifyApprovalSnapshot(current.snapshotHash, actual.snapshot);
  const approved = current.state === "approved" ? current : await markFinalApproved({
    ownerId: input.ownerId,
    requestId: input.requestId,
    actorId: input.actorId,
    phrase: input.phrase,
    criticalAuthResult: input.criticalAuthResult
  });
  if (current.state !== "approved") {
    await transitionExecution({
      ownerId: input.ownerId,
      executionId: approved.executionId,
      event: "FINAL_APPROVED_AND_AUTHENTICATED",
      actor: "owner",
      actorId: input.actorId,
      stepRunId: approved.stepRunId,
      metadata: { approvalRequestId: approved.id }
    });
  }
  const job = await input.queue.enqueue({
    queueName: "automation",
    jobType: "resume_execution",
    ownerId: input.ownerId,
    executionId: approved.executionId,
    stepRunId: approved.stepRunId,
    priority: 50,
    idempotencyKey: `approval:${approved.id}:${approved.snapshotHash}`,
    safePayload: { approvalRequestId: approved.id }
  });
  const execution = await getExecution(input.ownerId, approved.executionId);
  if (execution?.status === "approved") {
    await transitionExecution({
      ownerId: input.ownerId,
      executionId: approved.executionId,
      event: "RESUME_ENQUEUED",
      actor: "system",
      stepRunId: approved.stepRunId,
      metadata: { approvalRequestId: approved.id, queueJobId: job.id }
    });
  }
  await appendAutomationAuditEvent({
    ownerId: input.ownerId,
    userId: input.actorId,
    approverId: input.actorId,
    workflowId: approved.snapshot.workflowId,
    executionId: approved.executionId,
    stepRunId: approved.stepRunId,
    actionId: approved.snapshot.actionId,
    riskLevel: approved.snapshot.riskLevel,
    finalApprovedAt: new Date().toISOString(),
    approvedInputHash: approved.snapshot.inputHash,
    actualInputHash: actual.inputHash,
    approvalChannels: approved.channels,
    approvalResult: "approved",
    executionResult: "queued"
  });
  return { approval: approved, job };
}

export async function rejectPendingApproval(input: { ownerId: string; requestId: string; actorId: string }) {
  const request = await rejectApproval(input.ownerId, input.requestId, input.actorId);
  await setStepApprovalTerminalStatus(input.ownerId, request.stepRunId, "rejected");
  await transitionExecution({
    ownerId: input.ownerId,
    executionId: request.executionId,
    event: "REJECTED",
    actor: "owner",
    actorId: input.actorId,
    stepRunId: request.stepRunId
  });
  await appendAutomationAuditEvent({ ownerId: input.ownerId, userId: input.actorId, approverId: input.actorId, workflowId: request.snapshot.workflowId, executionId: request.executionId, stepRunId: request.stepRunId, actionId: request.snapshot.actionId, riskLevel: request.snapshot.riskLevel, rejectedAt: new Date().toISOString(), approvedInputHash: request.snapshot.inputHash, approvalChannels: request.channels, approvalResult: "rejected" });
  return request;
}

export async function expirePendingApproval(ownerId: string, requestId: string) {
  const request = await expireApproval(ownerId, requestId);
  await setStepApprovalTerminalStatus(ownerId, request.stepRunId, "expired");
  await transitionExecution({
    ownerId,
    executionId: request.executionId,
    event: "EXPIRED",
    actor: "system",
    stepRunId: request.stepRunId
  });
  await appendAutomationAuditEvent({ ownerId, workflowId: request.snapshot.workflowId, executionId: request.executionId, stepRunId: request.stepRunId, actionId: request.snapshot.actionId, riskLevel: request.snapshot.riskLevel, approvedInputHash: request.snapshot.inputHash, approvalChannels: request.channels, approvalResult: "expired", executionResult: "not_executed" });
  return request;
}

export async function expireDueApprovals(ownerId: string) {
  const ids = await listExpiredPendingApprovalIds(ownerId);
  for (const requestId of ids) {
    await expirePendingApproval(ownerId, requestId).catch(() => undefined);
  }
  return ids.length;
}

export async function expireAllDueApprovals(limit = 100) {
  const pending = await listExpiredPendingApprovals(limit);
  let expired = 0;
  for (const item of pending) {
    await expirePendingApproval(item.ownerId, item.requestId).then(() => { expired += 1; }).catch(() => undefined);
  }
  return expired;
}

export async function rebuildCurrentApprovalSnapshotInput(ownerId: string, requestId: string): Promise<BuildApprovalSnapshotInput> {
  const request = await getApprovalRequest(ownerId, requestId);
  if (!request) throw new Error("Approval request was not found.");
  const sql = getPostgres();
  const rows = await sql`
    SELECT step.integration_connection_id, node.app_id
    FROM automation_step_runs AS step
    JOIN automation_nodes AS node
      ON node.owner_id = step.owner_id
      AND node.workflow_id = ${request.snapshot.workflowId}
      AND node.workflow_version = ${request.snapshot.workflowVersion}
      AND node.node_id = ${request.snapshot.nodeId}
    WHERE step.owner_id = ${ownerId} AND step.id = ${request.stepRunId}
    LIMIT 1
  `;
  if (!rows[0]) throw new Error("The approved workflow step no longer exists.");
  const definition = await getPinnedWorkflowActionDefinition({
    ownerId,
    workflowId: request.snapshot.workflowId,
    workflowVersion: request.snapshot.workflowVersion,
    nodeId: request.snapshot.nodeId
  });
  if (!definition || definition.adapterVersion !== request.snapshot.adapterVersion) {
    throw new Error("The approved ActionDefinition version is unavailable.");
  }
  const normalizedInput = await getStepExecutionInput(ownerId, request.stepRunId);
  if (!normalizedInput) throw new Error("The encrypted execution input is unavailable. Create a new approval request.");
  const connectionId = rows[0].integration_connection_id ? String(rows[0].integration_connection_id) : null;
  const connection = connectionId ? await getIntegrationConnection(ownerId, connectionId) : null;
  return {
    workflowId: request.snapshot.workflowId,
    workflowVersion: request.snapshot.workflowVersion,
    executionId: request.snapshot.executionId,
    nodeId: request.snapshot.nodeId,
    appId: String(rows[0].app_id),
    actionId: definition.id,
    actionVersion: definition.version,
    adapterVersion: definition.adapterVersion,
    integrationConnectionId: connectionId,
    normalizedInput,
    targetAccount: connection?.accountLabel || connection?.accountEmail || null,
    targetResources: targetResources(definition, normalizedInput),
    executionCount: executionCount(definition, normalizedInput),
    amount: actionAmount(definition, normalizedInput),
    currency: typeof normalizedInput.currency === "string" ? normalizedInput.currency : null,
    scheduledFor: request.snapshot.scheduledFor,
    outputSchemaVersion: definition.outputSchemaVersion,
    riskLevel: request.snapshot.riskLevel,
    approvalPolicy: request.snapshot.approvalPolicy,
    approvalExpiresAt: request.snapshot.approvalExpiresAt
  };
}

export async function replaceApprovalAfterInputEdit(input: {
  ownerId: string;
  requestId: string;
  actorId: string;
  newInput: Record<string, unknown>;
}) {
  const current = await getApprovalRequest(input.ownerId, input.requestId);
  if (!current || current.state !== "waiting_final_approval") throw new Error("Approval request is not editable.");
  const definition = await getPinnedWorkflowActionDefinition({
    ownerId: input.ownerId,
    workflowId: current.snapshot.workflowId,
    workflowVersion: current.snapshot.workflowVersion,
    nodeId: current.snapshot.nodeId
  });
  if (!definition || definition.adapterVersion !== current.snapshot.adapterVersion) throw new Error("The pinned ActionDefinition is unavailable.");
  const validation = validateActionInput(definition, input.newInput);
  if (!validation.valid) throw Object.assign(new Error("Action input validation failed."), { fieldErrors: validation.errors });
  const preview = buildActionPreviewFromDefinition(definition, validation.value);
  const sql = getPostgres();
  const executionRows = await sql`
    SELECT execution_mode FROM automation_executions
    WHERE owner_id = ${input.ownerId} AND id = ${current.executionId}
    LIMIT 1
  `;
  const workflowRows = await sql`
    SELECT approval_expiry_minutes, notification_channels
    FROM automation_workflows
    WHERE owner_id = ${input.ownerId} AND id = ${current.snapshot.workflowId}
    LIMIT 1
  `;
  if (!executionRows[0] || !workflowRows[0]) throw new Error("The source execution or workflow is unavailable.");
  const execution = await createExecution({
    ownerId: input.ownerId,
    workflowId: current.snapshot.workflowId,
    workflowVersion: current.snapshot.workflowVersion,
    parentExecutionId: current.executionId,
    resumedFromStepId: current.stepRunId,
    executionMode: String(executionRows[0].execution_mode) as "test" | "live" | "manual",
    triggerType: "approval_input_edit",
    triggerEventId: current.id,
    idempotencyKey: `approval-edit:${current.id}:${Date.now()}`,
    status: "running"
  });
  const maskedInput = maskAutomationSecrets(validation.value) as Record<string, ActionValue>;
  const step = await createStepRun({
    ownerId: input.ownerId,
    executionId: execution.id,
    nodeId: current.snapshot.nodeId,
    actionId: definition.id,
    actionVersion: definition.version,
    adapterKey: definition.adapterKey,
    adapterVersion: definition.adapterVersion,
    integrationConnectionId: current.snapshot.integrationConnectionId,
    riskLevel: current.snapshot.riskLevel,
    maskedInput,
    executionInput: validation.value,
    previewData: maskAutomationSecrets(preview) as Record<string, ActionValue>
  });
  const expiryMinutes = Math.max(5, Math.min(1_440, Number(workflowRows[0].approval_expiry_minutes) || 30));
  const snapshotResult = buildApprovalSnapshot({
    ...current.snapshot,
    executionId: execution.id,
    normalizedInput: validation.value,
    targetResources: targetResources(definition, validation.value),
    executionCount: executionCount(definition, validation.value),
    amount: actionAmount(definition, validation.value),
    currency: typeof validation.value.currency === "string" ? validation.value.currency : null,
    approvalExpiresAt: new Date(Date.now() + expiryMinutes * 60_000).toISOString()
  });
  const replacement = await createApprovalRequest({
    ownerId: input.ownerId,
    stepRunId: String(step.id),
    snapshot: snapshotResult.snapshot,
    snapshotHash: snapshotResult.snapshotHash,
    initialState: "waiting_warning",
    confirmationPhrase: definition.confirmationPhrase,
    criticalAuthMethod: current.criticalAuthMethod,
    channels: Array.isArray(workflowRows[0].notification_channels) ? workflowRows[0].notification_channels.map(String) : ["in_app"]
  });
  await supersedeApproval(input.ownerId, current.id, replacement.id, input.actorId);
  await transitionExecution({ ownerId: input.ownerId, executionId: current.executionId, event: "INPUT_EDITED", actor: "owner", actorId: input.actorId, stepRunId: current.stepRunId, metadata: { replacementExecutionId: execution.id, replacementApprovalId: replacement.id } });
  await transitionExecution({ ownerId: input.ownerId, executionId: execution.id, event: "HIGH_RISK_DETECTED", actor: "worker", stepRunId: String(step.id), metadata: { replacesApprovalId: current.id } });
  await appendAutomationAuditEvent({ ownerId: input.ownerId, userId: input.actorId, approverId: input.actorId, workflowId: current.snapshot.workflowId, executionId: execution.id, stepRunId: String(step.id), actionId: definition.id, riskLevel: current.snapshot.riskLevel, approvalResult: "input_edited_reapproval_created", approvedInputHash: current.snapshot.inputHash, actualInputHash: snapshotResult.inputHash, metadata: { replacedApprovalId: current.id, replacementApprovalId: replacement.id } });
  return replacement;
}

function targetResources(definition: ActionDefinition, input: Record<string, ActionValue>) {
  return definition.previewDefinition.targetFields.map((field) => input[field]).filter((value) => value !== undefined && value !== null && value !== "").map(String).sort();
}
function executionCount(definition: ActionDefinition, input: Record<string, ActionValue>) {
  const value = definition.previewDefinition.countField ? Number(input[definition.previewDefinition.countField]) : 1;
  return Number.isInteger(value) && value > 0 ? value : 1;
}
function actionAmount(definition: ActionDefinition, input: Record<string, ActionValue>) {
  const value = definition.previewDefinition.amountField ? Number(input[definition.previewDefinition.amountField]) : Number.NaN;
  return Number.isFinite(value) ? value : null;
}

export async function createApprovalRequest(
  input: Parameters<typeof persistApprovalRequest>[0]
) {
  const request = await persistApprovalRequest(input);
  await enqueueApprovalNotifications({
    ownerId: input.ownerId,
    recipientId: input.ownerId,
    approvalRequestId: request.id,
    eventType: input.initialState === "waiting_warning" ? "high_risk_warning" : "final_approval_required",
    channels: input.channels,
    safePayload: {
      approvalRequestId: request.id,
      workflowId: input.snapshot.workflowId,
      executionId: input.snapshot.executionId,
      actionId: input.snapshot.actionId,
      riskLevel: input.snapshot.riskLevel,
      approvalExpiresAt: input.snapshot.approvalExpiresAt
    }
  });
  return request;
}
