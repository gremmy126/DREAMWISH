import { NextResponse } from "next/server";
import { DeviceProtocolError, type RegisterDeviceRequest } from "@/src/lib/devices/device-contract";
import { readPairingAuthorization, registerPairingDevice } from "@/src/lib/devices/pairing.service";

type Context = { params: Promise<{ sessionId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { sessionId } = await context.params;
    const publicToken = readPairingAuthorization(request.headers.get("authorization"));
    const body = (await request.json().catch(() => null)) as Omit<RegisterDeviceRequest, "publicToken"> | null;
    if (!body || typeof body !== "object") throw new DeviceProtocolError("PAIRING_REQUEST_INVALID");
    return NextResponse.json(await registerPairingDevice({ ...body, sessionId, publicToken }), { status: 201 });
  } catch (error) {
    return protocolError(error);
  }
}

function protocolError(error: unknown) {
  const safe = error instanceof DeviceProtocolError ? error : new DeviceProtocolError("PAIRING_REQUEST_INVALID");
  return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
}
