import type { AutomationScenario, ScenarioNode } from "../scenario-designer";
import { evaluateCondition, resolveNodeConfig, type WorkflowContext } from "../workflow-engine";
import { validateActionInput } from "../registry/schema-runtime";
import type { ActionDefinition, ActionValue } from "../registry/action.types";
import { executeRegisteredActionAdapter } from "../adapters/action-adapter.registry";
import { createApprovalRequest, rebuildCurrentApprovalSnapshotInput } from "../approval/approval.service";
import { getApprovalRequest } from "../approval/approval.repository";
import { buildApprovalSnapshot, verifyApprovalSnapshot } from "../approval/approval-hash";
import { validateActionConnection } from "../action-credential.service";
import { maskAutomationSecrets } from "./secret-masker";
import { executeActionStep } from "./execution-pipeline";
import {
  createStepRun,
  finishStepRun,
  getExecution,
  getStepRun,
  leaseStepRunForResume,
  listExecutionStepRuns,
  recordExecutionError,
  transitionExecution
} from "./execution.repository";
import { getPinnedWorkflowActionDefinition, getRuntimeWorkflow, getWorkflowVersion, type RuntimeWorkflow } from "./workflow.repository";
import { getExecutionTriggerPayload } from "./trigger-payload.repository";
import type { AutomationExecution, AutomationStepRun } from "./types";
import type { AutomationQueueJob } from "../queue/queue.adapter";
import type { QueueJobHandler } from "../queue/worker";
import { appendAutomationAuditEvent } from "./audit.repository";

type HandlerContext = Parameters<QueueJobHandler>[1];

export function createDefaultAutomationJobHandlers(): Readonly<Record<string, QueueJobHandler>> {
  return {
    execute_workflow: (job, context) => executeWorkflowJob(job, context),
    resume_execution: (job, context) => resumeApprovedExecutionJob(job, context)
  };
}

export async function executeWorkflowJob(job: AutomationQueueJob, context: HandlerContext) {
  return runWithExecutionLifecycle(job, async (execution) => {
    const loaded = await loadPinnedWorkflow(execution);
    await executeRemainingNodes(job, context, execution, loaded.workflow, loaded.scenario);
  });
}

export async function resumeApprovedExecutionJob(job: AutomationQueueJob, context: HandlerContext) {
  return runWithExecutionLifecycle(job, async (execution) => {
    const requestId = typeof job.safePayload.approvalRequestId === "string" ? job.safePayload.approvalRequestId : "";
    if (!requestId) throw permanent("Approved resume job has no approvalRequestId.", "APPROVAL_REQUEST_MISSING");
    const approval = await getApprovalRequest(job.ownerId, requestId);
    if (!approval || approval.state !== "approved" || approval.executionId !== execution.id) {
      throw permanent("Approved resume request is unavailable or does not match this execution.", "APPROVAL_INVALID");
    }
    const step = await getStepRun(job.ownerId, approval.stepRunId);
    if (!step || step.executionId !== execution.id) throw permanent("Approved step was not found.", "APPROVED_STEP_MISSING");
    if (!(await context.heartbeat())) throw permanent("Queue lease was lost before approved execution.", "LEASE_LOST");
    await leaseStepRunForResume({
      ownerId: job.ownerId,
      stepRunId: step.id,
      fencingToken: context.lease.fencingToken,
      retryCount: Math.max(0, job.attempt - 1)
    });

    const startedAt = Date.now();
    try {
      // This comparison is intentionally immediately before connection lookup and Adapter execution.
      const actualSnapshotInput = await rebuildCurrentApprovalSnapshotInput(job.ownerId, approval.id);
      const actualSnapshot = buildApprovalSnapshot(actualSnapshotInput);
      verifyApprovalSnapshot(approval.snapshotHash, actualSnapshot.snapshot);
      const definition = await getPinnedWorkflowActionDefinition({
        ownerId: job.ownerId,
        workflowId: actualSnapshot.snapshot.workflowId,
        workflowVersion: actualSnapshot.snapshot.workflowVersion,
        nodeId: actualSnapshot.snapshot.nodeId
      });
      if (!definition || definition.adapterVersion !== actualSnapshot.snapshot.adapterVersion) {
        throw permanent("The approved ActionDefinition version is unavailable.", "ACTION_VERSION_UNAVAILABLE");
      }
      const validation = validateActionInput(definition, actualSnapshotInput.normalizedInput);
      if (!validation.valid) throw permanent("Approved Action input is no longer valid.", "ACTION_INPUT_INVALID");
      await validateRuntimeConnection(job.ownerId, definition, actualSnapshot.snapshot.integrationConnectionId);
      const result = await executeRegisteredActionAdapter({
        definition,
        normalizedInput: validation.value,
        ownerId: job.ownerId,
        connectionId: actualSnapshot.snapshot.integrationConnectionId,
        idempotencyKey: `approved:${approval.id}:${approval.snapshotHash}`
      });
      await finishStepRun({
        ownerId: job.ownerId,
        stepRunId: step.id,
        fencingToken: context.lease.fencingToken,
        status: "completed",
        maskedOutput: maskAutomationSecrets(result.output) as Record<string, ActionValue>,
        durationMs: Date.now() - startedAt,
        apiRequestId: result.apiRequestId,
        rateLimitRemaining: result.rateLimitRemaining,
        adapterLatencyMs: result.adapterLatencyMs,
        riskLevel: approval.snapshot.riskLevel
      });
      await appendAutomationAuditEvent({
        ownerId: job.ownerId,
        workflowId: approval.snapshot.workflowId,
        executionId: execution.id,
        stepRunId: step.id,
        actionId: approval.snapshot.actionId,
        riskLevel: approval.snapshot.riskLevel,
        approvedInputHash: approval.snapshot.inputHash,
        actualInputHash: actualSnapshot.inputHash,
        approvalChannels: approval.channels,
        approvalResult: "approved",
        executionResult: "completed",
        metadata: { apiRequestId: result.apiRequestId || null }
      });
    } catch (error) {
      await finishFailedStep(job, step.id, context.lease.fencingToken, startedAt, error);
      if (isApprovalMismatch(error)) throw permanent(messageOf(error), "APPROVAL_SNAPSHOT_MISMATCH");
      throw error;
    }

    const loaded = await loadPinnedWorkflow(execution);
    await executeRemainingNodes(job, context, execution, loaded.workflow, loaded.scenario);
  });
}

async function executeRemainingNodes(
  job: AutomationQueueJob,
  context: HandlerContext,
  execution: AutomationExecution,
  workflow: RuntimeWorkflow,
  scenario: AutomationScenario
) {
  let stepRuns = await listExecutionStepRuns(job.ownerId, execution.id);
  const completedNodeIds = new Set(stepRuns.filter((step) => ["completed", "skipped"].includes(step.status)).map((step) => step.nodeId));
  const triggerPayload = await getExecutionTriggerPayload(job.ownerId, execution.id);
  const workflowContext = buildWorkflowContext(stepRuns, scenario, triggerPayload);
  const skippedNodes = new Set<string>();

  for (const node of orderedWorkflowNodes(scenario)) {
    if (completedNodeIds.has(node.id)) continue;
    if (!(await context.heartbeat())) throw permanent("Queue lease was lost during workflow execution.", "LEASE_LOST");
    const resolvedInput = resolveNodeConfig(node, workflowContext);
    const attempt = nextStepAttempt(stepRuns, node.id);

    if (skippedNodes.has(node.id)) {
      const skippedDefinition = await getPinnedWorkflowActionDefinition({ ownerId: job.ownerId, workflowId: execution.workflowId, workflowVersion: execution.workflowVersion, nodeId: node.id });
      const skipped = await createNodeStep(job, execution, node, skippedDefinition, resolvedInput, attempt, context.lease.fencingToken, "read");
      await finishStepRun({ ownerId: job.ownerId, stepRunId: String(skipped.id), fencingToken: context.lease.fencingToken, status: "skipped" });
      completedNodeIds.add(node.id);
      stepRuns = await listExecutionStepRuns(job.ownerId, execution.id);
      continue;
    }

    if (node.kind === "trigger" && triggerPayload) {
      const definition = await getPinnedWorkflowActionDefinition({ ownerId: job.ownerId, workflowId: execution.workflowId, workflowVersion: execution.workflowVersion, nodeId: node.id });
      const step = await createNodeStep(job, execution, node, definition, resolvedInput, attempt, context.lease.fencingToken, definition?.riskLevel || "read");
      const safeTrigger = maskAutomationSecrets(triggerPayload) as Record<string, ActionValue>;
      await finishStepRun({
        ownerId: job.ownerId,
        stepRunId: String(step.id),
        fencingToken: context.lease.fencingToken,
        status: "completed",
        maskedOutput: safeTrigger,
        durationMs: 0,
        adapterLatencyMs: 0,
        riskLevel: definition?.riskLevel || "read"
      });
      workflowContext.trigger = triggerPayload;
      completedNodeIds.add(node.id);
      stepRuns = await listExecutionStepRuns(job.ownerId, execution.id);
      continue;
    }

    if (node.appId === "filter") {
      const step = await createNodeStep(job, execution, node, null, resolvedInput, attempt, context.lease.fencingToken, "read");
      const passed = evaluateCondition(resolvedInput, workflowContext);
      await finishStepRun({
        ownerId: job.ownerId,
        stepRunId: String(step.id),
        fencingToken: context.lease.fencingToken,
        status: passed ? "completed" : "skipped",
        maskedOutput: { passed },
        durationMs: 0,
        adapterLatencyMs: 0,
        riskLevel: "read"
      });
      workflowContext.steps[node.id] = { passed };
      if (!passed) for (const nodeId of descendantNodeIds(scenario, node.id)) skippedNodes.add(nodeId);
      completedNodeIds.add(node.id);
      stepRuns = await listExecutionStepRuns(job.ownerId, execution.id);
      continue;
    }

    if (!node.actionId || !node.actionVersion) throw permanent(`Node ${node.id} has no pinned ActionDefinition.`, "ACTION_NOT_PINNED");
    const definition = await getPinnedWorkflowActionDefinition({
      ownerId: job.ownerId,
      workflowId: execution.workflowId,
      workflowVersion: execution.workflowVersion,
      nodeId: node.id
    });
    if (!definition) throw permanent(`Pinned ActionDefinition is unavailable for node ${node.id}.`, "ACTION_VERSION_UNAVAILABLE");
    const step = await createNodeStep(job, execution, node, definition, resolvedInput, attempt, context.lease.fencingToken, definition.riskLevel);
    const startedAt = Date.now();
    try {
      const result = await executeActionStep({
        ownerId: job.ownerId,
        workflowId: execution.workflowId,
        workflowVersion: execution.workflowVersion,
        executionId: execution.id,
        nodeId: node.id,
        appId: node.appId,
        actionId: node.actionId,
        actionVersion: node.actionVersion,
        integrationConnectionId: node.credentialId,
        executionMode: execution.executionMode,
        approvalPolicy: workflow.approvalPolicy,
        input: resolvedInput,
        idempotencyKey: `${execution.id}:${node.id}:${attempt}`,
        approvalExpiresAt: new Date(Date.now() + workflow.approvalExpiryMinutes * 60_000).toISOString(),
        scheduledFor: typeof triggerPayload?.scheduledAt === "string" ? triggerPayload.scheduledAt : null,
        definition
      }, {
        validateConnection: (input) => validateRuntimeConnection(input.ownerId, definition, input.connectionId),
        reserveIdempotency: async () => undefined,
        checkRateLimit: async () => undefined,
        createApproval: async (approvalInput) => {
          const request = await createApprovalRequest({
            ownerId: job.ownerId,
            stepRunId: String(step.id),
            snapshot: approvalInput.snapshot,
            snapshotHash: approvalInput.snapshotHash,
            initialState: approvalInput.decision === "two_stage" || approvalInput.decision === "critical" ? "waiting_warning" : "waiting_final_approval",
            confirmationPhrase: approvalInput.confirmationPhrase,
            criticalAuthMethod: approvalInput.snapshot.riskLevel === "critical"
              && workflow.criticalAuthMethod
              && definition.additionalAuth.includes(workflow.criticalAuthMethod)
              ? workflow.criticalAuthMethod
              : null,
            channels: workflow.notificationChannels
          });
          return { approvalRequestId: request.id };
        },
        executeAdapter: executeRegisteredActionAdapter,
        persistResult: async (persisted) => {
          await finishStepRun({
            ownerId: job.ownerId,
            stepRunId: String(step.id),
            fencingToken: context.lease.fencingToken,
            status: persisted.status,
            maskedOutput: persisted.maskedOutput,
            durationMs: Date.now() - startedAt,
            apiRequestId: persisted.apiRequestId,
            rateLimitRemaining: persisted.rateLimitRemaining,
            adapterLatencyMs: persisted.adapterLatencyMs,
            riskLevel: persisted.riskLevel,
            previewData: maskAutomationSecrets(persisted.preview) as Record<string, ActionValue>
          });
          if (persisted.status === "waiting_warning") {
            await transitionExecution({ ownerId: job.ownerId, executionId: execution.id, event: "HIGH_RISK_DETECTED", actor: "worker", stepRunId: String(step.id), metadata: { approvalRequestId: persisted.approvalRequestId || null } });
          } else if (persisted.status === "waiting_final_approval") {
            await transitionExecution({ ownerId: job.ownerId, executionId: execution.id, event: "APPROVAL_REQUIRED", actor: "worker", stepRunId: String(step.id), metadata: { approvalRequestId: persisted.approvalRequestId || null } });
          } else {
            await appendAutomationAuditEvent({ ownerId: job.ownerId, workflowId: execution.workflowId, executionId: execution.id, stepRunId: String(step.id), actionId: definition.id, riskLevel: persisted.riskLevel, approvalResult: "automatic", executionResult: "completed", metadata: { apiRequestId: persisted.apiRequestId || null } });
          }
        }
      });
      if (result.status !== "completed") return;
      const output = "output" in result ? result.output : {};
      if (node.kind === "trigger") workflowContext.trigger = output;
      else workflowContext.steps[node.id] = output;
      completedNodeIds.add(node.id);
      stepRuns = await listExecutionStepRuns(job.ownerId, execution.id);
    } catch (error) {
      await finishFailedStep(job, String(step.id), context.lease.fencingToken, startedAt, error);
      throw error;
    }
  }

  const current = await getExecution(job.ownerId, execution.id);
  if (current?.status === "running") {
    await transitionExecution({ ownerId: job.ownerId, executionId: execution.id, event: "ADAPTER_SUCCEEDED", actor: "worker" });
  }
}

async function runWithExecutionLifecycle(job: AutomationQueueJob, operation: (execution: AutomationExecution) => Promise<void>) {
  if (!job.executionId) throw permanent("Automation queue job has no executionId.", "EXECUTION_ID_MISSING");
  let execution = await getExecution(job.ownerId, job.executionId);
  if (!execution) throw permanent("Automation execution was not found.", "EXECUTION_NOT_FOUND");
  if (execution.status === "retry_wait") {
    execution = await transitionExecution({ ownerId: job.ownerId, executionId: execution.id, event: "RETRY_DUE", actor: "system" });
  }
  if (execution.status === "queued") {
    execution = await transitionExecution({ ownerId: job.ownerId, executionId: execution.id, event: "JOB_CLAIMED", actor: "worker" });
  }
  if (execution.status !== "running") throw permanent(`Execution cannot run from ${execution.status}.`, "EXECUTION_STATE_INVALID");

  try {
    await operation(execution);
  } catch (error) {
    const normalized = normalizeRuntimeError(error);
    await recordExecutionError({ ownerId: job.ownerId, executionId: execution.id, errorCode: normalized.code, errorMessage: normalized.message });
    const current = await getExecution(job.ownerId, execution.id);
    if (current?.status === "running") {
      if (isConnectionError(normalized.code)) {
        await transitionExecution({ ownerId: job.ownerId, executionId: execution.id, event: "CONNECTION_REQUIRED", actor: "worker", metadata: { errorCode: normalized.code } });
        return;
      }
      if (normalized.retryable && job.attempt < job.maxAttempts) {
        await transitionExecution({ ownerId: job.ownerId, executionId: execution.id, event: "RETRY_SCHEDULED", actor: "worker", metadata: { errorCode: normalized.code, attempt: job.attempt } });
      } else {
        await transitionExecution({ ownerId: job.ownerId, executionId: execution.id, event: "PERMANENT_FAILURE", actor: "worker", metadata: { errorCode: normalized.code } });
        normalized.retryable = false;
      }
    }
    throw normalized;
  }
}

async function loadPinnedWorkflow(execution: AutomationExecution) {
  const [workflow, version] = await Promise.all([
    getRuntimeWorkflow(execution.ownerId, execution.workflowId),
    getWorkflowVersion<AutomationScenario>(execution.ownerId, execution.workflowId, execution.workflowVersion)
  ]);
  if (!workflow || !version) throw permanent("Pinned workflow version is unavailable.", "WORKFLOW_VERSION_UNAVAILABLE");
  return { workflow, scenario: version.snapshot };
}

async function validateRuntimeConnection(ownerId: string, definition: ActionDefinition, connectionId: string | null) {
  return validateActionConnection({ ownerId, connectionId, appId: definition.appId, requiredScopes: definition.requiredScopes });
}

async function createNodeStep(
  job: AutomationQueueJob,
  execution: AutomationExecution,
  node: ScenarioNode,
  definition: ActionDefinition | null,
  resolvedInput: Record<string, ActionValue>,
  attempt: number,
  fencingToken: number,
  riskLevel: "read" | "low" | "medium" | "high" | "critical"
) {
  return createStepRun({
    ownerId: job.ownerId,
    executionId: execution.id,
    nodeId: node.id,
    actionId: definition?.id || "filter.condition",
    actionVersion: definition?.version || 1,
    adapterKey: definition?.adapterKey || "tool.filter",
    adapterVersion: definition?.adapterVersion || 1,
    integrationConnectionId: node.credentialId,
    riskLevel,
    attempt,
    retryCount: Math.max(0, attempt - 1),
    maskedInput: maskAutomationSecrets(resolvedInput) as Record<string, ActionValue>,
    executionInput: resolvedInput,
    fencingToken
  });
}

async function finishFailedStep(job: AutomationQueueJob, stepRunId: string, fencingToken: number, startedAt: number, error: unknown) {
  const normalized = normalizeRuntimeError(error);
  await finishStepRun({
    ownerId: job.ownerId,
    stepRunId,
    fencingToken,
    status: "failed",
    durationMs: Date.now() - startedAt,
    errorCode: normalized.code,
    errorMessage: normalized.message
  }).catch(() => undefined);
}

function buildWorkflowContext(
  stepRuns: AutomationStepRun[],
  scenario: AutomationScenario,
  triggerPayload: Record<string, unknown> | null
): WorkflowContext {
  const context: WorkflowContext = { trigger: triggerPayload || {}, steps: {} };
  const nodes = new Map(scenario.nodes.map((node) => [node.id, node]));
  for (const step of stepRuns) {
    if (step.status !== "completed" || !step.maskedOutput) continue;
    if (nodes.get(step.nodeId)?.kind === "trigger") context.trigger = step.maskedOutput;
    else context.steps[step.nodeId] = step.maskedOutput;
  }
  return context;
}

function nextStepAttempt(steps: AutomationStepRun[], nodeId: string) {
  return Math.max(0, ...steps.filter((step) => step.nodeId === nodeId).map((step) => step.attempt)) + 1;
}

export function orderedWorkflowNodes(scenario: AutomationScenario): ScenarioNode[] {
  const nodesById = new Map(scenario.nodes.map((node) => [node.id, node]));
  const indegree = new Map(scenario.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(scenario.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of scenario.edges) {
    if (!nodesById.has(edge.source) || !nodesById.has(edge.target)) continue;
    outgoing.get(edge.source)!.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1);
  }
  const position = new Map(scenario.nodes.map((node, index) => [node.id, index]));
  const ready = scenario.nodes.filter((node) => indegree.get(node.id) === 0);
  const result: ScenarioNode[] = [];
  while (ready.length > 0) {
    ready.sort((left, right) => (position.get(left.id) || 0) - (position.get(right.id) || 0));
    const node = ready.shift()!;
    result.push(node);
    for (const target of outgoing.get(node.id) || []) {
      indegree.set(target, (indegree.get(target) || 0) - 1);
      if (indegree.get(target) === 0) ready.push(nodesById.get(target)!);
    }
  }
  if (result.length !== scenario.nodes.length) throw permanent("Workflow contains a cycle.", "WORKFLOW_CYCLE");
  return result;
}

export function descendantNodeIds(scenario: AutomationScenario, nodeId: string) {
  const outgoing = new Map<string, string[]>();
  for (const edge of scenario.edges) {
    const targets = outgoing.get(edge.source) || [];
    targets.push(edge.target);
    outgoing.set(edge.source, targets);
  }
  const result = new Set<string>();
  const queue = [...(outgoing.get(nodeId) || [])];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (result.has(current)) continue;
    result.add(current);
    queue.push(...(outgoing.get(current) || []));
  }
  return result;
}

function permanent(message: string, code: string) {
  return Object.assign(new Error(message), { code, retryable: false });
}

function isConnectionError(code: string) {
  return ["CONNECTION_REQUIRED", "CONNECTION_NOT_FOUND", "CREDENTIAL_INVALID", "SCOPE_INSUFFICIENT"].includes(code);
}

function isApprovalMismatch(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "APPROVAL_SNAPSHOT_MISMATCH");
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Automation execution failed.");
}

function normalizeRuntimeError(error: unknown) {
  if (error && typeof error === "object") {
    const input = error as { code?: unknown; message?: unknown; retryable?: unknown; retryAfterMs?: unknown };
    return Object.assign(new Error(typeof input.message === "string" ? input.message.slice(0, 2_000) : "Automation execution failed."), {
      code: typeof input.code === "string" ? input.code : "AUTOMATION_EXECUTION_FAILED",
      retryable: input.retryable !== false,
      retryAfterMs: typeof input.retryAfterMs === "number" ? input.retryAfterMs : undefined
    });
  }
  return Object.assign(new Error(messageOf(error).slice(0, 2_000)), { code: "AUTOMATION_EXECUTION_FAILED", retryable: true });
}
