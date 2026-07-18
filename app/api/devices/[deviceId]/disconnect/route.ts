import { NextResponse } from "next/server";
import { DeviceProtocolError } from "@/src/lib/devices/device-contract";
import { revokeDevice } from "@/src/lib/devices/device.repository";
import { acceptSignedDeviceEnvelope } from "@/src/lib/devices/pairing.service";
import { revokeDevicePushTokens } from "@/src/lib/devices/push-token.repository";

type Context = { params: Promise<{ deviceId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { deviceId } = await context.params;
    const accepted = await acceptSignedDeviceEnvelope({ deviceId, envelope: await request.json().catch(() => null) });
    if (accepted.payload.type !== "device.disconnect") throw new DeviceProtocolError("DEVICE_ENVELOPE_INVALID");
    const device = await revokeDevice(accepted.device.ownerId, deviceId);
    await revokeDevicePushTokens(deviceId, accepted.device.ownerId);
    return NextResponse.json({ apiVersion: 1, ok: true, device });
  } catch (error) {
    const safe = error instanceof DeviceProtocolError ? error : new DeviceProtocolError("DEVICE_ENVELOPE_INVALID");
    return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
  }
}
