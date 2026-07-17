import { randomUUID } from "node:crypto";
import type { AutomationScenario } from "../scenario-designer";
import { PostgresAutomationQueue } from "../queue/postgres-queue";
import { createExecution, listExecutionsWaitingForConnection, transitionExecution } from "./execution.repository";
import { saveExecutionTriggerPayload } from "./trigger-payload.repository";
import type { ApprovalPolicy, ExecutionMode } from "./types";
import {
  activateWorkflowVersion,
  ensureRuntimeWorkflow,
  getRuntimeWorkflow,
  saveWorkflowVersion
} from "./workflow.repository";

export async function enqueueScenarioExecution(input: {
  ownerId: string;
  actorId: string;
  scenario: AutomationScenario;
  executionMode: ExecutionMode;
  triggerType: string;
  triggerEventId?: string | null;
  triggerData?: Record<string, unknown> | null;
  parentExecutionId?: string | null;
  resumedFromStepId?: string | null;
  approvalPolicy?: ApprovalPolicy;
  approvalExpiryMinutes?: number;
  notificationChannels?: string[];
  criticalAuthMethod?: "password" | "otp" | "admin" | null;
  priority?: number;
}) {
  let workflow = await getRuntimeWorkflow(input.ownerId, input.scenario.id);
  if (!workflow || input.approvalPolicy || input.approvalExpiryMinutes || input.notificationChannels || input.criticalAuthMethod !== undefined) {
    workflow = await ensureRuntimeWorkflow({
      ownerId: input.ownerId,
      workflowId: input.scenario.id,
      name: input.scenario.name,
      approvalPolicy: input.approvalPolicy || workflow?.approvalPolicy || "high_risk_two_stage",
      approvalExpiryMinutes: input.approvalExpiryMinutes || workflow?.approvalExpiryMinutes,
      notificationChannels: input.notificationChannels || workflow?.notificationChannels,
      criticalAuthMethod: input.criticalAuthMethod === undefined ? workflow?.criticalAuthMethod : input.criticalAuthMethod
    });
  }

  let workflowVersion = workflow.activeVersion;
  if (input.executionMode !== "live" || !workflowVersion) {
    const pinned = await saveWorkflowVersion(input.ownerId, input.scenario.id, input.scenario, input.actorId);
    workflowVersion = pinned.version;
    if (input.executionMode === "live") workflow = await activateWorkflowVersion(input.ownerId, input.scenario.id, workflowVersion);
  }
  if (!workflowVersion) throw new Error("A pinned workflow version is required before execution.");

  const triggerEventId = input.triggerEventId ? String(input.triggerEventId).slice(0, 500) : null;
  const idempotencyKey = triggerEventId
    ? `trigger:${input.scenario.id}:${input.triggerType}:${triggerEventId}`
    : `${input.executionMode}:${input.scenario.id}:${randomUUID()}`;
  const execution = await createExecution({
    ownerId: input.ownerId,
    workflowId: input.scenario.id,
    workflowVersion,
    parentExecutionId: input.parentExecutionId,
    resumedFromStepId: input.resumedFromStepId,
    executionMode: input.executionMode,
    triggerType: input.triggerType,
    triggerEventId,
    idempotencyKey
  });
  if (input.triggerData) await saveExecutionTriggerPayload(input.ownerId, execution.id, input.triggerData);
  const job = await new PostgresAutomationQueue().enqueue({
    queueName: "automation",
    jobType: "execute_workflow",
    ownerId: input.ownerId,
    executionId: execution.id,
    priority: input.priority,
    idempotencyKey: `execute:${execution.id}`,
    safePayload: triggerEventId ? { triggerEventId } : {}
  });
  return { workflow, execution, job, workflowVersion };
}

export async function resumeExecutionsWaitingForConnection(ownerId: string, connectionId: string) {
  const waiting = await listExecutionsWaitingForConnection(ownerId, connectionId);
  const queue = new PostgresAutomationQueue();
  let resumed = 0;
  for (const execution of waiting) {
    const job = await queue.enqueue({
      queueName: "automation",
      jobType: "execute_workflow",
      ownerId,
      executionId: execution.id,
      priority: 40,
      nextRunAt: new Date(Date.now() + 5_000).toISOString(),
      idempotencyKey: `connection-resume:${execution.id}:${connectionId}:${execution.updatedAt}`,
      safePayload: { connectionId }
    });
    await transitionExecution({ ownerId, executionId: execution.id, event: "CONNECTION_RESTORED", actor: "system", metadata: { connectionId, queueJobId: job.id } });
    resumed += 1;
  }
  return resumed;
}
