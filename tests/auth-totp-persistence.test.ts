import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateTotpCode } from "../src/lib/auth/totp";
import {
  beginTotpEnrollment,
  confirmTotpEnrollment,
  disableTotp,
  getTotpFactorStatus,
  regenerateRecoveryCodes,
  verifyTotpLogin
} from "../src/lib/auth/totp.service";
import {
  appendAuthSecurityAuditEvent,
  listAuthSecurityAuditEvents
} from "../src/lib/auth/auth-security-audit";
import { JsonTotpSecurityRepository } from "../src/lib/auth/totp.repository";
import { AUTH_SECURITY_SCHEMA_SQL } from "../src/lib/auth/auth-security.schema";
import { ADMIN_SCHEMA_SQL } from "../src/lib/admin/schema";

const ENCRYPTION_KEY = Buffer.alloc(32, 0x31).toString("base64");
const HASH_KEY = Buffer.alloc(32, 0x72).toString("base64");
const BASE_NOW = Date.parse("2026-07-17T00:00:00.000Z");

test("pending TOTP enrollment expires exactly ten minutes after creation", async () => {
  await withSecurityStore(async () => {
    const enrollment = await beginTotpEnrollment({
      account: { id: "expiry-account", email: "expiry@example.com" },
      networkKey: "network-expiry",
      now: BASE_NOW
    });

    assert.equal(enrollment.expiresAt, new Date(BASE_NOW + 10 * 60_000).toISOString());
    const code = generateTotpCode({ secret: enrollment.manualKey, nowMs: BASE_NOW + 10 * 60_000 });
    await rejectsWithCode(
      () =>
        confirmTotpEnrollment({
          accountId: "expiry-account",
          enrollmentId: enrollment.enrollmentId,
          code,
          networkKey: "network-expiry-confirm",
          now: BASE_NOW + 10 * 60_000
        }),
      "TOTP_ENROLLMENT_EXPIRED"
    );
  });
});

test("TOTP secrets are encrypted at rest and safe status DTOs never serialize them", async () => {
  await withSecurityStore(async (dataDir) => {
    const enrollment = await beginTotpEnrollment({
      account: { id: "encrypted-account", email: "encrypted@example.com" },
      networkKey: "network-encrypted",
      now: BASE_NOW
    });
    const confirmation = await confirmTotpEnrollment({
      accountId: "encrypted-account",
      enrollmentId: enrollment.enrollmentId,
      code: generateTotpCode({ secret: enrollment.manualKey, nowMs: BASE_NOW }),
      networkKey: "network-encrypted-confirm",
      now: BASE_NOW
    });

    const serializedStore = fs.readFileSync(path.join(dataDir, "auth-security.json"), "utf8");
    const status = await getTotpFactorStatus("encrypted-account");
    assert.doesNotMatch(serializedStore, new RegExp(enrollment.manualKey, "u"));
    assert.equal(serializedStore.includes(enrollment.otpauthUri), false);
    assert.equal(serializedStore.includes(enrollment.enrollmentId), false);
    assert.equal(serializedStore.includes("network-encrypted"), false);
    assert.equal(serializedStore.includes(confirmation.recoveryCodes[0]), false);
    assert.equal(status.status, "active");
    assert.equal(JSON.stringify(status).includes(enrollment.manualKey), false);
    assert.equal(JSON.stringify(status).toLowerCase().includes("secret"), false);
  });
});

test("pending enrollment locks after five failed verification attempts", async () => {
  await withSecurityStore(async () => {
    const enrollment = await beginTotpEnrollment({
      account: { id: "locked-account", email: "locked@example.com" },
      networkKey: "network-lock-start",
      now: BASE_NOW
    });

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await rejectsWithCode(
        () =>
          confirmTotpEnrollment({
            accountId: "locked-account",
            enrollmentId: enrollment.enrollmentId,
            code: "000000",
            networkKey: "network-lock-attempts",
            now: BASE_NOW
          }),
        "TOTP_INVALID_CODE"
      );
    }
    await rejectsWithCode(
      () =>
        confirmTotpEnrollment({
          accountId: "locked-account",
          enrollmentId: enrollment.enrollmentId,
          code: "000000",
          networkKey: "network-lock-attempts",
          now: BASE_NOW
        }),
      "TOTP_ENROLLMENT_LOCKED"
    );
  });
});

test("activation and login verification advance a monotonic accepted TOTP counter", async () => {
  await withSecurityStore(async () => {
    const enrollment = await beginTotpEnrollment({
      account: { id: "counter-account", email: "counter@example.com" },
      networkKey: "network-counter-start",
      now: BASE_NOW
    });
    await confirmTotpEnrollment({
      accountId: "counter-account",
      enrollmentId: enrollment.enrollmentId,
      code: generateTotpCode({ secret: enrollment.manualKey, nowMs: BASE_NOW }),
      networkKey: "network-counter-confirm",
      now: BASE_NOW
    });

    const later = BASE_NOW + 30_000;
    const laterCode = generateTotpCode({ secret: enrollment.manualKey, nowMs: later });
    assert.deepEqual(
      await verifyTotpLogin({
        accountId: "counter-account",
        method: "totp",
        code: laterCode,
        networkKey: "network-counter-login",
        now: later
      }),
      { verified: true, method: "totp" }
    );
    await rejectsWithCode(
      () =>
        verifyTotpLogin({
          accountId: "counter-account",
          method: "totp",
          code: laterCode,
          networkKey: "network-counter-replay",
          now: later
        }),
      "TOTP_CODE_REPLAYED"
    );
  });
});

test("each recovery code is accepted only once", async () => {
  await withSecurityStore(async () => {
    const { confirmation } = await enrollAndConfirm("recovery-account", "recovery@example.com");
    const recoveryCode = confirmation.recoveryCodes[0];

    assert.deepEqual(
      await verifyTotpLogin({
        accountId: "recovery-account",
        method: "recovery",
        code: recoveryCode,
        networkKey: "network-recovery-first",
        now: BASE_NOW
      }),
      { verified: true, method: "recovery" }
    );
    await rejectsWithCode(
      () =>
        verifyTotpLogin({
          accountId: "recovery-account",
          method: "recovery",
          code: recoveryCode,
          networkKey: "network-recovery-reuse",
          now: BASE_NOW
        }),
      "RECOVERY_CODE_INVALID"
    );
  });
});

test("recovery-code regeneration atomically verifies TOTP and invalidates every old code", async () => {
  await withSecurityStore(async () => {
    const { enrollment, confirmation } = await enrollAndConfirm(
      "regeneration-account",
      "regeneration@example.com"
    );
    const oldCodes = confirmation.recoveryCodes;
    const regenerationTime = BASE_NOW + 30_000;
    const regenerated = await regenerateRecoveryCodes({
      accountId: "regeneration-account",
      currentTotpCode: generateTotpCode({
        secret: enrollment.manualKey,
        nowMs: regenerationTime
      }),
      networkKey: "network-regenerate",
      now: regenerationTime
    });

    assert.equal(regenerated.recoveryCodes.length, 10);
    for (const [index, oldCode] of oldCodes.entries()) {
      await rejectsWithCode(
        () =>
          verifyTotpLogin({
            accountId: "regeneration-account",
            method: "recovery",
            code: oldCode,
            networkKey: `network-old-${oldCode}`,
            now: regenerationTime + index * 10 * 60_000
          }),
        "RECOVERY_CODE_INVALID"
      );
    }
    assert.deepEqual(
      await verifyTotpLogin({
        accountId: "regeneration-account",
        method: "recovery",
        code: regenerated.recoveryCodes[0],
        networkKey: "network-new-recovery",
        now: regenerationTime + oldCodes.length * 10 * 60_000
      }),
      { verified: true, method: "recovery" }
    );
  });
});

test("disable verifies a fresh TOTP counter atomically and exposes only disabled status", async () => {
  await withSecurityStore(async () => {
    const { enrollment } = await enrollAndConfirm("disable-account", "disable@example.com");
    const disableTime = BASE_NOW + 30_000;
    const currentTotpCode = generateTotpCode({
      secret: enrollment.manualKey,
      nowMs: disableTime
    });

    assert.deepEqual(
      await disableTotp({
        accountId: "disable-account",
        currentTotpCode,
        networkKey: "network-disable",
        now: disableTime
      }),
      { status: "disabled" }
    );
    const status = await getTotpFactorStatus("disable-account");
    assert.equal(status.status, "disabled");
    await rejectsWithCode(
      () =>
        verifyTotpLogin({
          accountId: "disable-account",
          method: "totp",
          code: currentTotpCode,
          networkKey: "network-disabled-login",
          now: disableTime
        }),
      "TOTP_NOT_ENABLED"
    );
  });
});

test("TOTP factors, challenges, and recovery codes remain isolated by account", async () => {
  await withSecurityStore(async () => {
    const enrollment = await beginTotpEnrollment({
      account: { id: "owner-a", email: "owner-a@example.com" },
      networkKey: "network-owner-a",
      now: BASE_NOW
    });
    await rejectsWithCode(
      () =>
        confirmTotpEnrollment({
          accountId: "owner-b",
          enrollmentId: enrollment.enrollmentId,
          code: generateTotpCode({ secret: enrollment.manualKey, nowMs: BASE_NOW }),
          networkKey: "network-owner-b",
          now: BASE_NOW
        }),
      "TOTP_ENROLLMENT_NOT_FOUND"
    );
    const confirmation = await confirmTotpEnrollment({
      accountId: "owner-a",
      enrollmentId: enrollment.enrollmentId,
      code: generateTotpCode({ secret: enrollment.manualKey, nowMs: BASE_NOW }),
      networkKey: "network-owner-a-confirm",
      now: BASE_NOW
    });
    await rejectsWithCode(
      () =>
        verifyTotpLogin({
          accountId: "owner-b",
          method: "recovery",
          code: confirmation.recoveryCodes[0],
          networkKey: "network-owner-b-recovery",
          now: BASE_NOW
        }),
      "TOTP_NOT_ENABLED"
    );
    assert.equal((await getTotpFactorStatus("owner-b")).status, null);
  });
});

test("durable rate limits enforce independent account and network scopes", async () => {
  await withSecurityStore(async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await beginTotpEnrollment({
        account: { id: "rate-account", email: "rate@example.com" },
        networkKey: "rate-network",
        now: BASE_NOW
      });
    }
    await rejectsWithCode(
      () =>
        beginTotpEnrollment({
          account: { id: "rate-account", email: "rate@example.com" },
          networkKey: "rate-network",
          now: BASE_NOW
        }),
      "TOTP_RATE_LIMITED"
    );
    await rejectsWithCode(
      () =>
        beginTotpEnrollment({
          account: { id: "rate-account", email: "rate@example.com" },
          networkKey: "other-network",
          now: BASE_NOW
        }),
      "TOTP_RATE_LIMITED"
    );
    await rejectsWithCode(
      () =>
        beginTotpEnrollment({
          account: { id: "other-account", email: "other@example.com" },
          networkKey: "rate-network",
          now: BASE_NOW
        }),
      "TOTP_RATE_LIMITED"
    );
    await beginTotpEnrollment({
      account: { id: "unrelated-account", email: "unrelated@example.com" },
      networkKey: "unrelated-network",
      now: BASE_NOW
    });
  });
});

test("factor activation rolls back when its atomic audit event cannot be created", async () => {
  await withSecurityStore(async (dataDir) => {
    const enrollment = await beginTotpEnrollment({
      account: { id: "atomic-audit-account", email: "atomic-audit@example.com" },
      networkKey: "atomic-audit-network",
      now: BASE_NOW
    });
    const persisted = JSON.parse(
      fs.readFileSync(path.join(dataDir, "auth-security.json"), "utf8")
    ) as {
      owners: Record<string, { challenges: Array<{ challengeHash: string }> }>;
    };
    const challengeHash = persisted.owners["atomic-audit-account"].challenges[0].challengeHash;
    const repository = new JsonTotpSecurityRepository();
    const confirmWithAtomicAudit = repository.confirmEnrollment.bind(repository) as unknown as (
      input: {
        accountId: string;
        challengeHash: string;
        now: string;
        recoveryCodes: [];
        verify: () => { ok: true; counter: number };
        auditEventForResult: () => never;
      }
    ) => Promise<unknown>;

    await assert.rejects(
      () =>
        confirmWithAtomicAudit({
          accountId: "atomic-audit-account",
          challengeHash,
          now: new Date(BASE_NOW).toISOString(),
          recoveryCodes: [],
          verify: () => ({ ok: true, counter: Math.floor(BASE_NOW / 30_000) }),
          auditEventForResult: () => {
            throw new Error("simulated audit failure");
          }
        }),
      /simulated audit failure/u
    );
    assert.equal((await repository.getFactorStatus("atomic-audit-account")).status, "pending");
    assert.equal(JSON.stringify(await listAuthSecurityAuditEvents("atomic-audit-account")).includes("totp_enabled"), false);
    assert.ok(enrollment.manualKey);
  });
});

test("audit metadata rejects secrets even when they use an innocuous key", async () => {
  await withSecurityStore(async () => {
    await assert.rejects(
      () =>
        appendAuthSecurityAuditEvent({
          accountId: "audit-metadata-account",
          action: "totp_login_failed",
          safeMetadata: { detail: "JBSWY3DPEHPK3PXP" },
          now: new Date(BASE_NOW).toISOString()
        }),
      /audit metadata/u
    );
  });
});

test("authentication security audit is append-only, owner-scoped, and secret-safe", async () => {
  await withSecurityStore(async () => {
    const { enrollment, confirmation } = await enrollAndConfirm(
      "audit-account",
      "audit@example.com"
    );
    const before = await listAuthSecurityAuditEvents("audit-account");
    await verifyTotpLogin({
      accountId: "audit-account",
      method: "recovery",
      code: confirmation.recoveryCodes[0],
      networkKey: "network-audit-login",
      now: BASE_NOW
    });
    const after = await listAuthSecurityAuditEvents("audit-account");

    assert.ok(before.length >= 2);
    assert.deepEqual(
      after.slice(0, before.length).map((event) => event.id),
      before.map((event) => event.id)
    );
    assert.ok(after.length > before.length);
    assert.equal((await listAuthSecurityAuditEvents("another-account")).length, 0);
    const serialized = JSON.stringify(after);
    assert.equal(serialized.includes(enrollment.manualKey), false);
    assert.equal(serialized.includes(confirmation.recoveryCodes[0]), false);
    assert.equal(serialized.includes(enrollment.otpauthUri), false);
  });
});

test("authentication security schema is idempotent and enforces append-only PostgreSQL audit", () => {
  for (const table of [
    "account_totp_factors",
    "account_totp_challenges",
    "account_recovery_codes",
    "auth_security_rate_limits",
    "auth_security_audit_events"
  ]) {
    assert.match(AUTH_SECURITY_SCHEMA_SQL, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, "u"));
  }
  assert.match(AUTH_SECURITY_SCHEMA_SQL, /BEFORE UPDATE OR DELETE ON auth_security_audit_events/u);
  assert.match(AUTH_SECURITY_SCHEMA_SQL, /CHECK \(status IN \('pending', 'active', 'disabled'\)\)/u);
  assert.match(AUTH_SECURITY_SCHEMA_SQL, /CREATE INDEX IF NOT EXISTS account_totp_challenges_active/u);
  assert.match(AUTH_SECURITY_SCHEMA_SQL, /CREATE INDEX IF NOT EXISTS account_recovery_codes_unused/u);
  assert.match(ADMIN_SCHEMA_SQL, /auth security schema initialized separately/u);
});

test("authenticator cryptography configuration documents every server-only key", () => {
  const exampleEnv = fs.readFileSync(".env.example", "utf8");
  for (const key of [
    "AUTH_TOTP_ENCRYPTION_KEY",
    "AUTH_MFA_CHALLENGE_SECRET",
    "DEVICE_PAIRING_HASH_SECRET",
    "REVENUE_DATA_ENCRYPTION_KEY",
    "AUTH_SECURITY_HASH_KEY"
  ]) {
    assert.match(
      exampleEnv,
      new RegExp(
        `# Authenticator, device pairing, and revenue cryptography - Server Only[\\s\\S]*${key}=""`,
        "u"
      )
    );
    assert.doesNotMatch(exampleEnv, new RegExp(`NEXT_PUBLIC_${key}`, "u"));
  }
});

async function enrollAndConfirm(accountId: string, email: string) {
  const enrollment = await beginTotpEnrollment({
    account: { id: accountId, email },
    networkKey: `network-${accountId}-begin`,
    now: BASE_NOW
  });
  const confirmation = await confirmTotpEnrollment({
    accountId,
    enrollmentId: enrollment.enrollmentId,
    code: generateTotpCode({ secret: enrollment.manualKey, nowMs: BASE_NOW }),
    networkKey: `network-${accountId}-confirm`,
    now: BASE_NOW
  });
  return { enrollment, confirmation };
}

async function rejectsWithCode(run: () => Promise<unknown>, code: string) {
  await assert.rejects(run, (error: unknown) => {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: unknown }).code === code
    );
  });
}

async function withSecurityStore(run: (dataDir: string) => void | Promise<void>) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dreamwish-totp-security-"));
  const original = { ...process.env };
  process.env = {
    ...original,
    DATA_DIR: dataDir,
    AUTH_TOTP_ENCRYPTION_KEY: ENCRYPTION_KEY,
    AUTH_SECURITY_HASH_KEY: HASH_KEY,
    NODE_ENV: "test"
  };
  delete process.env.DATABASE_URL;
  try {
    await run(dataDir);
  } finally {
    process.env = original;
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}
