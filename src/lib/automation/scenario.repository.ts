import { readOwnerDocument, mutateOwnerDocument } from "../db/owner-document-store";
import { readJsonStore, writeJsonStore } from "../local-db/json-store";
import type { AutomationScenario, ScenarioStatus } from "./scenario-designer";

type ScenarioDocument = { scenarios: AutomationScenario[] };
type ScenarioFallbackDb = { owners: Record<string, ScenarioDocument> };

const EMPTY_DOCUMENT: ScenarioDocument = { scenarios: [] };
const EMPTY_DB: ScenarioFallbackDb = { owners: {} };
const NAMESPACE = "automation-scenarios-v1";

export async function listScenarios(ownerId: string) {
  const document = await readDocument(ownerId);
  return [...document.scenarios].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getScenario(ownerId: string, scenarioId: string) {
  return (await listScenarios(ownerId)).find((scenario) => scenario.id === scenarioId) || null;
}

export async function saveScenario(ownerId: string, scenario: AutomationScenario) {
  assertOwnerScenario(ownerId, scenario);
  const next = structuredClone({ ...scenario, ownerId, updatedAt: new Date().toISOString() });
  await mutateDocument(ownerId, (document) => {
    const index = document.scenarios.findIndex((item) => item.id === next.id);
    if (index >= 0) document.scenarios[index] = next;
    else document.scenarios.unshift(next);
  });
  return next;
}

export async function deleteScenario(ownerId: string, scenarioId: string) {
  let deleted = false;
  await mutateDocument(ownerId, (document) => {
    const before = document.scenarios.length;
    document.scenarios = document.scenarios.filter((item) => item.id !== scenarioId);
    deleted = document.scenarios.length !== before;
  });
  return deleted;
}

export async function updateScenarioStatus(
  ownerId: string,
  scenarioId: string,
  status: ScenarioStatus
): Promise<AutomationScenario | null> {
  let updated: AutomationScenario | null = null;
  await mutateDocument(ownerId, (document) => {
    const scenario = document.scenarios.find((item) => item.id === scenarioId);
    if (!scenario) return;
    scenario.status = status;
    scenario.updatedAt = new Date().toISOString();
    updated = structuredClone(scenario);
  });
  return updated;
}

export async function recordScenarioRun(
  ownerId: string,
  scenarioId: string,
  success: boolean
): Promise<AutomationScenario | null> {
  let updated: AutomationScenario | null = null;
  await mutateDocument(ownerId, (document) => {
    const scenario = document.scenarios.find((item) => item.id === scenarioId);
    if (!scenario) return;
    scenario.runs += 1;
    if (success) scenario.successfulRuns += 1;
    scenario.lastRunAt = new Date().toISOString();
    scenario.status = success ? scenario.status : "error";
    scenario.updatedAt = scenario.lastRunAt;
    updated = structuredClone(scenario);
  });
  return updated;
}

async function readDocument(ownerId: string): Promise<ScenarioDocument> {
  if (process.env.DATABASE_URL) return readOwnerDocument(ownerId, NAMESPACE, EMPTY_DOCUMENT);
  const db = await readJsonStore<ScenarioFallbackDb>("automation-scenarios.json", EMPTY_DB);
  return structuredClone(db.owners?.[ownerId] || EMPTY_DOCUMENT);
}

async function mutateDocument(ownerId: string, mutate: (document: ScenarioDocument) => void | Promise<void>) {
  if (process.env.DATABASE_URL) {
    await mutateOwnerDocument(ownerId, NAMESPACE, EMPTY_DOCUMENT, mutate);
    return;
  }
  const db = await readJsonStore<ScenarioFallbackDb>("automation-scenarios.json", EMPTY_DB);
  db.owners ||= {};
  const document = structuredClone(db.owners[ownerId] || EMPTY_DOCUMENT);
  await mutate(document);
  db.owners[ownerId] = document;
  await writeJsonStore("automation-scenarios.json", db);
}

function assertOwnerScenario(ownerId: string, scenario: AutomationScenario) {
  if (!ownerId.trim() || scenario.ownerId !== ownerId) throw new Error("Scenario owner mismatch.");
  if (scenario.nodes.length > 100 || scenario.edges.length > 200) throw new Error("Scenario is too large.");
}
