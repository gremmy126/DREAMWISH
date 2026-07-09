import type { ExternalEvent } from "@/src/lib/integrations/types";
import { readJsonStore, writeJsonStore } from "@/src/lib/local-db/json-store";

type ExternalEventDb = {
  events: ExternalEvent[];
};

const EMPTY_DB: ExternalEventDb = { events: [] };

export async function addExternalEvent(event: ExternalEvent) {
  const db = await readDb();
  const index = db.events.findIndex((item) => item.id === event.id);
  if (index >= 0) db.events[index] = event;
  else db.events.unshift(event);
  await writeDb(db);
  return event;
}

export async function listExternalEvents() {
  return (await readDb()).events;
}

async function readDb() {
  const db = await readJsonStore<ExternalEventDb>("external-events.json", EMPTY_DB);
  return { events: Array.isArray(db.events) ? db.events : [] };
}

function writeDb(db: ExternalEventDb) {
  return writeJsonStore("external-events.json", db);
}
