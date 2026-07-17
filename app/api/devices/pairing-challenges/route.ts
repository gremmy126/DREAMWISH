import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { DeviceProtocolError } from "@/src/lib/devices/device-contract";
import { createPairingSession } from "@/src/lib/devices/pairing.service";

export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => null)) as { platform?: unknown } | null;
  if (body?.platform !== "android" && body?.platform !== "ios") {
    return protocolError(new DeviceProtocolError("PAIRING_REQUEST_INVALID"));
  }
  try {
    const baseUrl = process.env.APP_URL?.trim() || new URL(request.url).origin;
    return NextResponse.json(await createPairingSession({ ownerId: owner.uid, platform: body.platform, baseUrl }), { status: 201 });
  } catch (error) {
    return protocolError(error);
  }
}

function protocolError(error: unknown) {
  const safe = error instanceof DeviceProtocolError ? error : new DeviceProtocolError("PAIRING_REQUEST_INVALID");
  return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
}
