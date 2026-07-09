import type { ExternalEvent } from "@/src/lib/integrations/types";
import { readJsonStore, writeJsonStore } from "@/src/lib/local-db/json-store";

type CalendarEventDb = {
  events: ExternalEvent[];
};

const EMPTY_DB: CalendarEventDb = { events: [] };

export async function upsertCalendarEvents(events: ExternalEvent[]) {
  const db = await readDb();
  for (const event of events) {
    const index = db.events.findIndex((item) => item.externalId === event.externalId);
    if (index >= 0) db.events[index] = event;
    else db.events.unshift(event);
  }
  await writeDb(db);
  return events;
}

export async function listCalendarEvents() {
  return (await readDb()).events;
}

async function readDb() {
  const db = await readJsonStore<CalendarEventDb>("external-calendar-events.json", EMPTY_DB);
  return { events: Array.isArray(db.events) ? db.events : [] };
}

function writeDb(db: CalendarEventDb) {
  return writeJsonStore("external-calendar-events.json", db);
}
