import { randomUUID } from "node:crypto";
import { openField, sealField, type AesGcmField } from "../security/aes-gcm-field";
import { keyedDigest } from "../security/keyed-digest";
import {
  generateRecoveryCodes,
  hashRecoveryCode
} from "./recovery-code";
import {
  createTotpUri,
  generateTotpSecret,
  verifyTotpCode
} from "./totp";
import {
  getTotpSecurityRepository,
  type ActiveTotpResult,
  type AuthSecurityRateLimitAction,
  type EnrollmentConfirmationResult,
  type LoginChallengeVerificationResult,
  type StoredRecoveryCodeInput,
  type TotpSecurityRepository
} from "./totp.repository";
import {
  appendAuthSecurityAuditEvent,
  createAuthSecurityAuditEvent,
  type AuthSecurityAuditAction
} from "./auth-security-audit";

export type TotpSecurityErrorCode =
  | "TOTP_ALREADY_ENABLED"
  | "TOTP_ENROLLMENT_NOT_FOUND"
  | "TOTP_ENROLLMENT_EXPIRED"
  | "TOTP_ENROLLMENT_LOCKED"
  | "TOTP_INVALID_CODE"
  | "TOTP_CODE_REPLAYED"
  | "TOTP_CLOCK_DRIFT"
  | "TOTP_NOT_ENABLED"
  | "TOTP_RATE_LIMITED"
  | "RECOVERY_CODE_INVALID"
  | "AUTH_SECURITY_KEY_NOT_CONFIGURED";

export class TotpSecurityError extends Error {
  constructor(
    public readonly code: TotpSecurityErrorCode,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "TotpSecurityError";
  }
}

export function isTotpSecurityError(error: unknown): error is TotpSecurityError {
  return error instanceof TotpSecurityError;
}

export async function beginTotpEnrollment(input: {
  account: { id: string; email: string };
  networkKey: string;
  now?: number;
}) {
  const accountId = requireIdentifier(input.account.id, "accountId");
  const email = input.account.email.trim();
  if (!email || !email.includes("@")) throw new Error("A valid account email is required.");
  const nowMs = resolveNow(input.now);
  const now = new Date(nowMs).toISOString();
  const repository = getTotpSecurityRepository();
  await enforceRateLimit(repository, {
    accountId,
    networkKey: input.networkKey,
    action: "enrollment",
    now
  });

  const manualKey = generateTotpSecret();
  const enrollmentId = randomUUID();
  const expiresAt = new Date(nowMs + ENROLLMENT_TTL_MS).toISOString();
  const result = await repository.createPendingEnrollment({
    factorId: randomUUID(),
    challengeId: randomUUID(),
    accountId,
    secretEncrypted: sealField({
      plaintext: manualKey,
      keyMaterial: encryptionKey(),
      purpose: encryptionPurpose(accountId)
    }),
    challengeHash: enrollmentChallengeHash(enrollmentId),
    expiresAt,
    now,
    auditEvent: securityAuditEvent({
      accountId,
      action: "totp_enrollment_started",
      safeMetadata: { expiresAt },
      now
    })
  });
  if (result === "already_enabled") {
    throw new TotpSecurityError(
      "TOTP_ALREADY_ENABLED",
      "An authenticator is already enabled for this account.",
      409
    );
  }
  return {
    enrollmentId,
    otpauthUri: createTotpUri({ secret: manualKey, email }),
    manualKey,
    expiresAt
  };
}

export async function confirmTotpEnrollment(input: {
  accountId: string;
  enrollmentId: string;
  code: string;
  networkKey: string;
  now?: number;
}) {
  const accountId = requireIdentifier(input.accountId, "accountId");
  const enrollmentId = requireIdentifier(input.enrollmentId, "enrollmentId");
  const nowMs = resolveNow(input.now);
  const now = new Date(nowMs).toISOString();
  const repository = getTotpSecurityRepository();
  await enforceRateLimit(repository, {
    accountId,
    networkKey: input.networkKey,
    action: "enrollment_verification",
    now
  });
  const recovery = createHashedRecoveryCodes();
  const result = await repository.confirmEnrollment({
    accountId,
    challengeHash: enrollmentChallengeHash(enrollmentId),
    now,
    recoveryCodes: recovery.hashed,
    auditEventForResult: (confirmationResult) =>
      securityAuditEvent(
        confirmationResult.outcome === "accepted"
          ? { accountId, action: "totp_enabled", now }
          : {
              accountId,
              action: "totp_enrollment_failed",
              safeMetadata: { reason: enrollmentFailureReason(confirmationResult) },
              now
            }
      ),
    verify: ({ secretEncrypted, lastAcceptedCounter }) =>
      verifySealedTotp({
        accountId,
        secretEncrypted,
        code: input.code,
        nowMs,
        lastAcceptedCounter
      })
  });

  if (result.outcome !== "accepted") {
    throw enrollmentError(result);
  }
  return { status: "active" as const, recoveryCodes: recovery.plaintext };
}

export async function getTotpFactorStatus(accountId: string) {
  return getTotpSecurityRepository().getFactorStatus(
    requireIdentifier(accountId, "accountId")
  );
}

export async function verifyTotpLogin(input: {
  accountId: string;
  method: "totp" | "recovery";
  code: string;
  networkKey: string;
  now?: number;
}) {
  const accountId = requireIdentifier(input.accountId, "accountId");
  const nowMs = resolveNow(input.now);
  const now = new Date(nowMs).toISOString();
  const repository = getTotpSecurityRepository();
  await enforceRateLimit(repository, {
    accountId,
    networkKey: input.networkKey,
    action: "login_verification",
    now
  });

  if (input.method === "recovery") {
    const status = await repository.getFactorStatus(accountId);
    if (!status.enabled) throw notEnabledError();
    let codeHash: string;
    try {
      codeHash = hashRecoveryCode({ code: input.code, keyMaterial: digestKey() });
    } catch {
      await failedVerificationAudit(repository, accountId, "recovery", "invalid", now);
      throw recoveryInvalidError();
    }
    const result = await repository.consumeRecoveryCode({
      accountId,
      codeHash,
      now,
      auditEventForResult: (consumptionResult) =>
        securityAuditEvent(
          consumptionResult === "consumed"
            ? {
                accountId,
                action: "recovery_code_used",
                safeMetadata: { method: "recovery" },
                now
              }
            : {
                accountId,
                action: "totp_login_failed",
                safeMetadata: {
                  method: "recovery",
                  reason: consumptionResult === "not_enabled" ? "not_enabled" : "invalid",
                  operation: "login"
                },
                now
              }
        )
    });
    if (result === "not_enabled") throw notEnabledError();
    if (result === "invalid") {
      throw recoveryInvalidError();
    }
    return { verified: true as const, method: "recovery" as const };
  }

  const result = await repository.mutateWithActiveTotp({
    accountId,
    now,
    mutation: "verify",
    auditEventForResult: (verificationResult) =>
      securityAuditEvent(
        verificationResult.outcome === "accepted"
          ? {
              accountId,
              action: "totp_login_verified",
              safeMetadata: { method: "totp" },
              now
            }
          : {
              accountId,
              action: "totp_login_failed",
              safeMetadata: {
                method: "totp",
                reason: activeFailureReason(verificationResult),
                operation: "login"
              },
              now
            }
      ),
    verify: ({ secretEncrypted, lastAcceptedCounter }) =>
      verifySealedTotp({
        accountId,
        secretEncrypted,
        code: input.code,
        nowMs,
        lastAcceptedCounter
      })
  });
  if (result.outcome !== "accepted") {
    throw activeTotpError(result);
  }
  return { verified: true as const, method: "totp" as const };
}

export async function verifyAndConsumeMfaLoginChallenge(input: {
  accountId: string;
  challengeHash: string;
  method: "totp" | "recovery";
  code: string;
  networkKey: string;
  now?: number;
}) {
  const accountId = requireIdentifier(input.accountId, "accountId");
  const challengeHash = requireIdentifier(input.challengeHash, "challengeHash");
  const nowMs = resolveNow(input.now);
  const now = new Date(nowMs).toISOString();
  const repository = getTotpSecurityRepository();
  await enforceRateLimit(repository, {
    accountId,
    networkKey: input.networkKey,
    action: "login_verification",
    now
  });

  let recoveryCodeHash: string | undefined;
  if (input.method === "recovery") {
    try {
      recoveryCodeHash = hashRecoveryCode({ code: input.code, keyMaterial: digestKey() });
    } catch {
      await failedVerificationAudit(repository, accountId, "recovery", "invalid", now);
      throw recoveryInvalidError();
    }
  }

  const result = await repository.verifyAndConsumeLoginChallenge({
    accountId,
    challengeHash,
    method: input.method,
    recoveryCodeHash,
    now,
    auditEventsForResult: (verificationResult) =>
      loginChallengeAuditEvents({
        accountId,
        method: input.method,
        result: verificationResult,
        now
      }),
    verifyTotp: ({ secretEncrypted, lastAcceptedCounter }) =>
      verifySealedTotp({
        accountId,
        secretEncrypted,
        code: input.code,
        nowMs,
        lastAcceptedCounter
      })
  });

  if (result.outcome === "accepted") {
    return { verified: true as const, method: result.method };
  }
  if (
    result.outcome === "expired" ||
    result.outcome === "already_used" ||
    result.outcome === "not_found"
  ) {
    return { verified: false as const, challengeState: result.outcome };
  }
  if (result.outcome === "not_enabled") throw notEnabledError();
  if (result.outcome === "recovery_invalid") throw recoveryInvalidError();
  if (result.outcome !== "rejected") {
    throw new Error("Unsupported MFA login challenge result.");
  }
  throw verificationError(result.reason);
}

export async function regenerateRecoveryCodes(input: {
  accountId: string;
  currentTotpCode: string;
  networkKey: string;
  actorAccountId?: string;
  now?: number;
}) {
  const accountId = requireIdentifier(input.accountId, "accountId");
  const actorAccountId = input.actorAccountId
    ? requireIdentifier(input.actorAccountId, "actorAccountId")
    : accountId;
  const nowMs = resolveNow(input.now);
  const now = new Date(nowMs).toISOString();
  const repository = getTotpSecurityRepository();
  await enforceRateLimit(repository, {
    accountId,
    networkKey: input.networkKey,
    action: "recovery_regeneration",
    now,
    actorAccountId
  });
  const recovery = createHashedRecoveryCodes();
  const result = await repository.mutateWithActiveTotp({
    accountId,
    now,
    mutation: "regenerate_recovery",
    replacementRecoveryCodes: recovery.hashed,
    auditEventForResult: (verificationResult) =>
      securityAuditEvent(
        verificationResult.outcome === "accepted"
          ? {
              accountId,
              actorAccountId,
              action: "recovery_codes_regenerated",
              now
            }
          : {
              accountId,
              actorAccountId,
              action: "totp_login_failed",
              safeMetadata: {
                method: "totp",
                reason: activeFailureReason(verificationResult),
                operation: "recovery_regeneration"
              },
              now
            }
      ),
    verify: ({ secretEncrypted, lastAcceptedCounter }) =>
      verifySealedTotp({
        accountId,
        secretEncrypted,
        code: input.currentTotpCode,
        nowMs,
        lastAcceptedCounter
      })
  });
  if (result.outcome !== "accepted") {
    throw activeTotpError(result);
  }
  return { recoveryCodes: recovery.plaintext };
}

export async function disableTotp(input: {
  accountId: string;
  currentTotpCode: string;
  networkKey: string;
  actorAccountId?: string;
  now?: number;
}) {
  const accountId = requireIdentifier(input.accountId, "accountId");
  const actorAccountId = input.actorAccountId
    ? requireIdentifier(input.actorAccountId, "actorAccountId")
    : accountId;
  const nowMs = resolveNow(input.now);
  const now = new Date(nowMs).toISOString();
  const repository = getTotpSecurityRepository();
  await enforceRateLimit(repository, {
    accountId,
    networkKey: input.networkKey,
    action: "disable",
    now,
    actorAccountId
  });
  const result = await repository.mutateWithActiveTotp({
    accountId,
    now,
    mutation: "disable",
    auditEventForResult: (verificationResult) =>
      securityAuditEvent(
        verificationResult.outcome === "accepted"
          ? { accountId, actorAccountId, action: "totp_disabled", now }
          : {
              accountId,
              actorAccountId,
              action: "totp_login_failed",
              safeMetadata: {
                method: "totp",
                reason: activeFailureReason(verificationResult),
                operation: "disable"
              },
              now
            }
      ),
    verify: ({ secretEncrypted, lastAcceptedCounter }) =>
      verifySealedTotp({
        accountId,
        secretEncrypted,
        code: input.currentTotpCode,
        nowMs,
        lastAcceptedCounter
      })
  });
  if (result.outcome !== "accepted") {
    throw activeTotpError(result);
  }
  return { status: "disabled" as const };
}

const ENROLLMENT_TTL_MS = 10 * 60_000;
const RATE_LIMIT_WINDOW_MS = 10 * 60_000;
const RATE_LIMIT_ATTEMPTS = 5;

function verifySealedTotp(input: {
  accountId: string;
  secretEncrypted: AesGcmField;
  code: string;
  nowMs: number;
  lastAcceptedCounter: number | null;
}) {
  const secret = openField({
    field: input.secretEncrypted,
    keyMaterial: encryptionKey(),
    purpose: encryptionPurpose(input.accountId)
  });
  return verifyTotpCode({
    secret,
    code: input.code,
    nowMs: input.nowMs,
    lastAcceptedCounter: input.lastAcceptedCounter
  });
}

function createHashedRecoveryCodes() {
  const plaintext = generateRecoveryCodes();
  const keyMaterial = digestKey();
  return {
    plaintext,
    hashed: plaintext.map(
      (code): StoredRecoveryCodeInput => ({
        id: randomUUID(),
        codeHash: hashRecoveryCode({ code, keyMaterial })
      })
    )
  };
}

async function enforceRateLimit(
  repository: TotpSecurityRepository,
  input: {
    accountId: string;
    actorAccountId?: string;
    networkKey: string;
    action: AuthSecurityRateLimitAction;
    now: string;
  }
) {
  const networkKey = requireIdentifier(input.networkKey, "networkKey");
  const result = await repository.takeRateLimit({
    accountId: input.accountId,
    scopeKeys: [
      keyedDigest(input.accountId, digestKey(), "auth-security-account-rate-limit-scope"),
      keyedDigest(networkKey, digestKey(), "auth-security-network-rate-limit-scope")
    ],
    action: input.action,
    now: input.now,
    limit: RATE_LIMIT_ATTEMPTS,
    windowMs: RATE_LIMIT_WINDOW_MS
  });
  if (!result.allowed) {
    await audit(repository, {
      accountId: input.accountId,
      actorAccountId: input.actorAccountId,
      action: "auth_security_rate_limited",
      safeMetadata: { rateAction: input.action, blockedUntil: result.blockedUntil },
      now: input.now
    });
    throw new TotpSecurityError(
      "TOTP_RATE_LIMITED",
      "Too many authentication security attempts. Try again later.",
      429
    );
  }
}

async function audit(
  repository: TotpSecurityRepository,
  input: {
    accountId: string;
    actorAccountId?: string;
    action: AuthSecurityAuditAction;
    safeMetadata?: Record<string, unknown>;
    now: string;
  }
) {
  await appendAuthSecurityAuditEvent(input, repository);
}

function securityAuditEvent(input: {
  accountId: string;
  actorAccountId?: string;
  action: AuthSecurityAuditAction;
  safeMetadata?: Record<string, unknown>;
  now: string;
}) {
  return createAuthSecurityAuditEvent(input);
}

function loginChallengeAuditEvents(input: {
  accountId: string;
  method: "totp" | "recovery";
  result: LoginChallengeVerificationResult;
  now: string;
}) {
  const { accountId, method, result, now } = input;
  if (result.outcome === "accepted") {
    return [
      securityAuditEvent({
        accountId,
        action: result.method === "recovery" ? "recovery_code_used" : "totp_login_verified",
        safeMetadata: { method: result.method },
        now
      }),
      securityAuditEvent({
        accountId,
        action: "mfa_login_completed",
        safeMetadata: { method: result.method },
        now
      })
    ];
  }
  if (
    result.outcome === "expired" ||
    result.outcome === "already_used" ||
    result.outcome === "not_found"
  ) {
    return [
      securityAuditEvent({
        accountId,
        action: "mfa_challenge_rejected",
        safeMetadata: { reason: result.outcome },
        now
      })
    ];
  }
  let reason: "not_enabled" | "invalid" | "replayed" | "clock_drift";
  if (result.outcome === "not_enabled") reason = "not_enabled";
  else if (result.outcome === "recovery_invalid") reason = "invalid";
  else if (result.outcome === "rejected") reason = result.reason;
  else throw new Error("Unsupported MFA login challenge audit result.");
  return [
    securityAuditEvent({
      accountId,
      action: "totp_login_failed",
      safeMetadata: {
        method,
        reason,
        operation: "login"
      },
      now
    })
  ];
}

async function failedVerificationAudit(
  repository: TotpSecurityRepository,
  accountId: string,
  method: "totp" | "recovery",
  reason: string,
  now: string,
  actorAccountId?: string,
  operation = "login"
) {
  await audit(repository, {
    accountId,
    actorAccountId,
    action: "totp_login_failed",
    safeMetadata: { method, reason, operation },
    now
  });
}

function enrollmentChallengeHash(enrollmentId: string) {
  return keyedDigest(enrollmentId, digestKey(), "totp-enrollment-challenge");
}

function encryptionPurpose(accountId: string) {
  return `totp-factor:${accountId}`;
}

function encryptionKey() {
  return configuredKey("AUTH_TOTP_ENCRYPTION_KEY");
}

function digestKey() {
  return configuredKey("AUTH_SECURITY_HASH_KEY");
}

function configuredKey(name: "AUTH_TOTP_ENCRYPTION_KEY" | "AUTH_SECURITY_HASH_KEY") {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new TotpSecurityError(
      "AUTH_SECURITY_KEY_NOT_CONFIGURED",
      "Authentication security key material is not configured.",
      500
    );
  }
  return value;
}

function enrollmentFailureReason(result: Exclude<EnrollmentConfirmationResult, { outcome: "accepted" }>) {
  return result.outcome === "rejected" ? result.reason : result.outcome;
}

function activeFailureReason(result: Exclude<ActiveTotpResult, { outcome: "accepted" }>) {
  return result.outcome === "rejected" ? result.reason : result.outcome;
}

function enrollmentError(
  result: Exclude<EnrollmentConfirmationResult, { outcome: "accepted" }>
): TotpSecurityError {
  if (result.outcome === "not_found") {
    return new TotpSecurityError(
      "TOTP_ENROLLMENT_NOT_FOUND",
      "The authenticator enrollment could not be found.",
      404
    );
  }
  if (result.outcome === "expired") {
    return new TotpSecurityError(
      "TOTP_ENROLLMENT_EXPIRED",
      "The authenticator enrollment has expired.",
      410
    );
  }
  if (result.outcome === "locked") {
    return new TotpSecurityError(
      "TOTP_ENROLLMENT_LOCKED",
      "The authenticator enrollment is locked after too many failed attempts.",
      429
    );
  }
  if (result.outcome === "rejected") return verificationError(result.reason);
  throw new Error("Unsupported TOTP enrollment result");
}

function activeTotpError(
  result: Exclude<ActiveTotpResult, { outcome: "accepted" }>
): TotpSecurityError {
  return result.outcome === "not_enabled" ? notEnabledError() : verificationError(result.reason);
}

function verificationError(reason: "invalid" | "replayed" | "clock_drift") {
  if (reason === "replayed") {
    return new TotpSecurityError(
      "TOTP_CODE_REPLAYED",
      "This authenticator code has already been used.",
      409
    );
  }
  if (reason === "clock_drift") {
    return new TotpSecurityError(
      "TOTP_CLOCK_DRIFT",
      "The authenticator clock is outside the accepted window.",
      400
    );
  }
  return new TotpSecurityError("TOTP_INVALID_CODE", "The authenticator code is invalid.", 401);
}

function notEnabledError() {
  return new TotpSecurityError(
    "TOTP_NOT_ENABLED",
    "An authenticator is not enabled for this account.",
    404
  );
}

function recoveryInvalidError() {
  return new TotpSecurityError(
    "RECOVERY_CODE_INVALID",
    "The recovery code is invalid or has already been used.",
    401
  );
}

function requireIdentifier(value: string, name: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length > 180) {
    throw new Error(`${name} must be a non-empty string up to 180 characters.`);
  }
  return normalized;
}

function resolveNow(now: number | undefined) {
  const resolved = now ?? Date.now();
  if (!Number.isFinite(resolved) || resolved < 0) {
    throw new Error("Authentication security time must be a non-negative finite value.");
  }
  return resolved;
}
