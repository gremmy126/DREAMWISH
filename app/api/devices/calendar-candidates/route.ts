import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { createCalendarEvent } from "@/src/lib/calendar/calendar.repository";
import { listCalendarCandidates, markCalendarCandidates } from "@/src/lib/devices/device.repository";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  const url = new URL(request.url);
  const candidates = await listCalendarCandidates(owner.uid, url.searchParams.get("deviceId") || undefined);
  return NextResponse.json({ candidates: candidates.filter((item) => item.status !== "imported") });
}

export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as { candidateIds?: string[] };
  const ids = Array.isArray(body.candidateIds) ? [...new Set(body.candidateIds.filter((id) => typeof id === "string"))].slice(0, 200) : [];
  const selected = (await listCalendarCandidates(owner.uid)).filter((item) => ids.includes(item.id) && item.status !== "imported");
  const events = [];
  for (const candidate of selected) {
    events.push(await createCalendarEvent({
      ownerId: owner.uid,
      title: candidate.title,
      startsAt: candidate.startsAt,
      endsAt: candidate.endsAt,
      description: `${candidate.sourceDevice} · ${candidate.sourceCalendar}에서 가져옴`,
      source: "device"
    }));
  }
  await markCalendarCandidates(owner.uid, selected.map((item) => item.id), "imported");
  return NextResponse.json({ events, importedCount: events.length });
}
