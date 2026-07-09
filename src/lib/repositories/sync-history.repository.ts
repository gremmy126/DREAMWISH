import type { ConnectorSyncResult } from "@/src/lib/integrations/types";
import { readJsonStore, writeJsonStore } from "@/src/lib/local-db/json-store";

type SyncHistoryDb = {
  history: ConnectorSyncResult[];
};

const EMPTY_DB: SyncHistoryDb = { history: [] };

export async function addSyncHistory(result: ConnectorSyncResult) {
  const db = await readDb();
  db.history.unshift(result);
  await writeDb(db);
  return result;
}

export async function listSyncHistory() {
  return (await readDb()).history;
}

async function readDb() {
  const db = await readJsonStore<SyncHistoryDb>("sync-history.json", EMPTY_DB);
  return { history: Array.isArray(db.history) ? db.history : [] };
}

function writeDb(db: SyncHistoryDb) {
  return writeJsonStore("sync-history.json", db);
}
