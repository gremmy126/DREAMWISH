import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { beginTotpEnrollment } from "@/src/lib/auth/totp.service";
import { resolveNetworkKey, totpRouteError } from "../_shared";

export async function POST(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    const enrollment = await beginTotpEnrollment({
      account: { id: owner.uid, email: owner.email },
      networkKey: resolveNetworkKey(request)
    });
    return NextResponse.json({ ok: true, enrollment }, { status: 201 });
  } catch (error) {
    return totpRouteError(error);
  }
}
