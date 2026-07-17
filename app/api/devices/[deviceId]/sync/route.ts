import { NextResponse } from "next/server";
import { createRevenueCandidate } from "@/src/lib/business/revenue.repository";
import { DeviceProtocolError } from "@/src/lib/devices/device-contract";
import { ingestCalendarCandidates, ingestContactCandidates } from "@/src/lib/devices/device.repository";
import { acceptSignedDeviceEnvelope } from "@/src/lib/devices/pairing.service";

type Context = { params: Promise<{ deviceId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { deviceId } = await context.params;
    const envelope = await request.json().catch(() => null);
    const accepted = await acceptSignedDeviceEnvelope({ deviceId, envelope });
    const payload = accepted.payload;
    const contacts = await ingestContactCandidates(accepted.device.ownerId, deviceId, payload.contacts);
    const calendarEvents = await ingestCalendarCandidates(accepted.device.ownerId, deviceId, payload.calendarEvents);
    const revenueSignals = [];
    for (const signal of payload.revenueSignals) {
      revenueSignals.push(await createRevenueCandidate({
        ownerId: accepted.device.ownerId,
        eventId: `${deviceId}:${signal.eventId}`,
        platform: accepted.device.platform,
        captureMethod: accepted.device.platform === "android" ? "notification_listener" : "share_extension",
        sourceApp: signal.sourceApp || "mobile-companion",
        capturedAt: signal.capturedAt || new Date().toISOString(),
        rawText: signal.rawText
      }));
    }
    return NextResponse.json({
      apiVersion: 1,
      ok: true,
      accepted: { contacts: contacts.length, calendarEvents: calendarEvents.length, revenueSignals: revenueSignals.length }
    });
  } catch (error) {
    const safe = error instanceof DeviceProtocolError ? error : new DeviceProtocolError("DEVICE_ENVELOPE_INVALID");
    return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
  }
}
