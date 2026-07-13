import { NextResponse } from "next/server";
import { createRevenueCandidate } from "@/src/lib/business/revenue.repository";
import {
  acceptDeviceEnvelope,
  ingestCalendarCandidates,
  ingestContactCandidates
} from "@/src/lib/devices/device.repository";

type Context = { params: Promise<{ deviceId: string }> };

export async function POST(request: Request, context: Context) {
  const { deviceId } = await context.params;
  const secret = readDeviceSecret(request.headers.get("authorization"));
  const body = (await request.json().catch(() => ({}))) as {
    sequence?: number;
    contacts?: Parameters<typeof ingestContactCandidates>[2];
    calendarEvents?: Parameters<typeof ingestCalendarCandidates>[2];
    revenueSignals?: Array<{ eventId: string; sourceApp?: string; capturedAt?: string; rawText: string }>;
  };
  if (!secret || !Number.isSafeInteger(body.sequence)) {
    return NextResponse.json({ error: "기기 인증 정보가 필요합니다." }, { status: 401 });
  }
  try {
    const device = await acceptDeviceEnvelope(deviceId, secret, Number(body.sequence));
    const contacts = await ingestContactCandidates(device.ownerId, device.id, Array.isArray(body.contacts) ? body.contacts : []);
    const calendarEvents = await ingestCalendarCandidates(device.ownerId, device.id, Array.isArray(body.calendarEvents) ? body.calendarEvents : []);
    const revenueSignals = [];
    for (const signal of Array.isArray(body.revenueSignals) ? body.revenueSignals.slice(0, 100) : []) {
      if (!signal.eventId || !signal.rawText) continue;
      revenueSignals.push(await createRevenueCandidate({
        ownerId: device.ownerId,
        eventId: `${device.id}:${signal.eventId}`,
        platform: device.platform,
        captureMethod: device.platform === "android" ? "notification_listener" : "share_extension",
        sourceApp: String(signal.sourceApp || "mobile-companion").slice(0, 200),
        capturedAt: validDate(signal.capturedAt) || new Date().toISOString(),
        rawText: String(signal.rawText).slice(0, 4000)
      }));
    }
    return NextResponse.json({ ok: true, accepted: { contacts: contacts.length, calendarEvents: calendarEvents.length, revenueSignals: revenueSignals.length } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "device_sync_rejected";
    const status = code === "device_replay" ? 409 : 401;
    return NextResponse.json({ error: code }, { status });
  }
}

function readDeviceSecret(value: string | null) {
  const match = value?.match(/^Device\s+([A-Za-z0-9_-]{32,})$/u);
  return match?.[1] || null;
}

function validDate(value: unknown) {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
