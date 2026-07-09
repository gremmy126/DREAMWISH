import type { AgentLearningRecord, ExecutionResult } from "./agent.types";
import { updateAgentMemory } from "./memory";

export async function learnFromExecution(
  result: ExecutionResult
): Promise<AgentLearningRecord> {
  return updateAgentMemory(result);
}
