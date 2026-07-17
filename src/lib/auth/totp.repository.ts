import type { AesGcmField } from "../security/aes-gcm-field";
import { getPostgres, hasPostgresStorage } from "../db/postgres";
import {
  readJsonStore,
  withJsonStoreLock,
  writeJsonStore
} from "../local-db/json-store";
import { ensureAdminSchema } from "../admin/schema";
import type { TotpVerification } from "./totp.types";

export type TotpFactorState = "pending" | "active" | "disabled";
export type AuthSecurityRateLimitAction =
  | "enrollment"
  | "enrollment_verification"
  | "recovery_regeneration"
  | "disable"
  | "login_verification";

export type TotpFactorStatus = {
  status: TotpFactorState | null;
  enabled: boolean;
  createdAt: string | null;
  verifiedAt: string | null;
  disabledAt: string | null;
  updatedAt: string | null;
};

export type AuthSecurityAuditEvent = {
  id: string;
  accountId: string;
  actorAccountId: string;
  action: string;
  safeMetadata: Record<string, unknown>;
  createdAt: string;
};

type StoredFactor = {
  id: string;
  accountId: string;
  secretEncrypted: AesGcmField;
  status: TotpFactorState;
  lastAcceptedCounter: number | null;
  createdAt: string;
  verifiedAt: string | null;
  disabledAt: string | null;
  updatedAt: string;
};

type StoredChallenge = {
  id: string;
  accountId: string;
  purpose: "totp_enrollment" | "mfa_login";
  challengeHash: string;
  failureCount: number;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
};

type StoredRecoveryCode = {
  id: string;
  accountId: string;
  codeHash: string;
  usedAt: string | null;
  createdAt: string;
};

type StoredRateLimit = {
  scopeKey: string;
  action: AuthSecurityRateLimitAction;
  windowStartedAt: string;
  attemptCount: number;
  blockedUntil: string | null;
  updatedAt: string;
};

type OwnerSecurityDocument = {
  factor: StoredFactor | null;
  challenges: StoredChallenge[];
  recoveryCodes: StoredRecoveryCode[];
  auditEvents: AuthSecurityAuditEvent[];
};

type SecurityFallbackDb = {
  owners: Record<string, OwnerSecurityDocument>;
  rateLimits: StoredRateLimit[];
};

export type StoredRecoveryCodeInput = {
  id: string;
  codeHash: string;
};

export type EnrollmentConfirmationResult =
  | { outcome: "accepted"; counter: number }
  | { outcome: "not_found" | "expired" | "locked" }
  | { outcome: "rejected"; reason: Exclude<TotpVerification, { ok: true }>["reason"] };

export type ActiveTotpMutation = "verify" | "regenerate_recovery" | "disable";

export type ActiveTotpResult =
  | { outcome: "accepted"; counter: number }
  | { outcome: "not_enabled" }
  | { outcome: "rejected"; reason: Exclude<TotpVerification, { ok: true }>["reason"] };

export interface TotpSecurityRepository {
  createPendingEnrollment(input: {
    factorId: string;
    challengeId: string;
    accountId: string;
    secretEncrypted: AesGcmField;
    challengeHash: string;
    expiresAt: string;
    now: string;
    auditEvent: AuthSecurityAuditEvent;
  }): Promise<"created" | "already_enabled">;
  getFactorStatus(accountId: string): Promise<TotpFactorStatus>;
  confirmEnrollment(input: {
    accountId: string;
    challengeHash: string;
    now: string;
    recoveryCodes: StoredRecoveryCodeInput[];
    auditEventForResult: (result: EnrollmentConfirmationResult) => AuthSecurityAuditEvent;
    verify: (input: {
      secretEncrypted: AesGcmField;
      lastAcceptedCounter: number | null;
    }) => TotpVerification;
  }): Promise<EnrollmentConfirmationResult>;
  mutateWithActiveTotp(input: {
    accountId: string;
    now: string;
    mutation: ActiveTotpMutation;
    replacementRecoveryCodes?: StoredRecoveryCodeInput[];
    auditEventForResult: (result: ActiveTotpResult) => AuthSecurityAuditEvent;
    verify: (input: {
      secretEncrypted: AesGcmField;
      lastAcceptedCounter: number | null;
    }) => TotpVerification;
  }): Promise<ActiveTotpResult>;
  consumeRecoveryCode(input: {
    accountId: string;
    codeHash: string;
    now: string;
    auditEventForResult: (
      result: "consumed" | "invalid" | "not_enabled"
    ) => AuthSecurityAuditEvent;
  }): Promise<"consumed" | "invalid" | "not_enabled">;
  takeRateLimit(input: {
    accountId: string;
    scopeKeys: string[];
    action: AuthSecurityRateLimitAction;
    now: string;
    limit: number;
    windowMs: number;
  }): Promise<{ allowed: true } | { allowed: false; blockedUntil: string }>;
  appendAuditEvent(event: AuthSecurityAuditEvent): Promise<void>;
  listAuditEvents(accountId: string): Promise<AuthSecurityAuditEvent[]>;
}

const FILE_NAME = "auth-security.json";
const EMPTY_DB: SecurityFallbackDb = { owners: {}, rateLimits: [] };
const EMPTY_OWNER: OwnerSecurityDocument = {
  factor: null,
  challenges: [],
  recoveryCodes: [],
  auditEvents: []
};
const MAX_CHALLENGE_FAILURES = 5;

export function getTotpSecurityRepository(): TotpSecurityRepository {
  return hasPostgresStorage()
    ? new PostgresTotpSecurityRepository()
    : new JsonTotpSecurityRepository();
}

export class JsonTotpSecurityRepository implements TotpSecurityRepository {
  async createPendingEnrollment(
    input: Parameters<TotpSecurityRepository["createPendingEnrollment"]>[0]
  ) {
    return mutateLocalOwner(input.accountId, async (owner) => {
      if (owner.factor?.status === "active") return "already_enabled" as const;
      owner.challenges = owner.challenges.map((challenge) =>
        challenge.purpose === "totp_enrollment" && challenge.consumedAt === null
          ? { ...challenge, consumedAt: input.now }
          : challenge
      );
      owner.recoveryCodes = [];
      owner.factor = {
        id: input.factorId,
        accountId: input.accountId,
        secretEncrypted: structuredClone(input.secretEncrypted),
        status: "pending",
        lastAcceptedCounter: null,
        createdAt: input.now,
        verifiedAt: null,
        disabledAt: null,
        updatedAt: input.now
      };
      owner.challenges.push({
        id: input.challengeId,
        accountId: input.accountId,
        purpose: "totp_enrollment",
        challengeHash: input.challengeHash,
        failureCount: 0,
        expiresAt: input.expiresAt,
        consumedAt: null,
        createdAt: input.now
      });
      appendLocalAudit(owner, input.auditEvent, input.accountId);
      return "created" as const;
    });
  }

  async getFactorStatus(accountId: string) {
    const owner = await readLocalOwner(accountId);
    return toSafeStatus(owner.factor);
  }

  async confirmEnrollment(
    input: Parameters<TotpSecurityRepository["confirmEnrollment"]>[0]
  ) {
    return mutateLocalOwner(input.accountId, async (owner) => {
      const finish = (result: EnrollmentConfirmationResult) => {
        appendLocalAudit(owner, input.auditEventForResult(result), input.accountId);
        return result;
      };
      const challenge = owner.challenges.find(
        (item) =>
          item.accountId === input.accountId &&
          item.purpose === "totp_enrollment" &&
          item.challengeHash === input.challengeHash &&
          item.consumedAt === null
      );
      const factor = owner.factor;
      if (!challenge || !factor || factor.accountId !== input.accountId || factor.status !== "pending") {
        return finish({ outcome: "not_found" });
      }
      if (challenge.failureCount >= MAX_CHALLENGE_FAILURES) {
        return finish({ outcome: "locked" });
      }
      if (Date.parse(challenge.expiresAt) <= Date.parse(input.now)) {
        challenge.consumedAt = input.now;
        return finish({ outcome: "expired" });
      }

      const verification = input.verify({
        secretEncrypted: structuredClone(factor.secretEncrypted),
        lastAcceptedCounter: factor.lastAcceptedCounter
      });
      if (!verification.ok) {
        challenge.failureCount = Math.min(
          MAX_CHALLENGE_FAILURES,
          challenge.failureCount + 1
        );
        return finish(
          challenge.failureCount >= MAX_CHALLENGE_FAILURES
            ? { outcome: "locked" }
            : { outcome: "rejected", reason: verification.reason }
        );
      }

      challenge.consumedAt = input.now;
      factor.status = "active";
      factor.lastAcceptedCounter = verification.counter;
      factor.verifiedAt = input.now;
      factor.disabledAt = null;
      factor.updatedAt = input.now;
      owner.recoveryCodes = input.recoveryCodes.map((code) => ({
        ...code,
        accountId: input.accountId,
        usedAt: null,
        createdAt: input.now
      }));
      return finish({ outcome: "accepted", counter: verification.counter });
    });
  }

  async mutateWithActiveTotp(
    input: Parameters<TotpSecurityRepository["mutateWithActiveTotp"]>[0]
  ) {
    return mutateLocalOwner(input.accountId, async (owner) => {
      const finish = (result: ActiveTotpResult) => {
        appendLocalAudit(owner, input.auditEventForResult(result), input.accountId);
        return result;
      };
      const factor = owner.factor;
      if (!factor || factor.accountId !== input.accountId || factor.status !== "active") {
        return finish({ outcome: "not_enabled" });
      }
      const verification = input.verify({
        secretEncrypted: structuredClone(factor.secretEncrypted),
        lastAcceptedCounter: factor.lastAcceptedCounter
      });
      if (!verification.ok) {
        return finish({ outcome: "rejected", reason: verification.reason });
      }

      factor.lastAcceptedCounter = verification.counter;
      factor.updatedAt = input.now;
      if (input.mutation === "regenerate_recovery") {
        owner.recoveryCodes = (input.replacementRecoveryCodes || []).map((code) => ({
          ...code,
          accountId: input.accountId,
          usedAt: null,
          createdAt: input.now
        }));
      } else if (input.mutation === "disable") {
        factor.status = "disabled";
        factor.disabledAt = input.now;
        owner.recoveryCodes = [];
      }
      return finish({ outcome: "accepted", counter: verification.counter });
    });
  }

  async consumeRecoveryCode(
    input: Parameters<TotpSecurityRepository["consumeRecoveryCode"]>[0]
  ) {
    return mutateLocalOwner(input.accountId, async (owner) => {
      const finish = (result: "consumed" | "invalid" | "not_enabled") => {
        appendLocalAudit(owner, input.auditEventForResult(result), input.accountId);
        return result;
      };
      if (owner.factor?.status !== "active") return finish("not_enabled");
      const recoveryCode = owner.recoveryCodes.find(
        (item) =>
          item.accountId === input.accountId &&
          item.codeHash === input.codeHash &&
          item.usedAt === null
      );
      if (!recoveryCode) return finish("invalid");
      recoveryCode.usedAt = input.now;
      return finish("consumed");
    });
  }

  async takeRateLimit(input: Parameters<TotpSecurityRepository["takeRateLimit"]>[0]) {
    assertAccountId(input.accountId);
    return withJsonStoreLock(FILE_NAME, async () => {
      const db = await readJsonStore<SecurityFallbackDb>(FILE_NAME, EMPTY_DB);
      db.owners ||= {};
      db.rateLimits = Array.isArray(db.rateLimits) ? db.rateLimits : [];
      const blockedUntil: string[] = [];
      for (const scopeKey of uniqueSortedScopes(input.scopeKeys)) {
        const existing = db.rateLimits.find(
          (item) => item.scopeKey === scopeKey && item.action === input.action
        );
        const result = applyRateLimit(existing, {
          scopeKey,
          action: input.action,
          now: input.now,
          limit: input.limit,
          windowMs: input.windowMs
        });
        if (!existing) db.rateLimits.push(result.record);
        if (!result.allowed) blockedUntil.push(result.blockedUntil);
      }
      await writeJsonStore(FILE_NAME, db);
      return blockedUntil.length > 0
        ? ({ allowed: false, blockedUntil: latestTimestamp(blockedUntil) } as const)
        : ({ allowed: true } as const);
    });
  }

  async appendAuditEvent(event: AuthSecurityAuditEvent) {
    await mutateLocalOwner(event.accountId, async (owner) => {
      appendLocalAudit(owner, event, event.accountId);
    });
  }

  async listAuditEvents(accountId: string) {
    return structuredClone((await readLocalOwner(accountId)).auditEvents);
  }
}

export class PostgresTotpSecurityRepository implements TotpSecurityRepository {
  async createPendingEnrollment(
    input: Parameters<TotpSecurityRepository["createPendingEnrollment"]>[0]
  ) {
    await ensureAdminSchema();
    const sql = getPostgres();
    return (await sql.begin(async (transaction) => {
      await transaction`SELECT pg_advisory_xact_lock(hashtext(${`totp:${input.accountId}`}))`;
      const existing = await transaction`
        SELECT status FROM account_totp_factors WHERE account_id = ${input.accountId} FOR UPDATE
      `;
      if (existing[0]?.status === "active") return "already_enabled" as const;
      await transaction`
        UPDATE account_totp_challenges
        SET consumed_at = ${input.now}
        WHERE account_id = ${input.accountId}
          AND purpose = 'totp_enrollment'
          AND consumed_at IS NULL
      `;
      await transaction`DELETE FROM account_recovery_codes WHERE account_id = ${input.accountId}`;
      await transaction`
        INSERT INTO account_totp_factors (
          id, account_id, secret_encrypted, status, last_accepted_counter,
          created_at, verified_at, disabled_at, updated_at
        ) VALUES (
          ${input.factorId}, ${input.accountId}, ${transaction.json(input.secretEncrypted as never)},
          'pending', NULL, ${input.now}, NULL, NULL, ${input.now}
        )
        ON CONFLICT (account_id) DO UPDATE SET
          id = EXCLUDED.id,
          secret_encrypted = EXCLUDED.secret_encrypted,
          status = 'pending',
          last_accepted_counter = NULL,
          created_at = EXCLUDED.created_at,
          verified_at = NULL,
          disabled_at = NULL,
          updated_at = EXCLUDED.updated_at
      `;
      await transaction`
        INSERT INTO account_totp_challenges (
          id, account_id, purpose, challenge_hash, failure_count,
          expires_at, consumed_at, created_at
        ) VALUES (
          ${input.challengeId}, ${input.accountId}, 'totp_enrollment', ${input.challengeHash},
          0, ${input.expiresAt}, NULL, ${input.now}
        )
      `;
      assertAuditEventAccount(input.auditEvent, input.accountId);
      await transaction`
        INSERT INTO auth_security_audit_events (
          id, account_id, actor_account_id, action, safe_metadata, created_at
        ) VALUES (
          ${input.auditEvent.id}, ${input.auditEvent.accountId}, ${input.auditEvent.actorAccountId},
          ${input.auditEvent.action}, ${transaction.json(input.auditEvent.safeMetadata as never)},
          ${input.auditEvent.createdAt}
        )
      `;
      return "created" as const;
    })) as "created" | "already_enabled";
  }

  async getFactorStatus(accountId: string) {
    await ensureAdminSchema();
    const rows = await getPostgres()`
      SELECT status, created_at, verified_at, disabled_at, updated_at
      FROM account_totp_factors
      WHERE account_id = ${accountId}
      LIMIT 1
    `;
    if (!rows[0]) return toSafeStatus(null);
    return {
      status: parseFactorState(rows[0].status),
      enabled: rows[0].status === "active",
      createdAt: toIso(rows[0].created_at),
      verifiedAt: rows[0].verified_at ? toIso(rows[0].verified_at) : null,
      disabledAt: rows[0].disabled_at ? toIso(rows[0].disabled_at) : null,
      updatedAt: toIso(rows[0].updated_at)
    };
  }

  async confirmEnrollment(
    input: Parameters<TotpSecurityRepository["confirmEnrollment"]>[0]
  ) {
    await ensureAdminSchema();
    const sql = getPostgres();
    return (await sql.begin(async (transaction) => {
      const finish = async (result: EnrollmentConfirmationResult) => {
        const event = input.auditEventForResult(result);
        assertAuditEventAccount(event, input.accountId);
        await transaction`
          INSERT INTO auth_security_audit_events (
            id, account_id, actor_account_id, action, safe_metadata, created_at
          ) VALUES (
            ${event.id}, ${event.accountId}, ${event.actorAccountId}, ${event.action},
            ${transaction.json(event.safeMetadata as never)}, ${event.createdAt}
          )
        `;
        return result;
      };
      const rows = await transaction`
        SELECT
          c.id AS challenge_id,
          c.failure_count,
          c.expires_at,
          f.secret_encrypted,
          f.last_accepted_counter,
          f.status
        FROM account_totp_challenges c
        JOIN account_totp_factors f ON f.account_id = c.account_id
        WHERE c.account_id = ${input.accountId}
          AND c.purpose = 'totp_enrollment'
          AND c.challenge_hash = ${input.challengeHash}
          AND c.consumed_at IS NULL
        LIMIT 1
        FOR UPDATE OF c, f
      `;
      const row = rows[0];
      if (!row || row.status !== "pending") return finish({ outcome: "not_found" });
      if (Number(row.failure_count) >= MAX_CHALLENGE_FAILURES) {
        return finish({ outcome: "locked" });
      }
      if (new Date(row.expires_at as string | Date).getTime() <= Date.parse(input.now)) {
        await transaction`
          UPDATE account_totp_challenges SET consumed_at = ${input.now} WHERE id = ${row.challenge_id}
        `;
        return finish({ outcome: "expired" });
      }
      const verification = input.verify({
        secretEncrypted: row.secret_encrypted as AesGcmField,
        lastAcceptedCounter:
          row.last_accepted_counter == null ? null : Number(row.last_accepted_counter)
      });
      if (!verification.ok) {
        const nextFailureCount = Math.min(
          MAX_CHALLENGE_FAILURES,
          Number(row.failure_count) + 1
        );
        await transaction`
          UPDATE account_totp_challenges
          SET failure_count = ${nextFailureCount}
          WHERE id = ${row.challenge_id}
        `;
        return finish(
          nextFailureCount >= MAX_CHALLENGE_FAILURES
            ? { outcome: "locked" }
            : { outcome: "rejected", reason: verification.reason }
        );
      }
      await transaction`
        UPDATE account_totp_factors SET
          status = 'active',
          last_accepted_counter = ${verification.counter},
          verified_at = ${input.now},
          disabled_at = NULL,
          updated_at = ${input.now}
        WHERE account_id = ${input.accountId}
      `;
      await transaction`
        UPDATE account_totp_challenges SET consumed_at = ${input.now} WHERE id = ${row.challenge_id}
      `;
      await transaction`DELETE FROM account_recovery_codes WHERE account_id = ${input.accountId}`;
      for (const recoveryCode of input.recoveryCodes) {
        await transaction`
          INSERT INTO account_recovery_codes (id, account_id, code_hash, used_at, created_at)
          VALUES (${recoveryCode.id}, ${input.accountId}, ${recoveryCode.codeHash}, NULL, ${input.now})
        `;
      }
      return finish({ outcome: "accepted", counter: verification.counter });
    })) as EnrollmentConfirmationResult;
  }

  async mutateWithActiveTotp(
    input: Parameters<TotpSecurityRepository["mutateWithActiveTotp"]>[0]
  ) {
    await ensureAdminSchema();
    const sql = getPostgres();
    return (await sql.begin(async (transaction) => {
      const finish = async (result: ActiveTotpResult) => {
        const event = input.auditEventForResult(result);
        assertAuditEventAccount(event, input.accountId);
        await transaction`
          INSERT INTO auth_security_audit_events (
            id, account_id, actor_account_id, action, safe_metadata, created_at
          ) VALUES (
            ${event.id}, ${event.accountId}, ${event.actorAccountId}, ${event.action},
            ${transaction.json(event.safeMetadata as never)}, ${event.createdAt}
          )
        `;
        return result;
      };
      const rows = await transaction`
        SELECT secret_encrypted, last_accepted_counter, status
        FROM account_totp_factors
        WHERE account_id = ${input.accountId}
        LIMIT 1
        FOR UPDATE
      `;
      const row = rows[0];
      if (!row || row.status !== "active") return finish({ outcome: "not_enabled" });
      const verification = input.verify({
        secretEncrypted: row.secret_encrypted as AesGcmField,
        lastAcceptedCounter:
          row.last_accepted_counter == null ? null : Number(row.last_accepted_counter)
      });
      if (!verification.ok) {
        return finish({ outcome: "rejected", reason: verification.reason });
      }
      if (input.mutation === "disable") {
        await transaction`
          UPDATE account_totp_factors SET
            status = 'disabled',
            last_accepted_counter = ${verification.counter},
            disabled_at = ${input.now},
            updated_at = ${input.now}
          WHERE account_id = ${input.accountId}
        `;
        await transaction`DELETE FROM account_recovery_codes WHERE account_id = ${input.accountId}`;
      } else {
        await transaction`
          UPDATE account_totp_factors SET
            last_accepted_counter = ${verification.counter},
            updated_at = ${input.now}
          WHERE account_id = ${input.accountId}
        `;
        if (input.mutation === "regenerate_recovery") {
          await transaction`DELETE FROM account_recovery_codes WHERE account_id = ${input.accountId}`;
          for (const recoveryCode of input.replacementRecoveryCodes || []) {
            await transaction`
              INSERT INTO account_recovery_codes (id, account_id, code_hash, used_at, created_at)
              VALUES (${recoveryCode.id}, ${input.accountId}, ${recoveryCode.codeHash}, NULL, ${input.now})
            `;
          }
        }
      }
      return finish({ outcome: "accepted", counter: verification.counter });
    })) as ActiveTotpResult;
  }

  async consumeRecoveryCode(
    input: Parameters<TotpSecurityRepository["consumeRecoveryCode"]>[0]
  ) {
    await ensureAdminSchema();
    const sql = getPostgres();
    return (await sql.begin(async (transaction) => {
      const finish = async (result: "consumed" | "invalid" | "not_enabled") => {
        const event = input.auditEventForResult(result);
        assertAuditEventAccount(event, input.accountId);
        await transaction`
          INSERT INTO auth_security_audit_events (
            id, account_id, actor_account_id, action, safe_metadata, created_at
          ) VALUES (
            ${event.id}, ${event.accountId}, ${event.actorAccountId}, ${event.action},
            ${transaction.json(event.safeMetadata as never)}, ${event.createdAt}
          )
        `;
        return result;
      };
      const factors = await transaction`
        SELECT status FROM account_totp_factors WHERE account_id = ${input.accountId} FOR UPDATE
      `;
      if (factors[0]?.status !== "active") return finish("not_enabled");
      const rows = await transaction`
        UPDATE account_recovery_codes
        SET used_at = ${input.now}
        WHERE account_id = ${input.accountId}
          AND code_hash = ${input.codeHash}
          AND used_at IS NULL
        RETURNING id
      `;
      return finish(rows.length > 0 ? "consumed" : "invalid");
    })) as "consumed" | "invalid" | "not_enabled";
  }

  async takeRateLimit(input: Parameters<TotpSecurityRepository["takeRateLimit"]>[0]) {
    await ensureAdminSchema();
    const sql = getPostgres();
    return (await sql.begin(async (transaction) => {
      const scopeKeys = uniqueSortedScopes(input.scopeKeys);
      for (const scopeKey of scopeKeys) {
        await transaction`
          SELECT pg_advisory_xact_lock(hashtext(${`${scopeKey}:${input.action}`}))
        `;
      }
      const blockedResults: string[] = [];
      const nowMs = Date.parse(input.now);
      for (const scopeKey of scopeKeys) {
        const rows = await transaction`
          SELECT * FROM auth_security_rate_limits
          WHERE scope_key = ${scopeKey} AND action = ${input.action}
          FOR UPDATE
        `;
        const row = rows[0];
        if (!row) {
          await transaction`
            INSERT INTO auth_security_rate_limits (
              scope_key, action, window_started_at, attempt_count, blocked_until, updated_at
            ) VALUES (${scopeKey}, ${input.action}, ${input.now}, 1, NULL, ${input.now})
          `;
          continue;
        }
        const blockedUntil = row.blocked_until
          ? new Date(row.blocked_until as string | Date).toISOString()
          : null;
        if (blockedUntil && Date.parse(blockedUntil) > nowMs) {
          blockedResults.push(blockedUntil);
          continue;
        }
        const windowStartedMs = new Date(row.window_started_at as string | Date).getTime();
        if (nowMs >= windowStartedMs + input.windowMs) {
          await transaction`
            UPDATE auth_security_rate_limits SET
              window_started_at = ${input.now}, attempt_count = 1,
              blocked_until = NULL, updated_at = ${input.now}
            WHERE scope_key = ${scopeKey} AND action = ${input.action}
          `;
          continue;
        }
        if (Number(row.attempt_count) >= input.limit) {
          const nextBlockedUntil = new Date(nowMs + input.windowMs).toISOString();
          await transaction`
            UPDATE auth_security_rate_limits SET
              attempt_count = attempt_count + 1,
              blocked_until = ${nextBlockedUntil},
              updated_at = ${input.now}
            WHERE scope_key = ${scopeKey} AND action = ${input.action}
          `;
          blockedResults.push(nextBlockedUntil);
          continue;
        }
        await transaction`
          UPDATE auth_security_rate_limits SET
            attempt_count = attempt_count + 1, updated_at = ${input.now}
          WHERE scope_key = ${scopeKey} AND action = ${input.action}
        `;
      }
      return blockedResults.length > 0
        ? ({ allowed: false, blockedUntil: latestTimestamp(blockedResults) } as const)
        : ({ allowed: true } as const);
    })) as { allowed: true } | { allowed: false; blockedUntil: string };
  }

  async appendAuditEvent(event: AuthSecurityAuditEvent) {
    await ensureAdminSchema();
    assertAuditEventAccount(event, event.accountId);
    const sql = getPostgres();
    await sql`
      INSERT INTO auth_security_audit_events (
        id, account_id, actor_account_id, action, safe_metadata, created_at
      ) VALUES (
        ${event.id}, ${event.accountId}, ${event.actorAccountId}, ${event.action},
        ${sql.json(event.safeMetadata as never)}, ${event.createdAt}
      )
    `;
  }

  async listAuditEvents(accountId: string) {
    await ensureAdminSchema();
    const rows = await getPostgres()`
      SELECT * FROM auth_security_audit_events
      WHERE account_id = ${accountId}
      ORDER BY created_at ASC, id ASC
    `;
    return rows.map((row) => ({
      id: String(row.id),
      accountId: String(row.account_id),
      actorAccountId: String(row.actor_account_id),
      action: String(row.action),
      safeMetadata: (row.safe_metadata || {}) as Record<string, unknown>,
      createdAt: toIso(row.created_at)
    }));
  }
}

async function readLocalOwner(accountId: string) {
  assertAccountId(accountId);
  const db = await readJsonStore<SecurityFallbackDb>(FILE_NAME, EMPTY_DB);
  return normalizeOwner(db.owners?.[accountId]);
}

async function mutateLocalOwner<T>(
  accountId: string,
  mutate: (owner: OwnerSecurityDocument) => T | Promise<T>
) {
  assertAccountId(accountId);
  return withJsonStoreLock(FILE_NAME, async () => {
    const db = await readJsonStore<SecurityFallbackDb>(FILE_NAME, EMPTY_DB);
    db.owners ||= {};
    const owner = normalizeOwner(db.owners[accountId]);
    const result = await mutate(owner);
    db.owners[accountId] = owner;
    await writeJsonStore(FILE_NAME, db);
    return result;
  });
}

function normalizeOwner(owner: OwnerSecurityDocument | undefined): OwnerSecurityDocument {
  if (!owner) return structuredClone(EMPTY_OWNER);
  return {
    factor: owner.factor ? structuredClone(owner.factor) : null,
    challenges: Array.isArray(owner.challenges) ? structuredClone(owner.challenges) : [],
    recoveryCodes: Array.isArray(owner.recoveryCodes)
      ? structuredClone(owner.recoveryCodes)
      : [],
    auditEvents: Array.isArray(owner.auditEvents) ? structuredClone(owner.auditEvents) : []
  };
}

function appendLocalAudit(
  owner: OwnerSecurityDocument,
  event: AuthSecurityAuditEvent,
  accountId: string
) {
  assertAuditEventAccount(event, accountId);
  owner.auditEvents.push(structuredClone(event));
}

function assertAuditEventAccount(event: AuthSecurityAuditEvent, accountId: string) {
  if (event.accountId !== accountId || !event.actorAccountId.trim()) {
    throw new Error("Authentication audit event account mismatch.");
  }
}

function uniqueSortedScopes(scopeKeys: string[]) {
  const scopes = [...new Set(scopeKeys.map((scope) => scope.trim()).filter(Boolean))].sort();
  if (scopes.length !== 2) {
    throw new Error("Both account and network rate-limit scopes are required.");
  }
  return scopes;
}

function applyRateLimit(
  existing: StoredRateLimit | undefined,
  input: {
    scopeKey: string;
    action: AuthSecurityRateLimitAction;
    now: string;
    limit: number;
    windowMs: number;
  }
):
  | { allowed: true; record: StoredRateLimit }
  | { allowed: false; blockedUntil: string; record: StoredRateLimit } {
  const nowMs = Date.parse(input.now);
  const record =
    existing ||
    ({
      scopeKey: input.scopeKey,
      action: input.action,
      windowStartedAt: input.now,
      attemptCount: 0,
      blockedUntil: null,
      updatedAt: input.now
    } satisfies StoredRateLimit);
  if (record.blockedUntil && Date.parse(record.blockedUntil) > nowMs) {
    return { allowed: false, blockedUntil: record.blockedUntil, record };
  }
  if (nowMs >= Date.parse(record.windowStartedAt) + input.windowMs) {
    record.windowStartedAt = input.now;
    record.attemptCount = 1;
    record.blockedUntil = null;
    record.updatedAt = input.now;
    return { allowed: true, record };
  }
  if (record.attemptCount >= input.limit) {
    record.attemptCount += 1;
    record.blockedUntil = new Date(nowMs + input.windowMs).toISOString();
    record.updatedAt = input.now;
    return { allowed: false, blockedUntil: record.blockedUntil, record };
  }
  record.attemptCount += 1;
  record.updatedAt = input.now;
  return { allowed: true, record };
}

function latestTimestamp(values: string[]) {
  return values.reduce((latest, value) =>
    Date.parse(value) > Date.parse(latest) ? value : latest
  );
}

function toSafeStatus(factor: StoredFactor | null): TotpFactorStatus {
  return factor
    ? {
        status: factor.status,
        enabled: factor.status === "active",
        createdAt: factor.createdAt,
        verifiedAt: factor.verifiedAt,
        disabledAt: factor.disabledAt,
        updatedAt: factor.updatedAt
      }
    : {
        status: null,
        enabled: false,
        createdAt: null,
        verifiedAt: null,
        disabledAt: null,
        updatedAt: null
      };
}

function parseFactorState(value: unknown): TotpFactorState {
  if (value === "pending" || value === "active" || value === "disabled") return value;
  throw new Error("Invalid persisted TOTP factor state");
}

function assertAccountId(accountId: string) {
  if (!accountId.trim() || accountId.length > 180) {
    throw new Error("accountId must be a non-empty string up to 180 characters.");
  }
}

function toIso(value: unknown) {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}
