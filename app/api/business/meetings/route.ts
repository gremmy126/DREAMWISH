import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { createMeeting, listMeetings } from "@/src/lib/business/meeting.repository";
import { createCalendarEvent } from "@/src/lib/calendar/calendar.repository";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  return NextResponse.json({ meetings: await listMeetings(owner.uid) });
}

export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const title = clean(body.title, 200);
  const startsAt = date(body.startsAt);
  const endsAt = date(body.endsAt);
  if (!title || !startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt)) {
    return NextResponse.json({ error: "회의 제목과 올바른 시작·종료 시각이 필요합니다." }, { status: 400 });
  }
  let calendarEventId: string | null = null;
  if (body.addToCalendar === true) {
    const event = await createCalendarEvent({ ownerId: owner.uid, title, startsAt, endsAt, description: clean(body.notes, 4000), source: "manual" });
    calendarEventId = event.id;
  }
  const meeting = await createMeeting({
    ownerId: owner.uid, title, startsAt, endsAt,
    attendees: list(body.attendees), notes: clean(body.notes, 8000), decisions: clean(body.decisions, 8000),
    followUps: list(body.followUps), calendarEventId
  });
  return NextResponse.json({ meeting }, { status: 201 });
}

function clean(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function list(value: unknown) { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 100) : []; }
function date(value: unknown) { if (typeof value !== "string") return null; const parsed = new Date(value); return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null; }
