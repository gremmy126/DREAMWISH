import type { ExternalMessage } from "@/src/lib/integrations/types";
import { readJsonStore, writeJsonStore } from "@/src/lib/local-db/json-store";

type SlackMessageDb = {
  messages: ExternalMessage[];
};

const EMPTY_DB: SlackMessageDb = { messages: [] };

export async function upsertSlackMessages(messages: ExternalMessage[]) {
  const db = await readDb();
  for (const message of messages) {
    const index = db.messages.findIndex((item) => item.externalId === message.externalId);
    if (index >= 0) db.messages[index] = message;
    else db.messages.unshift(message);
  }
  await writeDb(db);
  return messages;
}

export async function listSlackMessages() {
  return (await readDb()).messages;
}

async function readDb() {
  const db = await readJsonStore<SlackMessageDb>("slack-messages.json", EMPTY_DB);
  return { messages: Array.isArray(db.messages) ? db.messages : [] };
}

function writeDb(db: SlackMessageDb) {
  return writeJsonStore("slack-messages.json", db);
}
