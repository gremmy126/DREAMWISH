import { randomUUID } from "node:crypto";
import { readJsonStore, writeJsonStore } from "../local-db/json-store";

export type CalendarItem = {
  id: string;
  ownerId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  description: string;
  source: "manual" | "google" | "device";
  createdAt: string;
  updatedAt: string;
};

type CalendarDb = {
  events: CalendarItem[];
};

const EMPTY_DB: CalendarDb = { events: [] };

export async function listCalendarItems(ownerId: string) {
  return (await readDb()).events.filter((item) => item.ownerId === ownerId);
}

export async function createCalendarEvent(input: {
  ownerId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  description?: string;
  source: CalendarItem["source"];
}) {
  const now = new Date().toISOString();
  const event: CalendarItem = {
    id: randomUUID(),
    ownerId: input.ownerId,
    title: input.title.trim() || "새 일정",
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    description: input.description?.trim() || "",
    source: input.source,
    createdAt: now,
    updatedAt: now
  };
  const db = await readDb();
  db.events.unshift(event);
  await writeDb(db);
  return event;
}

async function readDb() {
  const db = await readJsonStore<CalendarDb>("calendar.json", EMPTY_DB);
  return { events: Array.isArray(db.events) ? db.events : [] };
}

function writeDb(db: CalendarDb) {
  return writeJsonStore("calendar.json", db);
}
