import { NextResponse } from "next/server";
import { acceptSignedDeviceEnvelope } from "@/src/lib/devices/pairing.service";
import { DeviceProtocolError } from "@/src/lib/devices/device-contract";
import { registerDevicePushToken, revokeDevicePushToken } from "@/src/lib/devices/push-token.repository";

type Context = { params: Promise<{ deviceId: string }> };
export async function POST(request: Request, context: Context) {
  try {
    const { deviceId } = await context.params; const envelope = await request.json().catch(() => null);
    const accepted = await acceptSignedDeviceEnvelope({ deviceId, envelope }); const payload = accepted.payload;
    if (payload.type !== "device.push-token" || payload.platform !== accepted.device.platform) throw new DeviceProtocolError("DEVICE_ENVELOPE_INVALID");
    const token = payload.action === "register"
      ? await registerDevicePushToken({deviceId, ownerId: accepted.device.ownerId, platform: accepted.device.platform, token: payload.token})
      : await revokeDevicePushToken({deviceId, ownerId: accepted.device.ownerId, token: payload.token});
    return NextResponse.json({apiVersion: 1, ok: true, token});
  } catch (error) {
    const safe = error instanceof DeviceProtocolError ? error : new DeviceProtocolError("DEVICE_ENVELOPE_INVALID");
    return NextResponse.json({error: {code: safe.code, message: safe.message}}, {status: safe.status});
  }
}
