import type { ConnectorSyncResult } from "@/src/lib/integrations/types";
import { readJsonStore, withJsonStoreLock, writeJsonStore } from "../local-db/json-store";

type OwnedSyncResult = ConnectorSyncResult & { ownerId: string };

type SyncHistoryDb = {
  history: OwnedSyncResult[];
};

const EMPTY_DB: SyncHistoryDb = { history: [] };
const FILE_NAME = "sync-history.json";

export async function addSyncHistory(ownerId: string, result: ConnectorSyncResult) {
  return withJsonStoreLock(FILE_NAME, async () => {
    const db = await readDb();
    const ownedResult = { ...result, ownerId };
    db.history.unshift(ownedResult);
    await writeDb(db);
    return ownedResult;
  });
}

export async function listSyncHistory(ownerId: string) {
  return (await readDb()).history.filter((item) => item.ownerId === ownerId);
}

async function readDb() {
  const db = await readJsonStore<SyncHistoryDb>(FILE_NAME, EMPTY_DB);
  return { history: Array.isArray(db.history) ? db.history : [] };
}

function writeDb(db: SyncHistoryDb) {
  return writeJsonStore(FILE_NAME, db);
}
