import type { ExternalMessage } from "@/src/lib/integrations/types";
import { readJsonStore, writeJsonStore } from "@/src/lib/local-db/json-store";

type ExternalMessageDb = {
  messages: ExternalMessage[];
};

const EMPTY_DB: ExternalMessageDb = { messages: [] };

export async function addExternalMessage(message: ExternalMessage) {
  const db = await readDb();
  const index = db.messages.findIndex((item) => item.id === message.id);
  if (index >= 0) db.messages[index] = message;
  else db.messages.unshift(message);
  await writeDb(db);
  return message;
}

export async function listExternalMessages() {
  return (await readDb()).messages;
}

async function readDb() {
  const db = await readJsonStore<ExternalMessageDb>("external-messages.json", EMPTY_DB);
  return { messages: Array.isArray(db.messages) ? db.messages : [] };
}

function writeDb(db: ExternalMessageDb) {
  return writeJsonStore("external-messages.json", db);
}
