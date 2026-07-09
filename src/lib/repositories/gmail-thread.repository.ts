import { readJsonStore, writeJsonStore } from "@/src/lib/local-db/json-store";

export type GmailThreadRecord = {
  id: string;
  threadId: string;
  messageIds: string[];
  subject: string;
  updatedAt: string;
};

type GmailThreadDb = {
  threads: GmailThreadRecord[];
};

const EMPTY_DB: GmailThreadDb = { threads: [] };

export async function upsertGmailThreads(threads: GmailThreadRecord[]) {
  const db = await readDb();
  for (const thread of threads) {
    const index = db.threads.findIndex((item) => item.threadId === thread.threadId);
    if (index >= 0) db.threads[index] = thread;
    else db.threads.unshift(thread);
  }
  await writeDb(db);
  return threads;
}

export async function listGmailThreads() {
  return (await readDb()).threads;
}

async function readDb() {
  const db = await readJsonStore<GmailThreadDb>("gmail-threads.json", EMPTY_DB);
  return { threads: Array.isArray(db.threads) ? db.threads : [] };
}

function writeDb(db: GmailThreadDb) {
  return writeJsonStore("gmail-threads.json", db);
}
