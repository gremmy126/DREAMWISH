import { randomUUID } from "node:crypto";
import { readJsonStore, withJsonStoreLock, writeJsonStore } from "../local-db/json-store";

export type AutomationRunStep = {
  nodeId: string;
  label: string;
  operation: string;
  order: number;
  status: "success" | "approval_required" | "failed" | "skipped";
  detail: string;
};

export type AutomationRun = {
  id: string;
  ownerId: string;
  scenarioId: string;
  scenarioName: string;
  trigger: "manual" | "schedule";
  status: "success" | "partial" | "failed";
  steps: AutomationRunStep[];
  error: string | null;
  startedAt: string;
  finishedAt: string;
  createdAt: string;
};

type RunDb = { runs: AutomationRun[] };

const FILE_NAME = "automation-runs.json";
const EMPTY_DB: RunDb = { runs: [] };
const MAX_RUNS = 500;

export async function recordAutomationRun(
  input: Omit<AutomationRun, "id" | "createdAt">
): Promise<AutomationRun> {
  return accessDb((db) => {
    const run: AutomationRun = {
      ...input,
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
