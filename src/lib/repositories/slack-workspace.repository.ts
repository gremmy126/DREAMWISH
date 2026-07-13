import { readJsonStore, withJsonStoreLock, writeJsonStore } from "../local-db/json-store";

export type SlackWorkspaceRecord = {
  id: string;
  teamId: string;
  teamName: string;
  connectedAt: string;
};

type SlackWorkspaceDb = {
  workspaces: Array<SlackWorkspaceRecord & { ownerId: string }>;
};

const EMPTY_DB: SlackWorkspaceDb = { workspaces: [] };
const FILE_NAME = "slack-workspaces.json";

export async function upsertSlackWorkspace(ownerId: string, workspace: SlackWorkspaceRecord) {
  return withJsonStoreLock(FILE_NAME, async () => {
    const db = await readDb();
    const ownedWorkspace = { ...workspace, ownerId };
    const index = db.workspaces.findIndex(
      (item) => item.ownerId === ownerId && item.teamId === workspace.teamId
    );
    if (index >= 0) db.workspaces[index] = ownedWorkspace;
    else db.workspaces.unshift(ownedWorkspace);
    await writeDb(db);
    return ownedWorkspace;
  });
}

export async function listSlackWorkspaces(ownerId: string) {
  return (await readDb()).workspaces.filter((item) => item.ownerId === ownerId);
}

async function readDb() {
  const db = await readJsonStore<SlackWorkspaceDb>(FILE_NAME, EMPTY_DB);
  return { workspaces: Array.isArray(db.workspaces) ? db.workspaces : [] };
}

function writeDb(db: SlackWorkspaceDb) {
  return writeJsonStore(FILE_NAME, db);
}
