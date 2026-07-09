import type { SyncConflict } from "@/src/lib/integrations/types";
import { readJsonStore, writeJsonStore } from "@/src/lib/local-db/json-store";

type SyncConflictDb = {
  conflicts: SyncConflict[];
};

const EMPTY_DB: SyncConflictDb = { conflicts: [] };

export async function addSyncConflict(conflict: SyncConflict) {
  const db = await readDb();
  db.conflicts.unshift(conflict);
  await writeDb(db);
  return conflict;
}

export async function listSyncConflicts() {
  return (await readDb()).conflicts;
}

async function readDb() {
  const db = await readJsonStore<SyncConflictDb>("sync-conflicts.json", EMPTY_DB);
  return { conflicts: Array.isArray(db.conflicts) ? db.conflicts : [] };
}

function writeDb(db: SyncConflictDb) {
  return writeJsonStore("sync-conflicts.json", db);
}
