import type { SyncJob } from "@/src/lib/integrations/types";
import { readJsonStore } from "@/src/lib/local-db/json-store";

type SyncJobDb = {
  jobs: SyncJob[];
};

const EMPTY_DB: SyncJobDb = { jobs: [] };

export async function listSyncJobs() {
  const db = await readJsonStore<SyncJobDb>("sync-jobs.json", EMPTY_DB);
  return Array.isArray(db.jobs) ? db.jobs : [];
}
