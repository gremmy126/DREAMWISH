import { NextResponse } from "next/server";
import { getOperationalAccount } from "@/src/lib/admin/account-admin.repository";
import { appendAuthSecurityAuditEvent } from "@/src/lib/auth/auth-security-audit";
import {
  MFA_CHALLENGE_COOKIE_NAME,
  verifyMfaChallengeToken
} from "@/src/lib/auth/mfa-challenge-token";
import {
  authCookieAttributes,
  clearedAuthCookieAttributes,
  issueFullSession,
  readCookieValue
} from "@/src/lib/auth/session-issuance.service";
import {
  isTotpSecurityError,
  verifyAndConsumeMfaLoginChallenge,
  type TotpSecurityErrorCode
} from "@/src/lib/auth/totp.service";

const GENERIC_ERROR_MESSAGE =
  "인증 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.";

const CHALLENGE_FAILURES = {
  missing: {
    status: 401,
    message: "로그인 인증 요청이 없습니다. 다시 로그인해 주세요."
  },
  invalid: {
    status: 401,
    message: "로그인 인증 요청이 유효하지 않습니다. 다시 로그인해 주세요."
  },
  not_found: {
    status: 401,
    message: "로그인 인증 요청을 찾을 수 없습니다. 다시 로그인해 주세요."
  },
  expired: {
    status: 410,
    message: "로그인 인증 요청이 만료되었습니다. 다시 로그인해 주세요."
  },
  already_used: {
    status: 409,
    message: "이미 사용된 로그인 인증 요청입니다. 다시 로그인해 주세요."
  },
  account_unavailable: {
    status: 401,
    message: "이 계정으로는 로그인을 완료할 수 없습니다."
  }
} as const;

const CODE_ERROR_MESSAGES: Partial<Record<TotpSecurityErrorCode, string>> = {
  TOTP_INVALID_CODE: "인증 코드가 올바르지 않습니다. 다시 확인해 주세요.",
  TOTP_CODE_REPLAYED: "이미 사용된 인증 코드입니다. 다음 코드를 기다렸다가 입력해 주세요.",
  TOTP_CLOCK_DRIFT: "인증 앱의 시간이 맞지 않습니다. 기기 시간을 동기화한 뒤 다시 시도해 주세요.",
  TOTP_RATE_LIMITED: "인증 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  TOTP_NOT_ENABLED: "이 계정에는 인증기가 활성화되어 있지 않습니다. 다시 로그인해 주세요.",
  RECOVERY_CODE_INVALID: "복구 코드가 올바르지 않거나 이미 사용되었습니다."
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      code?: unknown;
      method?: unknown;
    };
    const method =
      body.method === "totp" || body.method === "recovery" ? body.method : null;
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!method || !code || code.length > 64) {
      return NextResponse.json(
        { ok: false, error: "인증 방식과 인증 코드를 확인해 주세요." },
        { status: 400 }
      );
    }

    const token = readCookieValue(
      request.headers.get("cookie"),
      MFA_CHALLENGE_COOKIE_NAME
    );
    if (!token) return challengeFailure("missing", { clearCookie: false });

    const verification = verifyMfaChallengeToken({ token });
    if (!verification.ok) {
      if (verification.reason === "expired") {
        await auditChallengeRejection(verification.accountId, "expired");
        return challengeFailure("expired");
      }
      return challengeFailure("invalid");
    }

    const { accountId, challengeHash } = verification;
    const account = await getOperationalAccount(accountId);
    if (!account || account.status !== "active") {
      await auditChallengeRejection(accountId, "account_unavailable");
      return challengeFailure("account_unavailable");
    }

    const verified = await verifyAndConsumeMfaLoginChallenge({
      accountId,
      challengeHash,
      method,
      code,
      networkKey: resolveNetworkKey(request)
    });
    if (!verified.verified) return challengeFailure(verified.challengeState);

    const issued = await issueFullSession({
      account: {
        id: account.id,
        email: account.email,
        name: account.name,
        role: account.role,
        sessionVersion: account.sessionVersion
      }
    });
    const response = NextResponse.json({ ok: true, access: issued.access });
    response.cookies.set(authCookieAttributes(issued.sessionCookie));
    response.cookies.set(clearedAuthCookieAttributes(MFA_CHALLENGE_COOKIE_NAME));
    return response;
  } catch (error) {
    if (isTotpSecurityError(error)) {
      return NextResponse.json(
        { ok: false, error: CODE_ERROR_MESSAGES[error.code] || GENERIC_ERROR_MESSAGE },
        { status: error.status }
      );
    }
    return NextResponse.json(
      { ok: false, error: GENERIC_ERROR_MESSAGE },
      { status: 500 }
    );
  }
}

function challengeFailure(
  kind: keyof typeof CHALLENGE_FAILURES,
  options: { clearCookie?: boolean } = {}
) {
  const failure = CHALLENGE_FAILURES[kind];
  const response = NextResponse.json(
    { ok: false, error: failure.message },
    { status: failure.status }
  );
  if (options.clearCookie !== false) {
    response.cookies.set(clearedAuthCookieAttributes(MFA_CHALLENGE_COOKIE_NAME));
  }
  return response;
}

async function auditChallengeRejection(
  accountId: string,
  reason: "expired" | "already_used" | "not_found" | "account_unavailable"
) {
  await appendAuthSecurityAuditEvent({
    accountId,
    action: "mfa_challenge_rejected",
    safeMetadata: { reason }
  });
}

function resolveNetworkKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unverified-network";
}
