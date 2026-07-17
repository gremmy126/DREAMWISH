import { randomUUID } from "node:crypto";
import { readJsonStore, withJsonStoreLock, writeJsonStore } from "../local-db/json-store";
import type { ScenarioConfig } from "./scenario-designer";

export type AutomationRunStep = {
  nodeId: string;
  label: string;
  operation: string;
  order: number;
  status: "success" | "approval_required" | "failed" | "skipped";
  detail: string;
  /** Config with {{...}} mappings already resolved at execution time. */
  resolvedConfig?: ScenarioConfig;
};

export type AutomationRun = {
  id: string;
  ownerId: string;
  scenarioId: string;
  scenarioName: string;
  trigger: "manual" | "schedule" | "webhook";
  status: "success" | "partial" | "failed" | "waiting";
  steps: AutomationRunStep[];
  error: string | null;
  startedAt: string;
  finishedAt: string;
  createdAt: string;
  /** Trigger payload, kept (bounded) so failed runs can be re-executed. */
  triggerData?: Record<string, unknown>;
  /** Present while a delay node holds the run; the scheduler resumes it. */
  waiting?: {
    nodeId: string;
    resumeAt: string;
    completedNodeIds: string[];
    context: unknown;
  } | null;
  retryOfRunId?: string;
};

type RunDb = { runs: AutomationRun[] };

const FILE_NAME = "automation-runs.json";
const EMPTY_DB: RunDb = { runs: [] };
const MAX_RUNS = 500;

const MAX_TRIGGER_DATA_CHARS = 50_000;

export async function recordAutomationRun(
  input: Omit<AutomationRun, "id" | "createdAt">
): Promise<AutomationRun> {
  return accessDb((db) => {
    const triggerData =
      input.triggerData && JSON.stringify(input.triggerData).length <= MAX_TRIGGER_DATA_CHARS
        ? input.triggerData
        : undefined;
    const run: AutomationRun = {
      ...input,
      triggerData,
      id: randomUUID(),
      createdAt: new Date().toISOString()
    };
    db.runs.unshift(run);
    if (db.runs.length > MAX_RUNS) db.runs = db.runs.slice(0, MAX_RUNS);
    return structuredClone(run);
  });
}

export async function getAutomationRun(
  ownerId: string,
  runId: string
): Promise<AutomationRun | null> {
  return accessDb((db) => {
    const run = db.runs.find((item) => item.ownerId === ownerId && item.id === runId);
    return run ? structuredClone(run) : null;
  });
}

export async function updateAutomationRun(
  ownerId: string,
  runId: string,
  mutate: (run: AutomationRun) => void
): Promise<AutomationRun | null> {
  return accessDb((db) => {
    const run = db.runs.find((item) => item.ownerId === ownerId && item.id === runId);
    if (!run) return null;
    mutate(run);
    return structuredClone(run);
  });
}

/** Waiting runs whose resumeAt has passed — global scan for the scheduler. */
export async function listDueWaitingRuns(now: Date = new Date()): Promise<AutomationRun[]> {
  return accessDb((db) =>
    db.runs
      .filter(
        (run) =>
          run.status === "waiting" &&
          run.waiting &&
          new Date(run.waiting.resumeAt).getTime() <= now.getTime()
      )
      .map((run) => structuredClone(run))
  );
}

export async function listAutomationRuns(
  ownerId: string,
  options: { scenarioId?: string; limit?: number } = {}
): Promise<AutomationRun[]> {
  return accessDb((db) =>
    db.runs
      .filter(
        (run) =>
          run.ownerId === ownerId &&
          (!options.scenarioId || run.scenarioId === options.scenarioId)
      )
      .slice(0, Math.min(Math.max(options.limit || 30, 1), 100))
      .map((run) => structuredClone(run))
  );
}

async function accessDb<T>(operation: (db: RunDb) => T | Promise<T>): Promise<T> {
  return withJsonStoreLock(FILE_NAME, async () => {
    const raw = await readJsonStore<RunDb>(FILE_NAME, EMPTY_DB);
    const db: RunDb = { runs: Array.isArray(raw.runs) ? raw.runs : [] };
    const result = await operation(db);
    await writeJsonStore(FILE_NAME, db);
    return result;
  });
}
