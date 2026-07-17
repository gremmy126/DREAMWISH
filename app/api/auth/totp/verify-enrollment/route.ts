import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { confirmTotpEnrollment } from "@/src/lib/auth/totp.service";
import {
  boundedIdentifier,
  invalidTotpRequest,
  resolveNetworkKey,
  sixDigitCode,
  totpRouteError
} from "../_shared";

export async function POST(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    const body = (await request.json().catch(() => ({}))) as {
      enrollmentId?: unknown;
      code?: unknown;
    };
    const enrollmentId = boundedIdentifier(body.enrollmentId);
    const code = sixDigitCode(body.code);
    if (!enrollmentId || !code) {
      return invalidTotpRequest("등록 요청과 여섯 자리 인증 코드를 확인해주세요.");
    }
    const result = await confirmTotpEnrollment({
      accountId: owner.uid,
      enrollmentId,
      code,
      networkKey: resolveNetworkKey(request)
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return totpRouteError(error);
  }
}
