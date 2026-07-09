import { randomUUID } from "node:crypto";
import { readJsonStore, writeJsonStore } from "@/src/lib/local-db/json-store";

export type AutomationRecord = {
  id: string;
  name: string;
  trigger: string;
  action: string;
  runs: number;
  successRate: number;
  status: "active" | "paused" | "error";
  createdAt: string;
  updatedAt: string;
};

type AutomationDb = {
  automations: AutomationRecord[];
};

const EMPTY_DB: AutomationDb = { automations: [] };

export async function listAutomations() {
  return (await readDb()).automations;
}

export async function createAutomationDraft(input: {
  name: string;
  trigger: string;
  action: string;
}) {
  const now = new Date().toISOString();
  const automation: AutomationRecord = {
    id: randomUUID(),
    name: input.name.trim() || "새 자동화",
    trigger: input.trigger.trim() || "수동 실행",
    action: input.action.trim() || "Execution Preview 생성",
    runs: 0,
    successRate: 0,
    status: "paused",
    createdAt: now,
    updatedAt: now
  };
  const db = await readDb();
  db.automations.unshift(automation);
  await writeDb(db);
  return automation;
}

async function readDb() {
  const db = await readJsonStore<AutomationDb>("automation.json", EMPTY_DB);
  return { automations: Array.isArray(db.automations) ? db.automations : [] };
}

function writeDb(db: AutomationDb) {
  return writeJsonStore("automation.json", db);
}
