import type { ApprovalRequest, ExecutionPlan, ExecutionResult } from "./agent.types";

export async function executeApprovedPlan(
  plan: ExecutionPlan,
  approval: ApprovalRequest
): Promise<ExecutionResult> {
  if (approval.status !== "approved") {
    return {
      planId: plan.id,
      status: "blocked",
      message: "사용자 승인 전에는 실행하지 않습니다.",
      executedAt: new Date().toISOString()
    };
  }

  return {
    planId: plan.id,
    status: "completed",
    message: "승인된 실행 계획을 로컬 실행 기록에 반영할 준비가 완료되었습니다.",
    executedAt: new Date().toISOString()
  };
}
