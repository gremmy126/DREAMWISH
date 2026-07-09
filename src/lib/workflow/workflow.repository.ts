import { randomUUID } from "node:crypto";
import type { Workflow } from "@/src/lib/automation/workflow.types";
import { createWorkflowDraft } from "@/src/lib/automation/workflow.service";
import { readJsonStore, writeJsonStore } from "@/src/lib/local-db/json-store";

type WorkflowDb = {
  workspaces: Workflow[];
};

const EMPTY_DB: WorkflowDb = { workspaces: [] };

export async function listWorkflowWorkspaces() {
  return (await readDb()).workspaces;
}

export async function createWorkflowWorkspace(input: {
  name: string;
  description?: string;
  triggerType?: string;
}) {
  const db = await readDb();
  const draft = createWorkflowDraft(input.name, input.triggerType || "manual");
  const workspace: Workflow = {
    ...draft,
    id: randomUUID(),
    description: input.description?.trim() || draft.description
  };
  db.workspaces.unshift(workspace);
  await writeDb(db);
  return workspace;
}

async function readDb() {
  const db = await readJsonStore<WorkflowDb>("workflow.json", EMPTY_DB);
  return { workspaces: Array.isArray(db.workspaces) ? db.workspaces : [] };
}

function writeDb(db: WorkflowDb) {
  return writeJsonStore("workflow.json", db);
}
