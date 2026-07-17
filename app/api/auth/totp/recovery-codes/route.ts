import { NextResponse } from "next/server";
import { regenerateRecoveryCodes } from "@/src/lib/auth/totp.service";
import {
  invalidTotpRequest,
  requireRecentOwnerContext,
  resolveNetworkKey,
  sixDigitCode,
  totpRouteError
} from "../_shared";

export async function POST(request: Request) {
  try {
    const owner = await requireRecentOwnerContext(request);
    const body = (await request.json().catch(() => ({}))) as {
      currentTotpCode?: unknown;
    };
    const currentTotpCode = sixDigitCode(body.currentTotpCode);
    if (!currentTotpCode) {
      return invalidTotpRequest("현재 여섯 자리 인증 코드를 입력해주세요.");
    }
    const result = await regenerateRecoveryCodes({
      accountId: owner.uid,
      actorAccountId: owner.uid,
      currentTotpCode,
      networkKey: resolveNetworkKey(request)
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return totpRouteError(error);
  }
}
