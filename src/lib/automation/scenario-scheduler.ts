import { listLatestOwnerDocuments } from "../db/owner-document-store";
import { readJsonStore } from "../local-db/json-store";
import {
  listDueWaitingRuns,
  recordAutomationRun,
  updateAutomationRun,
  type AutomationRunStep
} from "./run.repository";
import { isGmailWatchNode, pollGmailForScenario } from "./gmail-trigger";
import { computeNextRunAt, parseScheduleConfig } from "./schedule";
import { getScenario, listScenarios, saveScenario } from "./scenario.repository";
import { executeScenarioGraph, type WorkflowContext } from "./workflow-engine";
import type { AutomationScenario } from "./scenario-designer";
import { hasPostgresStorage } from "../db/postgres";
import { enqueueScenarioExecution } from "./runtime/execution-enqueue.service";

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
): {
  steps: AutomationRunStep[];
  status: "success" | "partial" | "failed" | "waiting";
  waiting?: { nodeId: string; resumeAt: string; completedNodeIds: string[]; context: unknown };
} {
  const result = executeScenarioGraph(scenario, {
    connectedApps: options.connectedApps,
    triggerData: options.triggerData
  });
  return {
    steps: result.steps,
    status: result.status,
    waiting: result.waiting ? { ...result.waiting, context: result.context } : undefined
  };
}

/** Continues waiting runs whose delay has elapsed; scheduler-driven, no sleeps. */
export async function resumeDueWaitingRuns(now: Date = new Date()): Promise<number> {
  const dueRuns = await listDueWaitingRuns(now);
  let resumed = 0;
  for (const run of dueRuns) {
    const scenario = await getScenario(run.ownerId, run.scenarioId);
    if (!scenario || !run.waiting) {
      await updateAutomationRun(run.ownerId, run.id, (record) => {
        record.status = "failed";
        record.error = "재개할 시나리오를 찾을 수 없습니다.";
        record.waiting = null;
      });
      continue;
    }
    const result = executeScenarioGraph(scenario, {
      resume: {
        context: run.waiting.context as WorkflowContext,
        completedNodeIds: run.waiting.completedNodeIds
      }
    });
    await updateAutomationRun(run.ownerId, run.id, (record) => {
      record.steps = [...record.steps, ...result.steps];
      record.status = result.status;
      record.waiting = result.waiting ? { ...result.waiting, context: result.context } : null;
      record.finishedAt = new Date().toISOString();
    });
    resumed += 1;
  }
  return resumed;
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
  await resumeDueWaitingRuns(now).catch(() => 0);
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
        // A schedule node in Gmail-watch mode polls for new mail instead of
        // running unconditionally: no new mail means no run this pass.
        if (scenario.nodes.some(isGmailWatchNode)) {
          const poll = await pollGmailForScenario(scenario);
          if (poll.newMessages > 0) {
            await saveScenario(ownerId, {
              ...claimed,
              runs: claimed.runs + poll.newMessages,
              successfulRuns: claimed.successfulRuns + poll.newMessages,
              lastRunAt: new Date().toISOString()
            });
            summary.executed += poll.newMessages;
          }
          continue;
        }
        if (hasPostgresStorage()) {
          await enqueueScenarioExecution({
            ownerId,
            actorId: "automation-scheduler",
            scenario,
            executionMode: "live",
            triggerType: "schedule",
            triggerEventId: scenario.nextRunAt,
            triggerData: { scheduledAt: scenario.nextRunAt || startedAt },
            priority: 10
          });
          await saveScenario(ownerId, {
            ...claimed,
            runs: claimed.runs + 1,
            lastRunAt: startedAt
          });
          summary.executed += 1;
          continue;
        }
        const result = executeScenarioSteps(scenario);
        const finishedAt = new Date().toISOString();
        await recordAutomationRun({
          ownerId,
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          trigger: "schedule",
          status: result.status,
          steps: result.steps,
          waiting: result.waiting || null,
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
