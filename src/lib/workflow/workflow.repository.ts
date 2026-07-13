import { randomUUID } from "node:crypto";
import type { Workflow } from "../automation/workflow.types";
import { createWorkflowDraft } from "../automation/workflow.service";
import { readJsonStore, writeJsonStore } from "../local-db/json-store";

export type WorkflowWorkspace = Workflow & { ownerId: string };

type WorkflowDb = {
  workspaces: WorkflowWorkspace[];
};

const EMPTY_DB: WorkflowDb = { workspaces: [] };

export async function listWorkflowWorkspaces(ownerId: string) {
  return (await readDb()).workspaces.filter((item) => item.ownerId === ownerId);
}

export async function createWorkflowWorkspace(input: {
  ownerId: string;
  name: string;
  description?: string;
  triggerType?: string;
}) {
  const db = await readDb();
  const draft = createWorkflowDraft(input.name, input.triggerType || "manual");
  const workspace: WorkflowWorkspace = {
    ...draft,
    id: randomUUID(),
    ownerId: input.ownerId,
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
