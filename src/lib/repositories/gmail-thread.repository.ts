import { readJsonStore, withJsonStoreLock, writeJsonStore } from "../local-db/json-store";

export type GmailThreadRecord = {
  id: string;
  threadId: string;
  messageIds: string[];
  subject: string;
  updatedAt: string;
};

type GmailThreadDb = {
  threads: Array<GmailThreadRecord & { ownerId: string }>;
};

const EMPTY_DB: GmailThreadDb = { threads: [] };
const FILE_NAME = "gmail-threads.json";

export async function upsertGmailThreads(ownerId: string, threads: GmailThreadRecord[]) {
  return withJsonStoreLock(FILE_NAME, async () => {
    const db = await readDb();
    const ownedThreads = threads.map((thread) => ({ ...thread, ownerId }));
    for (const thread of ownedThreads) {
      const index = db.threads.findIndex(
        (item) => item.ownerId === ownerId && item.threadId === thread.threadId
      );
      if (index >= 0) db.threads[index] = thread;
      else db.threads.unshift(thread);
    }
    await writeDb(db);
    return ownedThreads;
  });
}

export async function listGmailThreads(ownerId: string) {
  return (await readDb()).threads.filter((item) => item.ownerId === ownerId);
}

async function readDb() {
  const db = await readJsonStore<GmailThreadDb>(FILE_NAME, EMPTY_DB);
  return { threads: Array.isArray(db.threads) ? db.threads : [] };
}

function writeDb(db: GmailThreadDb) {
  return writeJsonStore(FILE_NAME, db);
}
