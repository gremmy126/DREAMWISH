import { readJsonStore, writeJsonStore } from "@/src/lib/local-db/json-store";

export type SlackWorkspaceRecord = {
  id: string;
  teamId: string;
  teamName: string;
  connectedAt: string;
};

type SlackWorkspaceDb = {
  workspaces: SlackWorkspaceRecord[];
};

const EMPTY_DB: SlackWorkspaceDb = { workspaces: [] };

export async function upsertSlackWorkspace(workspace: SlackWorkspaceRecord) {
  const db = await readDb();
  const index = db.workspaces.findIndex((item) => item.teamId === workspace.teamId);
  if (index >= 0) db.workspaces[index] = workspace;
  else db.workspaces.unshift(workspace);
  await writeDb(db);
  return workspace;
}

export async function listSlackWorkspaces() {
  return (await readDb()).workspaces;
}

async function readDb() {
  const db = await readJsonStore<SlackWorkspaceDb>("slack-workspaces.json", EMPTY_DB);
  return { workspaces: Array.isArray(db.workspaces) ? db.workspaces : [] };
}

function writeDb(db: SlackWorkspaceDb) {
  return writeJsonStore("slack-workspaces.json", db);
}
