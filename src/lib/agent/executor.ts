import type { ApprovalRequest, ExecutionPlan, ExecutionResult } from "./agent.types";

export async function executeApprovedPlan(
  plan: ExecutionPlan,
  approval: ApprovalRequest
): Promise<ExecutionResult> {
  if (approval.status !== "approved") {
    return {
      planId: plan.id,
      status: "blocked",
      message: "Execution is blocked until the user approves it.",
      executedAt: new Date().toISOString()
    };
  }

  return {
    planId: plan.id,
    status: "completed",
    message: "Approved execution plan is ready to be recorded in local execution history.",
    executedAt: new Date().toISOString()
  };
}
