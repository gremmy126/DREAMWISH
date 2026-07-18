import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { revokeDevice, setDeviceStatus } from "@/src/lib/devices/device.repository";
import { revokeDevicePushTokens } from "@/src/lib/devices/push-token.repository";

type Context = { params: Promise<{ deviceId: string }> };

export async function PATCH(request: Request, context: Context) {
  const owner = await requireOwnerContext(request);
  const { deviceId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { status?: "active" | "paused" };
  if (body.status !== "active" && body.status !== "paused") {
    return NextResponse.json({ error: "지원하지 않는 기기 상태입니다." }, { status: 400 });
  }
  const device = await setDeviceStatus(owner.uid, deviceId, body.status);
  return device ? NextResponse.json({ device }) : NextResponse.json({ error: "기기를 찾지 못했습니다." }, { status: 404 });
}

export async function DELETE(request: Request, context: Context) {
  const owner = await requireOwnerContext(request);
  const { deviceId } = await context.params;
  const device = await revokeDevice(owner.uid, deviceId);
  if (device) await revokeDevicePushTokens(deviceId, owner.uid);
  return device ? NextResponse.json({ device }) : NextResponse.json({ error: "기기를 찾지 못했습니다." }, { status: 404 });
}
