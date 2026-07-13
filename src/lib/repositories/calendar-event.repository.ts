import type { ExternalEvent } from "@/src/lib/integrations/types";
import { readJsonStore, withJsonStoreLock, writeJsonStore } from "../local-db/json-store";

type OwnedCalendarEvent = ExternalEvent & { ownerId: string };

type CalendarEventDb = {
  events: OwnedCalendarEvent[];
};

const EMPTY_DB: CalendarEventDb = { events: [] };
const FILE_NAME = "external-calendar-events.json";

export async function upsertCalendarEvents(ownerId: string, events: ExternalEvent[]) {
  return withJsonStoreLock(FILE_NAME, async () => {
    const db = await readDb();
    const ownedEvents = events.map((event) => ({ ...event, ownerId }));
    for (const event of ownedEvents) {
      const index = db.events.findIndex(
        (item) => item.ownerId === ownerId && item.externalId === event.externalId
      );
      if (index >= 0) db.events[index] = event;
      else db.events.unshift(event);
    }
    await writeDb(db);
    return ownedEvents;
  });
}

export async function listCalendarEvents(ownerId: string) {
  return (await readDb()).events.filter((item) => item.ownerId === ownerId);
}

async function readDb() {
  const db = await readJsonStore<CalendarEventDb>(FILE_NAME, EMPTY_DB);
  return { events: Array.isArray(db.events) ? db.events : [] };
}

function writeDb(db: CalendarEventDb) {
  return writeJsonStore(FILE_NAME, db);
}
