import type { ExternalMessage } from "@/src/lib/integrations/types";
import { readJsonStore, writeJsonStore } from "@/src/lib/local-db/json-store";

type GmailMessageDb = {
  messages: ExternalMessage[];
};

const EMPTY_DB: GmailMessageDb = { messages: [] };

export async function upsertGmailMessages(messages: ExternalMessage[]) {
  const db = await readDb();
  for (const message of messages) {
    const index = db.messages.findIndex((item) => item.externalId === message.externalId);
    if (index >= 0) db.messages[index] = message;
    else db.messages.unshift(message);
  }
  await writeDb(db);
  return messages;
}

export async function listGmailMessages() {
  return (await readDb()).messages;
}

async function readDb() {
  const db = await readJsonStore<GmailMessageDb>("gmail-messages.json", EMPTY_DB);
  return { messages: Array.isArray(db.messages) ? db.messages : [] };
}

function writeDb(db: GmailMessageDb) {
  return writeJsonStore("gmail-messages.json", db);
}
