import { NextResponse } from "next/server";
import { DeviceProtocolError } from "@/src/lib/devices/device-contract";
import { getPairingStatus, readPairingAuthorization } from "@/src/lib/devices/pairing.service";

type Context = { params: Promise<{ sessionId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { sessionId } = await context.params;
    const publicToken = readPairingAuthorization(request.headers.get("authorization"));
    return NextResponse.json(await getPairingStatus({ sessionId, publicToken }));
  } catch (error) {
    return protocolError(error);
  }
}

function protocolError(error: unknown) {
  const safe = error instanceof DeviceProtocolError ? error : new DeviceProtocolError("PAIRING_REQUEST_INVALID");
  return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
}
