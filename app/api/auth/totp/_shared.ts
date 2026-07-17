import { NextResponse } from "next/server";
import {
  OwnerContextError,
  readSessionCookie,
  requireOwnerContext,
  type OwnerContext
} from "@/src/lib/auth/owner-context";
import { verifySessionToken } from "@/src/lib/auth/session-token";
import {
  isTotpSecurityError,
  type TotpSecurityErrorCode
} from "@/src/lib/auth/totp.service";

const PRIMARY_REAUTH_MAX_AGE_SECONDS = 5 * 60;

const TOTP_ERROR_MESSAGES: Partial<Record<TotpSecurityErrorCode, string>> = {
  TOTP_ALREADY_ENABLED: "이 계정에는 이미 인증기가 등록되어 있습니다.",
  TOTP_ENROLLMENT_NOT_FOUND: "진행 중인 인증기 등록을 찾을 수 없습니다. 다시 시작해주세요.",
  TOTP_ENROLLMENT_EXPIRED: "인증기 등록 시간이 만료되었습니다. 다시 등록을 시작해주세요.",
  TOTP_ENROLLMENT_LOCKED: "인증 시도가 너무 많습니다. 잠시 후 다시 등록해주세요.",
  TOTP_INVALID_CODE: "인증 코드가 올바르지 않습니다. 다시 확인해주세요.",
  TOTP_CODE_REPLAYED: "이미 사용한 인증 코드입니다. 새 코드를 기다렸다가 입력해주세요.",
  TOTP_CLOCK_DRIFT: "인증기의 시간이 맞지 않습니다. 기기 시간을 자동으로 동기화한 뒤 다시 시도해주세요.",
  TOTP_NOT_ENABLED: "이 계정에는 활성화된 인증기가 없습니다.",
  TOTP_RATE_LIMITED: "인증 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.",
  RECOVERY_CODE_INVALID: "복구 코드가 올바르지 않거나 이미 사용되었습니다."
};

class PrimaryReauthRequiredError extends Error {
  readonly code = "PRIMARY_REAUTH_REQUIRED" as const;
  readonly status = 401 as const;

  constructor() {
    super("보안 설정을 변경하려면 다시 로그인해주세요.");
    this.name = "PrimaryReauthRequiredError";
  }
}

export async function requireRecentOwnerContext(request: Request): Promise<OwnerContext> {
  const owner = await requireOwnerContext(request);
  const token = readSessionCookie(request.headers.get("cookie"));
  const claims = token ? await verifySessionToken(token) : null;
  const now = Math.floor(Date.now() / 1000);
  if (
    !claims ||
    claims.uid !== owner.uid ||
    now - claims.iat > PRIMARY_REAUTH_MAX_AGE_SECONDS
  ) {
    throw new PrimaryReauthRequiredError();
  }
  return owner;
}

export function totpRouteError(error: unknown) {
  if (error instanceof OwnerContextError) {
    return NextResponse.json(
      { ok: false, code: error.code, error: "로그인이 필요합니다." },
      { status: error.status }
    );
  }
  if (error instanceof PrimaryReauthRequiredError) {
    return NextResponse.json(
      { ok: false, code: error.code, error: error.message },
      { status: error.status }
    );
  }
  if (isTotpSecurityError(error)) {
    return NextResponse.json(
      {
        ok: false,
        code: error.code,
        error:
          TOTP_ERROR_MESSAGES[error.code] ||
          "인증기 보안 설정을 처리하지 못했습니다. 잠시 후 다시 시도해주세요."
      },
      { status: error.status }
    );
  }
  return NextResponse.json(
    {
      ok: false,
      code: "TOTP_REQUEST_FAILED",
      error: "인증기 보안 설정을 처리하지 못했습니다. 잠시 후 다시 시도해주세요."
    },
    { status: 500 }
  );
}

export function invalidTotpRequest(error: string) {
  return NextResponse.json(
    { ok: false, code: "TOTP_INVALID_REQUEST", error },
    { status: 400 }
  );
}

export function resolveNetworkKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unverified-network";
}

export function sixDigitCode(value: unknown) {
  const code = typeof value === "string" ? value.trim() : "";
  return /^[0-9]{6}$/u.test(code) ? code : null;
}

export function boundedIdentifier(value: unknown) {
  const identifier = typeof value === "string" ? value.trim() : "";
  return identifier && identifier.length <= 180 ? identifier : null;
}
