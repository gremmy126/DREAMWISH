import { randomUUID } from "node:crypto";
import { isAdminEmail, type AccountRole } from "./access-control";
import { getBillingEntitlement } from "../billing/billing.repository";
import {
  buildOperationalAccessState,
  hasEffectiveEntitlement
} from "../billing/effective-entitlement";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS
} from "./session-token";
import {
  MFA_CHALLENGE_COOKIE_NAME,
  MFA_CHALLENGE_TTL_SECONDS,
  mintMfaChallengeToken
} from "./mfa-challenge-token";
import { getTotpFactorStatus } from "./totp.service";
import { getTotpSecurityRepository } from "./totp.repository";
import { createAuthSecurityAuditEvent } from "./auth-security-audit";

export type AuthenticatedAccountProfile = {
  id: string;
  email: string;
  name: string | null;
  role: AccountRole;
  sessionVersion: number;
};

export type IssuedAuthCookie = {
  name: string;
  value: string;
  maxAge: number;
};

export type OperationalAccessState = ReturnType<typeof buildOperationalAccessState>;

export type PrimaryAuthenticationResult =
  | { status: "session"; access: OperationalAccessState; sessionCookie: IssuedAuthCookie }
  | { status: "mfa_required"; challengeCookie: IssuedAuthCookie };

/**
 * Single choke point for every primary authentication path (password login,
 * Firebase session refresh, Kakao, and Naver OAuth). When the account has an
 * active authenticator factor it never issues the full session: it persists a
 * keyed digest of a fresh challenge nonce and returns only the short-lived
 * MFA challenge cookie. The full session is issued exclusively here or by
 * `issueFullSession` after `/api/auth/mfa/verify` consumed the challenge.
 */
export async function completePrimaryAuthentication(input: {
  account: AuthenticatedAccountProfile;
  now?: number;
}): Promise<PrimaryAuthenticationResult> {
  const account = input.account;
  const factor = await getTotpFactorStatus(account.id);
  if (factor.enabled) {
    const nowMs = input.now ?? Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const minted = mintMfaChallengeToken({ accountId: account.id, now: nowMs });
    await getTotpSecurityRepository().createLoginChallenge({
      challengeId: randomUUID(),
      accountId: account.id,
      challengeHash: minted.challengeHash,
      expiresAt: minted.expiresAt,
      now: nowIso,
      auditEvent: createAuthSecurityAuditEvent({
        accountId: account.id,
        action: "mfa_challenge_issued",
        safeMetadata: { expiresAt: minted.expiresAt },
        now: nowIso
      })
    });
    return {
      status: "mfa_required",
      challengeCookie: {
        name: MFA_CHALLENGE_COOKIE_NAME,
        value: minted.token,
        maxAge: MFA_CHALLENGE_TTL_SECONDS
      }
    };
  }

  const issued = await issueFullSession({ account });
  return { status: "session", access: issued.access, sessionCookie: issued.sessionCookie };
}

export async function issueFullSession(input: {
  account: AuthenticatedAccountProfile;
}): Promise<{ access: OperationalAccessState; sessionCookie: IssuedAuthCookie }> {
  const { account } = input;
  const entitlement = isAdminEmail(account.email)
    ? null
    : await getBillingEntitlement(account.id);
  const entitled = await hasEffectiveEntitlement({
    userId: account.id,
    role: account.role,
    billingActive: entitlement?.status === "active"
  });
  const access = buildOperationalAccessState({
    email: account.email,
    role: account.role,
    entitled
  });
  const sessionToken = await createSessionToken({
    uid: account.id,
    email: account.email,
    name: account.name,
    role: account.role,
    paid: access.paid,
    entitled: access.canUseApp,
    sessionVersion: account.sessionVersion
  });
  return {
    access,
    sessionCookie: {
      name: SESSION_COOKIE_NAME,
      value: sessionToken,
      maxAge: SESSION_MAX_AGE_SECONDS
    }
  };
}

export function authCookieAttributes(cookie: IssuedAuthCookie) {
  return {
    name: cookie.name,
    value: cookie.value,
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: cookie.maxAge,
    secure: process.env.NODE_ENV === "production"
  };
}

export function clearedAuthCookieAttributes(name: string) {
  return authCookieAttributes({ name, value: "", maxAge: 0 });
}

export function readCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const cookie of cookieHeader.split(";")) {
    const separatorIndex = cookie.indexOf("=");
    if (separatorIndex < 0) continue;
    if (cookie.slice(0, separatorIndex).trim() !== name) continue;
    const value = cookie.slice(separatorIndex + 1).trim();
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}
