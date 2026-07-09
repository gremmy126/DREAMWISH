import { NextResponse } from "next/server";
import {
  createCalendarEvent,
  listCalendarItems
} from "@/src/lib/calendar/calendar.repository";

export async function GET() {
  return NextResponse.json({ events: await listCalendarItems() });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    startsAt?: string;
    endsAt?: string;
    description?: string;
  };
  const start = body.startsAt || new Date().toISOString();
  const end =
    body.endsAt ||
    new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString();
  const event = await createCalendarEvent({
    title: body.title || "",
    startsAt: start,
    endsAt: end,
    description: body.description,
    source: "manual"
  });
  return NextResponse.json({ event }, { status: 201 });
}
