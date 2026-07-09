import type {
  ApprovalRequest,
  ExecutionPlan,
  ExecutionPreview
} from "./agent.types";

export function createExecutionPreview(plan: ExecutionPlan): ExecutionPreview {
  return {
    planId: plan.id,
    goal: plan.goal,
    risk: plan.risk,
    summary: `${plan.steps.length}단계 실행 계획입니다. 승인 전까지 실제 데이터는 수정하지 않습니다.`,
    blockedUntilApproval: true,
    steps: plan.steps.map((step) => ({
      order: step.order,
      title: step.title,
      description: step.description,
      requiresApproval: step.requiresApproval
    }))
  };
}

export function createApprovalRequest(plan: ExecutionPlan): ApprovalRequest {
  return {
    id: makeId("approval"),
    planId: plan.id,
    status: "pending",
    summary: `${plan.goal} 실행 승인 요청`,
    requestedAt: new Date().toISOString(),
    decidedAt: null
  };
}

export function approveRequest(request: ApprovalRequest): ApprovalRequest {
  return {
    ...request,
    status: "approved",
    decidedAt: new Date().toISOString()
  };
}

export function rejectRequest(request: ApprovalRequest): ApprovalRequest {
  return {
    ...request,
    status: "rejected",
    decidedAt: new Date().toISOString()
  };
}

function makeId(prefix: string) {
  return `${prefix}_${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
}
