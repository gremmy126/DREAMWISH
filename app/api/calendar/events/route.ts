import { NextResponse } from "next/server";
import {
  createCalendarEvent,
  listCalendarItems
} from "@/src/lib/calendar/calendar.repository";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  return NextResponse.json({ events: await listCalendarItems(owner.uid) });
}

export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
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
    ownerId: owner.uid,
    title: body.title || "",
    startsAt: start,
    endsAt: end,
    description: body.description,
    source: "manual"
  });
  return NextResponse.json({ event }, { status: 201 });
}
