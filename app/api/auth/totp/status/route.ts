import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { getTotpFactorStatus } from "@/src/lib/auth/totp.service";
import { totpRouteError } from "../_shared";

export async function GET(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    const factor = await getTotpFactorStatus(owner.uid);
    return NextResponse.json({
      ok: true,
      factor: { ...factor, status: factor.status || "disabled" }
    });
  } catch (error) {
    return totpRouteError(error);
  }
}
