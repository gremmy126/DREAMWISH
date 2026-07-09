export type ExecutionRisk = "low" | "medium" | "high";

export type ExecutionStepType =
  | "crm_search"
  | "knowledge_search"
  | "project_lookup"
  | "calendar_check"
  | "permission_check"
  | "external_execution_preview"
  | "user_approval"
  | "connector_execute"
  | "execution_history"
  | "draft"
  | "approval"
  | "memory_update"
  | "workflow_prepare";

export type ExecutionPlanStep = {
  id: string;
  order: number;
  type: ExecutionStepType;
  title: string;
  description: string;
  target?: string;
  requiresApproval: boolean;
};

export type ExecutionPlan = {
  id: string;
  goal: string;
  steps: ExecutionPlanStep[];
  risk: ExecutionRisk;
  estimatedTime: string;
  requiredApproval: true;
  createdAt: string;
};

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type ApprovalRequest = {
  id: string;
  planId: string;
  status: ApprovalStatus;
  summary: string;
  requestedAt: string;
  decidedAt: string | null;
};

export type ExecutionPreview = {
  planId: string;
  goal: string;
  risk: ExecutionRisk;
  summary: string;
  blockedUntilApproval: true;
  steps: Array<{
    order: number;
    title: string;
    description: string;
    requiresApproval: boolean;
  }>;
};

export interface Agent {
  name: string;
  description: string;
  canHandle(input: string): boolean;
  plan(input: string): Promise<ExecutionPlan>;
  execute(plan: ExecutionPlan, approval: ApprovalRequest): Promise<ExecutionResult>;
  learn(result: ExecutionResult): Promise<AgentLearningRecord>;
}

export type ExecutionResult = {
  planId: string;
  status: "blocked" | "completed";
  message: string;
  executedAt: string;
};

export type AgentLearningRecord = {
  planId: string;
  learnedAt: string;
  memorySummary: string;
};
