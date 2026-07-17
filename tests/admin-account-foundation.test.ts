import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_SESSION_SECRET = "test-session-secret-that-is-at-least-32-bytes";

test("session claims carry entitlement, role, and invalidation version", async () => {
  await withEnv({ AUTH_SESSION_SECRET: TEST_SESSION_SECRET }, async () => {
    const { createSessionToken, verifySessionToken } = require("../src/lib/auth/session-token") as
      typeof import("../src/lib/auth/session-token");
    const token = await createSessionToken({
      uid: "operational-user-1",
      email: "member@example.com",
      paid: false,
      entitled: true,
      role: "admin",
      sessionVersion: 4
    });
    const claims = await verifySessionToken(token);

    assert.equal(claims?.entitled, true);
    assert.equal(claims?.role, "admin");
    assert.equal(claims?.sessionVersion, 4);
  });
});

test("legacy session claims receive safe entitlement and version defaults", async () => {
  await withEnv({ AUTH_SESSION_SECRET: TEST_SESSION_SECRET }, async () => {
    const { createSessionToken, verifySessionToken } = require("../src/lib/auth/session-token") as
      typeof import("../src/lib/auth/session-token");
    const token = await createSessionToken({
      uid: "legacy-user-1",
      email: "legacy@example.com",
      paid: true
    });
    const claims = await verifySessionToken(token);

    assert.equal(claims?.entitled, true);
    assert.equal(claims?.sessionVersion, 1);
  });
});

test("operational accounts persist identity and mutation state in local storage", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dreamwish-admin-account-"));
  try {
    await withEnv({ DATA_DIR: dataDir, DATABASE_URL: undefined }, async () => {
      const repository = require("../src/lib/admin/account-admin.repository") as
        typeof import("../src/lib/admin/account-admin.repository");
      const account = await repository.upsertOperationalAccount({
        id: "account-1",
        email: " Member@Example.com ",
        name: "Member",
        provider: "password",
        providerSubject: "firebase-1"
      });

      assert.equal(account.email, "member@example.com");
      assert.equal(account.status, "active");
      assert.equal(account.sessionVersion, 1);
      assert.equal((await repository.getOperationalAccount("account-1"))?.email, account.email);

      const suspended = await repository.mutateOperationalAccount("account-1", {
        type: "suspend"
      });
      assert.equal(suspended.status, "suspended");
      assert.equal(suspended.sessionVersion, 2);
    });
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("administrator mutation policy blocks non-admin, self suspension, and last-admin demotion", () => {
  const { assertAdminMutationAllowed } = require("../src/lib/admin/admin-guard") as
    typeof import("../src/lib/admin/admin-guard");
  const admin = operationalAccount({ id: "admin-1", email: "admin@example.com", role: "admin" });
  const user = operationalAccount({ id: "user-1", email: "user@example.com", role: "user" });

  assert.throws(
    () => assertAdminMutationAllowed(user, admin, "restore", 2),
    /Administrator access/u
  );
  assert.throws(
    () => assertAdminMutationAllowed(admin, admin, "suspend", 2),
    /own administrator account/u
  );
  assert.throws(
    () => assertAdminMutationAllowed(admin, admin, "demote", 1),
    /last active administrator/u
  );
});

test("owner context rejects suspended accounts and stale session versions", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dreamwish-owner-version-"));
  try {
    await withEnv(
      { DATA_DIR: dataDir, DATABASE_URL: undefined, AUTH_SESSION_SECRET: TEST_SESSION_SECRET },
      async () => {
        const repository = require("../src/lib/admin/account-admin.repository") as
          typeof import("../src/lib/admin/account-admin.repository");
        const { createSessionToken, SESSION_COOKIE_NAME } = require("../src/lib/auth/session-token") as
          typeof import("../src/lib/auth/session-token");
        const { getOwnerContext } = require("../src/lib/auth/owner-context") as
          typeof import("../src/lib/auth/owner-context");

        await repository.upsertOperationalAccount({
          id: "versioned-user",
          email: "versioned@example.com",
          provider: "password",
          providerSubject: "versioned-user"
        });
        const staleToken = await createSessionToken({
          uid: "versioned-user",
          email: "versioned@example.com",
          paid: true,
          entitled: true,
          sessionVersion: 1
        });
        await repository.mutateOperationalAccount("versioned-user", { type: "force_logout" });

        const staleRequest = new Request("http://localhost/api/me", {
          headers: { cookie: `${SESSION_COOKIE_NAME}=${staleToken}` }
        });
        assert.equal(await getOwnerContext(staleRequest), null);

        const suspended = await repository.mutateOperationalAccount("versioned-user", {
          type: "suspend"
        });
        const currentToken = await createSessionToken({
          uid: suspended.id,
          email: suspended.email,
          paid: true,
          entitled: true,
          sessionVersion: suspended.sessionVersion
        });
        const suspendedRequest = new Request("http://localhost/api/me", {
          headers: { cookie: `${SESSION_COOKIE_NAME}=${currentToken}` }
        });
        assert.equal(await getOwnerContext(suspendedRequest), null);
      }
    );
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

function operationalAccount(
  overrides: Partial<import("../src/lib/admin/account-admin.types").OperationalAccount>
): import("../src/lib/admin/account-admin.types").OperationalAccount {
  return {
    id: "account",
    email: "account@example.com",
    name: null,
    role: "user",
    status: "active",
    sessionVersion: 1,
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
    lastLoginAt: "2026-07-17T00:00:00.000Z",
    deletionScheduledAt: null,
    ...overrides
  };
}

async function withEnv(
  values: Record<string, string | undefined>,
  run: () => void | Promise<void>
) {
  const original = { ...process.env };
  process.env = { ...original };
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await run();
  } finally {
    process.env = original;
  }
}
