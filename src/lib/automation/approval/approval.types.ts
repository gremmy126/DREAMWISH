import type { ActionRiskLevel, ActionValue } from "../registry/action.types";
import type { ApprovalPolicy, ExecutionMode } from "../runtime/types";

export type ApprovalState =
  | "waiting_warning"
  | "waiting_final_approval"
  | "approved"
  | "rejected"
  | "expired"
  | "superseded";

export type ApprovalSnapshot = {
  workflowId: string;
  workflowVersion: number;
  executionId: string;
  nodeId: string;
  appId?: string;
  actionId: string;
  actionVersion: number;
  adapterVersion: number;
  integrationConnectionId: string | null;
  inputHash: string;
  normalizedInput: Record<string, ActionValue>;
  targetAccount: string | null;
  targetResources: string[];
  executionCount: number;
  amount: number | null;
  currency: string | null;
  scheduledFor: string | null;
  outputSchemaVersion: number;
  riskLevel: ActionRiskLevel;
  approvalPolicy: ApprovalPolicy;
  approvalExpiresAt: string;
};

export type BuildApprovalSnapshotInput = Omit<ApprovalSnapshot, "inputHash" | "normalizedInput"> & {
  normalizedInput: Record<string, unknown>;
};

export type ApprovalPolicyInput = {
  riskLevel: ActionRiskLevel;
  executionMode: ExecutionMode;
  approvalPolicy: ApprovalPolicy;
  externalChange: boolean;
};

export type ApprovalDecision = "automatic" | "preview_approval" | "two_stage" | "critical";
