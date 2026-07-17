import { randomUUID } from "node:crypto";
import {
  getTotpSecurityRepository,
  type AuthSecurityAuditEvent,
  type TotpSecurityRepository
} from "./totp.repository";

export type AuthSecurityAuditAction =
  | "totp_enrollment_started"
  | "totp_enrollment_failed"
  | "totp_enabled"
  | "totp_login_verified"
  | "totp_login_failed"
  | "recovery_code_used"
  | "recovery_codes_regenerated"
  | "totp_disabled"
  | "auth_security_rate_limited";

const ALLOWED_METADATA_KEYS: Record<AuthSecurityAuditAction, ReadonlySet<string>> = {
  totp_enrollment_started: new Set(["expiresAt"]),
  totp_enrollment_failed: new Set(["reason"]),
  totp_enabled: new Set(),
  totp_login_verified: new Set(["method"]),
  totp_login_failed: new Set(["method", "reason", "operation"]),
  recovery_code_used: new Set(["method"]),
  recovery_codes_regenerated: new Set(),
  totp_disabled: new Set(),
  auth_security_rate_limited: new Set(["rateAction", "blockedUntil"])
};

const ALLOWED_REASONS = new Set([
  "not_found",
  "expired",
  "locked",
  "invalid",
  "replayed",
  "clock_drift",
  "not_enabled"
]);
const ALLOWED_METHODS = new Set(["totp", "recovery"]);
const ALLOWED_OPERATIONS = new Set(["login", "recovery_regeneration", "disable"]);
const ALLOWED_RATE_ACTIONS = new Set([
  "enrollment",
  "enrollment_verification",
  "recovery_regeneration",
  "disable",
  "login_verification"
]);

export function createAuthSecurityAuditEvent(input: {
  accountId: string;
  actorAccountId?: string;
  action: AuthSecurityAuditAction;
  safeMetadata?: Record<string, unknown>;
  now?: string;
}): AuthSecurityAuditEvent {
  const accountId = input.accountId.trim();
  const actorAccountId = (input.actorAccountId || accountId).trim();
  if (!accountId || !actorAccountId) {
    throw new Error("Audit account identifiers are required.");
  }
  return {
    id: randomUUID(),
    accountId,
    actorAccountId,
    action: input.action,
    safeMetadata: sanitizeMetadata(input.action, input.safeMetadata || {}),
    createdAt: input.now || new Date().toISOString()
  };
}

export async function appendAuthSecurityAuditEvent(
  input: {
    accountId: string;
    actorAccountId?: string;
    action: AuthSecurityAuditAction;
    safeMetadata?: Record<string, unknown>;
    now?: string;
  },
  repository: TotpSecurityRepository = getTotpSecurityRepository()
): Promise<AuthSecurityAuditEvent> {
  const event = createAuthSecurityAuditEvent(input);
  await repository.appendAuditEvent(event);
  return event;
}

export async function listAuthSecurityAuditEvents(
  accountId: string,
  repository: TotpSecurityRepository = getTotpSecurityRepository()
) {
  return repository.listAuditEvents(accountId);
}

function sanitizeMetadata(
  action: AuthSecurityAuditAction,
  metadata: Record<string, unknown>
) {
  const serialized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (!ALLOWED_METADATA_KEYS[action].has(key) || typeof value !== "string") {
      throw new Error("Authentication audit metadata contains an unsupported field.");
    }
    if (key === "reason" && !ALLOWED_REASONS.has(value)) throw invalidMetadataValue();
    if (key === "method" && !ALLOWED_METHODS.has(value)) throw invalidMetadataValue();
    if (key === "operation" && !ALLOWED_OPERATIONS.has(value)) throw invalidMetadataValue();
    if (key === "rateAction" && !ALLOWED_RATE_ACTIONS.has(value)) throw invalidMetadataValue();
    if ((key === "expiresAt" || key === "blockedUntil") && !isCanonicalTimestamp(value)) {
      throw invalidMetadataValue();
    }
    serialized[key] = value;
  }
  if (JSON.stringify(serialized).length > 2_000) {
    throw new Error("Authentication audit metadata is too large.");
  }
  return serialized;
}

function invalidMetadataValue() {
  return new Error("Authentication audit metadata contains an unsupported value.");
}

function isCanonicalTimestamp(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}
