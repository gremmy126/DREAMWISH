import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { DeviceProtocolError } from "@/src/lib/devices/device-contract";
import { confirmPairingSession } from "@/src/lib/devices/pairing.service";

type Context = { params: Promise<{ sessionId: string }> };

export async function POST(request: Request, context: Context) {
  const owner = await requireOwnerContext(request);
  try {
    const { sessionId } = await context.params;
    const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
    return NextResponse.json(await confirmPairingSession({
      ownerId: owner.uid,
      sessionId,
      code: typeof body?.code === "string" ? body.code : ""
    }));
  } catch (error) {
    return protocolError(error);
  }
}

function protocolError(error: unknown) {
  const safe = error instanceof DeviceProtocolError ? error : new DeviceProtocolError("PAIRING_REQUEST_INVALID");
  return NextResponse.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
}
