import { listLatestOwnerDocuments } from "../db/owner-document-store";
import { readJsonStore } from "../local-db/json-store";
import { recordAutomationRun, type AutomationRunStep } from "./run.repository";
import { computeNextRunAt, parseScheduleConfig } from "./schedule";
import { listScenarios, saveScenario } from "./scenario.repository";
import { executeScenarioGraph } from "./workflow-engine";
import type { AutomationScenario } from "./scenario-designer";

/** Refreshes a scenario's nextRunAt from its schedule trigger node. */
export function resolveScenarioNextRun(
  scenario: AutomationScenario,
  from: Date = new Date()
): string | null {
  if (scenario.status !== "active") return null;
  const scheduleNode = scenario.nodes.find((node) => node.appId === "schedule");
  if (!scheduleNode) return null;
  const schedule = parseScheduleConfig(scheduleNode.config);
  if (!schedule) return null;
  return computeNextRunAt(schedule, from);
}

/**
 * Deterministic node execution honoring the approval policy. Delegates to
 * the graph-aware engine so filter/router branches and {{...}} mappings are
 * evaluated identically for manual, scheduled and webhook runs.
 */
export function executeScenarioSteps(
  scenario: AutomationScenario,
  options: { connectedApps?: Set<string>; triggerData?: Record<string, unknown> } = {}
): { steps: AutomationRunStep[]; status: "success" | "partial" | "failed" } {
  const result = executeScenarioGraph(scenario, {
    connectedApps: options.connectedApps,
    triggerData: options.triggerData
  });
  return { steps: result.steps, status: result.status };
}

export type DueScenarioSummary = {
  checked: number;
  executed: number;
  failures: number;
};

/**
 * Runs every active scenario whose nextRunAt has passed. The nextRunAt is
 * advanced (claimed) before executing so overlapping scheduler passes cannot
 * double-run the same slot.
 */
export async function runDueScenarios(now: Date = new Date()): Promise<DueScenarioSummary> {
  const summary: DueScenarioSummary = { checked: 0, executed: 0, failures: 0 };
  const ownerIds = await listScenarioOwnerIds();

  for (const ownerId of ownerIds) {
    const scenarios = await listScenarios(ownerId);
    for (const scenario of scenarios) {
      summary.checked += 1;
      if (scenario.status !== "active") continue;
      if (!scenario.nextRunAt || new Date(scenario.nextRunAt).getTime() > now.getTime()) continue;

      const nextRunAt = resolveScenarioNextRun(scenario, now);
      const claimed = { ...scenario, nextRunAt };
      await saveScenario(ownerId, claimed);

      const startedAt = now.toISOString();
      try {
        const result = executeScenarioSteps(scenario);
        const finishedAt = new Date().toISOString();
        await recordAutomationRun({
          ownerId,
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          trigger: "schedule",
          status: result.status,
          steps: result.steps,
          error: null,
          startedAt,
          finishedAt
        });
        await saveScenario(ownerId, {
          ...claimed,
          runs: claimed.runs + 1,
          successfulRuns: claimed.successfulRuns + (result.status !== "failed" ? 1 : 0),
          lastRunAt: finishedAt
        });
        summary.executed += 1;
        if (result.status === "failed") summary.failures += 1;
      } catch (error) {
        summary.failures += 1;
        await recordAutomationRun({
          ownerId,
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          trigger: "schedule",
          status: "failed",
          steps: [],
          error: error instanceof Error ? error.message : "실행 실패",
          startedAt,
          finishedAt: new Date().toISOString()
        }).catch(() => undefined);
      }
    }
  }
  return summary;
}

async function listScenarioOwnerIds(): Promise<string[]> {
  if (process.env.DATABASE_URL) {
    const documents = await listLatestOwnerDocuments("automation-scenarios-v1");
    return documents.map((document) => document.ownerId);
  }
  const db = await readJsonStore<{ owners?: Record<string, unknown> }>(
    "automation-scenarios.json",
    { owners: {} }
  );
  return Object.keys(db.owners || {});
}
