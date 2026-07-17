import { randomBytes } from "node:crypto";
import { keyedDigest, safeDigestEqual } from "../security/keyed-digest";

export const MFA_CHALLENGE_COOKIE_NAME = "dreamwish-mfa-challenge" as const;
export const MFA_CHALLENGE_TTL_SECONDS = 300;

const TOKEN_PURPOSE = "mfa_login" as const;
const TOKEN_VERSION = 1 as const;
const SIGNATURE_PURPOSE = "mfa-challenge-token-signature-v1";
const MAX_TOKEN_LENGTH = 2_048;
const TOKEN_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u;

export type MintedMfaChallenge = {
  token: string;
  challengeHash: string;
  expiresAt: string;
};

export type MfaChallengeTokenVerification =
  | { ok: true; accountId: string; challengeHash: string; expiresAt: string }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "expired"; accountId: string };

type ChallengeTokenPayload = {
  v: typeof TOKEN_VERSION;
  purpose: typeof TOKEN_PURPOSE;
  accountId: string;
  nonce: string;
  iat: number;
  exp: number;
};

export function mintMfaChallengeToken(input: {
  accountId: string;
  now?: number;
}): MintedMfaChallenge {
  const accountId = requireAccountId(input.accountId);
  const nowMs = resolveNow(input.now);
  const secret = challengeSecret();
  const nonce = randomBytes(32).toString("base64url");
  const payload: ChallengeTokenPayload = {
    v: TOKEN_VERSION,
    purpose: TOKEN_PURPOSE,
    accountId,
    nonce,
    iat: nowMs,
    exp: nowMs + MFA_CHALLENGE_TTL_SECONDS * 1_000
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = keyedDigest(encodedPayload, secret, SIGNATURE_PURPOSE);
  return {
    token: `${encodedPayload}.${signature}`,
    challengeHash: challengeHashFor(nonce, accountId, secret),
    expiresAt: new Date(payload.exp).toISOString()
  };
}

export function verifyMfaChallengeToken(input: {
  token: string;
  now?: number;
}): MfaChallengeTokenVerification {
  const nowMs = resolveNow(input.now);
  const token = typeof input.token === "string" ? input.token : "";
  if (!token || token.length > MAX_TOKEN_LENGTH || !TOKEN_SHAPE.test(token)) {
    return { ok: false, reason: "invalid" };
  }

  const secret = challengeSecret();
  const [encodedPayload, signature] = token.split(".");
  const expectedSignature = keyedDigest(encodedPayload, secret, SIGNATURE_PURPOSE);
  if (!safeDigestEqual(signature, expectedSignature)) {
    return { ok: false, reason: "invalid" };
  }

  const payload = parsePayload(encodedPayload);
  if (!payload) return { ok: false, reason: "invalid" };
  if (nowMs >= payload.exp) {
    return { ok: false, reason: "expired", accountId: payload.accountId };
  }
  return {
    ok: true,
    accountId: payload.accountId,
    challengeHash: challengeHashFor(payload.nonce, payload.accountId, secret),
    expiresAt: new Date(payload.exp).toISOString()
  };
}

function challengeHashFor(nonce: string, accountId: string, secret: string) {
  return keyedDigest(nonce, secret, `mfa-login-challenge:${accountId}`);
}

function parsePayload(encodedPayload: string): ChallengeTokenPayload | null {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const payload = parsed as Record<string, unknown>;
    if (
      payload.v !== TOKEN_VERSION ||
      payload.purpose !== TOKEN_PURPOSE ||
      typeof payload.accountId !== "string" ||
      !payload.accountId.trim() ||
      payload.accountId.length > 180 ||
      typeof payload.nonce !== "string" ||
      !payload.nonce ||
      !Number.isFinite(payload.iat) ||
      !Number.isFinite(payload.exp) ||
      (payload.exp as number) <= (payload.iat as number)
    ) {
      return null;
    }
    return {
      v: TOKEN_VERSION,
      purpose: TOKEN_PURPOSE,
      accountId: payload.accountId,
      nonce: payload.nonce,
      iat: payload.iat as number,
      exp: payload.exp as number
    };
  } catch {
    return null;
  }
}

function challengeSecret() {
  const value = process.env.AUTH_MFA_CHALLENGE_SECRET?.trim();
  if (!value) {
    throw new Error("AUTH_MFA_CHALLENGE_SECRET is not configured.");
  }
  return value;
}

function requireAccountId(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 180) {
    throw new Error("accountId must be a non-empty string up to 180 characters.");
  }
  return normalized;
}

function resolveNow(now: number | undefined) {
  const resolved = now ?? Date.now();
  if (!Number.isFinite(resolved) || resolved < 0) {
    throw new Error("MFA challenge time must be a non-negative finite value.");
  }
  return resolved;
}
