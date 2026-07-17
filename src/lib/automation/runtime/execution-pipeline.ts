import { buildActionPreview, buildActionPreviewFromDefinition } from "../action-ui-model";
import { buildApprovalSnapshot } from "../approval/approval-hash";
import { evaluateActionPolicy } from "../approval/approval.service";
import type { ApprovalSnapshot } from "../approval/approval.types";
import { getActionDefinition } from "../registry/action-registry";
import { validateActionInput } from "../registry/schema-runtime";
import type { ActionDefinition, ActionRiskLevel, ActionValue } from "../registry/action.types";
import type { ApprovalPolicy, ExecutionMode } from "./types";
import { maskAutomationSecrets } from "./secret-masker";
import { missingOAuthScopes } from "../../oauth/scope-matcher";

export type ExecuteActionStepInput = {
  ownerId: string;
  workflowId: string;
  workflowVersion: number;
  executionId: string;
  nodeId: string;
  appId: string;
  actionId: string;
  actionVersion: number;
  integrationConnectionId: string | null;
  executionMode: ExecutionMode;
  approvalPolicy: ApprovalPolicy;
  input: Record<string, unknown>;
  idempotencyKey: string;
  approvalExpiresAt: string;
  scheduledFor?: string | null;
  definition?: ActionDefinition;
};

export type ExecutionPipelineDependencies = {
  validateConnection(input: {
    ownerId: string;
    connectionId: string | null;
    appId: string;
    requiredScopes: string[];
  }): Promise<{ accountLabel: string | null; scopes: string[]; credentialStatus: string; rateLimitRemaining: number | null }>;
  reserveIdempotency(input: { ownerId: string; key: string; executionId: string; nodeId: string }): Promise<void>;
  checkRateLimit(input: { ownerId: string; appId: string; connectionId: string | null; actionId: string }): Promise<void>;
  createApproval(input: {
    snapshot: ApprovalSnapshot;
    snapshotHash: string;
    confirmationPhrase: string | null;
    decision: "preview_approval" | "two_stage" | "critical";
    preview: NonNullable<ReturnType<typeof buildActionPreview>>;
  }): Promise<{ approvalRequestId: string }>;
  executeAdapter(input: {
    definition: ActionDefinition;
    normalizedInput: Record<string, ActionValue>;
    ownerId: string;
    connectionId: string | null;
    idempotencyKey: string;
  }): Promise<{ output: Record<string, unknown>; apiRequestId?: string | null; rateLimitRemaining?: number | null; adapterLatencyMs?: number | null }>;
  persistResult(input: {
    status: "completed" | "waiting_warning" | "waiting_final_approval";
    maskedInput: Record<string, ActionValue>;
    maskedOutput: Record<string, ActionValue> | null;
    preview: NonNullable<ReturnType<typeof buildActionPreview>>;
    approvalRequestId?: string;
    riskLevel: ActionRiskLevel;
    apiRequestId?: string | null;
    rateLimitRemaining?: number | null;
    adapterLatencyMs?: number | null;
  }): Promise<void>;
};

export async function executeActionStep(input: ExecuteActionStepInput, dependencies: ExecutionPipelineDependencies) {
  const definition = input.definition || getActionDefinition(input.appId, input.actionId, input.actionVersion);
  if (!definition) throw new Error("실행 시점의 ActionDefinition Version을 찾을 수 없습니다.");
  if (definition.appId !== input.appId || definition.id !== input.actionId || definition.version !== input.actionVersion) {
    throw Object.assign(new Error("Pinned ActionDefinition identity does not match the workflow node."), { code: "ACTION_VERSION_MISMATCH", retryable: false });
  }
  const validation = validateActionInput(definition, input.input);
  if (!validation.valid) {
    const error = new Error("Action 입력값 검증에 실패했습니다.");
    Object.assign(error, { code: "ACTION_INPUT_INVALID", fieldErrors: validation.errors, retryable: false });
    throw error;
  }
  const riskLevel = evaluateRisk(definition, validation.value);
  const connection = await dependencies.validateConnection({
    ownerId: input.ownerId,
    connectionId: input.integrationConnectionId,
    appId: input.appId,
    requiredScopes: definition.requiredScopes
  });
  if (connection.credentialStatus !== "valid") {
    throw Object.assign(new Error("연결된 Credential이 유효하지 않습니다."), { code: "CREDENTIAL_INVALID", retryable: false });
  }
  const missingScopes = missingOAuthScopes(connection.scopes, definition.requiredScopes, input.appId);
  if (missingScopes.length > 0) {
    throw Object.assign(new Error(`필요한 OAuth Scope가 없습니다: ${missingScopes.join(", ")}`), { code: "SCOPE_INSUFFICIENT", retryable: false });
  }
  await dependencies.reserveIdempotency({ ownerId: input.ownerId, key: input.idempotencyKey, executionId: input.executionId, nodeId: input.nodeId });
  await dependencies.checkRateLimit({ ownerId: input.ownerId, appId: input.appId, connectionId: input.integrationConnectionId, actionId: input.actionId });
  const preview = input.definition
    ? buildActionPreviewFromDefinition(definition, validation.value)
    : buildActionPreview(input.appId, input.actionId, input.actionVersion, validation.value);
  if (!preview) throw new Error("Preview를 생성할 수 없습니다.");
  preview.riskLevel = riskLevel;
  const maskedInput = maskAutomationSecrets(validation.value) as Record<string, ActionValue>;
  const policy = evaluateActionPolicy({
    riskLevel,
    executionMode: input.executionMode,
    approvalPolicy: input.approvalPolicy,
    externalChange: definition.kind === "write"
  });

  if (policy.decision !== "automatic") {
    const snapshotResult = buildApprovalSnapshot({
      workflowId: input.workflowId,
      workflowVersion: input.workflowVersion,
      executionId: input.executionId,
      nodeId: input.nodeId,
      appId: input.appId,
      actionId: definition.id,
      actionVersion: definition.version,
      adapterVersion: definition.adapterVersion,
      integrationConnectionId: input.integrationConnectionId,
      normalizedInput: validation.value,
      targetAccount: connection.accountLabel,
      targetResources: extractTargetResources(definition, validation.value),
      executionCount: extractExecutionCount(definition, validation.value),
      amount: extractAmount(definition, validation.value),
      currency: typeof validation.value.currency === "string" ? validation.value.currency : null,
      scheduledFor: input.scheduledFor || null,
      outputSchemaVersion: definition.outputSchemaVersion,
      riskLevel,
      approvalPolicy: input.approvalPolicy,
      approvalExpiresAt: input.approvalExpiresAt
    });
    const approval = await dependencies.createApproval({
      snapshot: snapshotResult.snapshot,
      snapshotHash: snapshotResult.snapshotHash,
      confirmationPhrase: definition.confirmationPhrase,
      decision: policy.decision,
      preview
    });
    const status = policy.decision === "two_stage" || policy.decision === "critical" ? "waiting_warning" : "waiting_final_approval";
    await dependencies.persistResult({ status, maskedInput, maskedOutput: null, preview, approvalRequestId: approval.approvalRequestId, riskLevel });
    return { status, approvalRequestId: approval.approvalRequestId, preview, riskLevel } as const;
  }

  const result = await dependencies.executeAdapter({
    definition,
    normalizedInput: validation.value,
    ownerId: input.ownerId,
    connectionId: input.integrationConnectionId,
    idempotencyKey: input.idempotencyKey
  });
  const maskedOutput = maskAutomationSecrets(result.output) as Record<string, ActionValue>;
  await dependencies.persistResult({
    status: "completed",
    maskedInput,
    maskedOutput,
    preview,
    riskLevel,
    apiRequestId: result.apiRequestId,
    rateLimitRemaining: result.rateLimitRemaining,
    adapterLatencyMs: result.adapterLatencyMs
  });
  return { status: "completed", output: maskedOutput, preview, riskLevel } as const;
}

function evaluateRisk(definition: ActionDefinition, input: Record<string, ActionValue>): ActionRiskLevel {
  let risk = definition.riskLevel;
  for (const rule of definition.riskRules) {
    const actual = input[rule.field];
    const matches = rule.operator === "equals"
      ? actual === rule.value
      : rule.operator === "greater_than"
        ? Number(actual) > Number(rule.value)
        : String(actual).includes(String(rule.value));
    if (matches && riskRank(rule.riskLevel) > riskRank(risk)) risk = rule.riskLevel;
  }
  return risk;
}

function extractTargetResources(definition: ActionDefinition, input: Record<string, ActionValue>) {
  return definition.previewDefinition.targetFields
    .map((field) => input[field])
    .filter((value) => value !== undefined && value !== null && value !== "")
    .map((value) => typeof value === "object" ? JSON.stringify(maskAutomationSecrets(value)) : String(value));
}

function extractExecutionCount(definition: ActionDefinition, input: Record<string, ActionValue>) {
  const field = definition.previewDefinition.countField;
  const count = field ? Number(input[field]) : 1;
  return Number.isInteger(count) && count > 0 ? count : 1;
}

function extractAmount(definition: ActionDefinition, input: Record<string, ActionValue>) {
  const field = definition.previewDefinition.amountField;
  const amount = field ? Number(input[field]) : Number.NaN;
  return Number.isFinite(amount) ? amount : null;
}

function riskRank(risk: ActionRiskLevel) {
  return ["read", "low", "medium", "high", "critical"].indexOf(risk);
}
