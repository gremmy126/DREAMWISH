import type { ExternalMessage } from "@/src/lib/integrations/types";
import { readJsonStore, withJsonStoreLock, writeJsonStore } from "../local-db/json-store";

type OwnedGmailMessage = ExternalMessage & { ownerId: string };

type GmailMessageDb = {
  messages: OwnedGmailMessage[];
};

const EMPTY_DB: GmailMessageDb = { messages: [] };
const FILE_NAME = "gmail-messages.json";

export async function upsertGmailMessages(ownerId: string, messages: ExternalMessage[]) {
  return withJsonStoreLock(FILE_NAME, async () => {
    const db = await readDb();
    const ownedMessages = messages.map((message) => ({ ...message, ownerId }));
    for (const message of ownedMessages) {
      const index = db.messages.findIndex(
        (item) => item.ownerId === ownerId && item.externalId === message.externalId
      );
      if (index >= 0) db.messages[index] = message;
      else db.messages.unshift(message);
    }
    await writeDb(db);
    return ownedMessages;
  });
}

export async function listGmailMessages(ownerId: string) {
  return (await readDb()).messages.filter((item) => item.ownerId === ownerId);
}

async function readDb() {
  const db = await readJsonStore<GmailMessageDb>(FILE_NAME, EMPTY_DB);
  return { messages: Array.isArray(db.messages) ? db.messages : [] };
}

function writeDb(db: GmailMessageDb) {
  return writeJsonStore(FILE_NAME, db);
}
