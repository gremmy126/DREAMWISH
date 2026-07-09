import type { AgentLearningRecord, ExecutionResult } from "./agent.types";

export async function updateAgentMemory(result: ExecutionResult): Promise<AgentLearningRecord> {
  return {
    planId: result.planId,
    learnedAt: new Date().toISOString(),
    memorySummary:
      result.status === "completed"
        ? "승인된 실행 결과와 다음 행동 후보를 기억에 반영했습니다."
        : "승인 대기 또는 거절 상태를 기억에 남겼습니다."
  };
}
