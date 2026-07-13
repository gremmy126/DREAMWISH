import { randomUUID } from "node:crypto";
import { readJsonStore, withJsonStoreLock, writeJsonStore } from "../local-db/json-store";

export type MeetingRecord = {
  id: string; ownerId: string; title: string; startsAt: string; endsAt: string; attendees: string[];
  notes: string; decisions: string; followUps: string[]; calendarEventId: string | null; createdAt: string; updatedAt: string;
};

type MeetingDb = { meetings: MeetingRecord[] };
const FILE_NAME = "business-meetings.json";
const EMPTY_DB: MeetingDb = { meetings: [] };

export async function createMeeting(input: Omit<MeetingRecord, "id" | "calendarEventId" | "createdAt" | "updatedAt"> & { calendarEventId?: string | null }) {
  return withMeetings(async (db) => {
    const now = new Date().toISOString();
    const meeting: MeetingRecord = { ...input, id: randomUUID(), attendees: input.attendees.slice(0, 100), followUps: input.followUps.slice(0, 100), calendarEventId: input.calendarEventId || null, createdAt: now, updatedAt: now };
    db.meetings.unshift(meeting);
    return meeting;
  });
}

export async function listMeetings(ownerId: string) {
  return (await readDb()).meetings.filter((meeting) => meeting.ownerId === ownerId);
}

async function readDb() {
  const db = await readJsonStore<MeetingDb>(FILE_NAME, EMPTY_DB);
  return { meetings: Array.isArray(db.meetings) ? db.meetings : [] };
}

function withMeetings<T>(operation: (db: MeetingDb) => Promise<T> | T) {
  return withJsonStoreLock(FILE_NAME, async () => { const db = await readDb(); const result = await operation(db); await writeJsonStore(FILE_NAME, db); return result; });
}
