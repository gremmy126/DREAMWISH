import {
  listAutomationAiResults,
  type AutomationAiResult
} from "./runtime/execution.repository";

export type AutomationAnalysis = {
  generatedAt: string;
  results: AutomationAiResult[];
};

/**
 * Returns only persisted outputs produced by AI/OpenAI modules in completed
 * automation step runs. The output is already masked by the common execution
 * pipeline before it is written to automation_step_runs.
 */
export async function buildAutomationAnalysis(ownerId: string): Promise<AutomationAnalysis> {
  return {
    generatedAt: new Date().toISOString(),
    results: await listAutomationAiResults(ownerId, 20)
  };
}
