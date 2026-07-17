import type { ActionRiskLevel, ActionValue } from "../registry/action.types";

export type ExecutionMode = "test" | "live" | "manual";
export type ExecutionStatus =
  | "queued"
  | "running"
  | "waiting_warning"
  | "waiting_final_approval"
  | "approved"
  | "completed"
  | "rejected"
  | "expired"
  | "retry_wait"
  | "waiting_connection"
  | "failed"
  | "cancelled";

export type ExecutionActor = "owner" | "approver" | "worker" | "system" | "admin";
export type ExecutionEventType =
  | "EXECUTION_CREATED"
  | "JOB_CLAIMED"
  | "HIGH_RISK_DETECTED"
  | "APPROVAL_REQUIRED"
  | "WARNING_CONTINUED"
  | "FINAL_APPROVED_AND_AUTHENTICATED"
  | "INPUT_EDITED"
  | "REJECTED"
  | "EXPIRED"
  | "RESUME_ENQUEUED"
  | "ADAPTER_SUCCEEDED"
  | "RETRY_SCHEDULED"
  | "RETRY_DUE"
  | "CONNECTION_REQUIRED"
  | "CONNECTION_RESTORED"
  | "PERMANENT_FAILURE"
  | "CANCELLED";

export type ExecutionTransition = {
  from: ExecutionStatus;
  event: ExecutionEventType;
  to: ExecutionStatus;
  actors: readonly ExecutionActor[];
};

export type AutomationExecution = {
  id: string;
  ownerId: string;
  workflowId: string;
  workflowVersion: number;
  parentExecutionId: string | null;
  resumedFromStepId: string | null;
  executionMode: ExecutionMode;
  triggerType: string;
  triggerEventId: string | null;
  idempotencyKey: string;
  status: ExecutionStatus;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AutomationStepRun = {
  id: string;
  ownerId: string;
  executionId: string;
  nodeId: string;
  actionId: string;
  actionVersion: number;
  adapterKey: string;
  adapterVersion: number;
  integrationConnectionId: string | null;
  riskLevel: ActionRiskLevel;
  status: string;
  attempt: number;
  retryCount: number;
  durationMs: number | null;
  apiRequestId: string | null;
  rateLimitRemaining: number | null;
  adapterLatencyMs: number | null;
  maskedInput: Record<string, ActionValue>;
  maskedOutput: Record<string, ActionValue> | null;
  previewData: Record<string, ActionValue> | null;
  fencingToken: number;
};

export type SafeEventMetadata = Record<string, ActionValue>;

export type ApprovalPolicy =
  | "all_external_changes"
  | "test_only"
  | "medium_and_above"
  | "high_risk_two_stage"
  | "automatic";
