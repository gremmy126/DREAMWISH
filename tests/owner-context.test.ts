import assert from "node:assert/strict";

const TEST_SESSION_SECRET = "test-session-secret-that-is-at-least-32-bytes";

test("valid signed cookie supplies canonical owner claims and ignores x-owner-id", async () => {
  await withEnv({ AUTH_SESSION_SECRET: TEST_SESSION_SECRET }, async () => {
    const { createSessionToken, SESSION_COOKIE_NAME } = require("../src/lib/auth/session-token");
    const { getOwnerContext } = require("../src/lib/auth/owner-context");
    const token = await createSessionToken({
      uid: "canonical-owner-uid",
      email: "kara111131@naver.com",
      name: "Canonical Owner",
      paid: false
    });
    const request = new Request("http://localhost/api/memories", {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
        "x-owner-id": "forged-owner-uid"
      }
    });

    assert.deepEqual(await getOwnerContext(request), {
      uid: "canonical-owner-uid",
      email: "kara111131@naver.com",
      role: "admin"
    });
  });
});

test("missing session cookie returns no owner context", async () => {
  await withEnv({ AUTH_SESSION_SECRET: TEST_SESSION_SECRET }, async () => {
    const { getOwnerContext } = require("../src/lib/auth/owner-context");
    const request = new Request("http://localhost/api/memories", {
      headers: { "x-owner-id": "forged-owner-uid" }
    });

    assert.equal(await getOwnerContext(request), null);
  });
});

test("tampered session cookie returns no owner context", async () => {
  await withEnv({ AUTH_SESSION_SECRET: TEST_SESSION_SECRET }, async () => {
    const { createSessionToken, SESSION_COOKIE_NAME } = require("../src/lib/auth/session-token");
    const { getOwnerContext } = require("../src/lib/auth/owner-context");
    const token = await createSessionToken({
      uid: "canonical-owner-uid",
      email: "owner@example.com",
      paid: true
    });
    const [payload, signature] = token.split(".");
    const replacement = signature.startsWith("A") ? "B" : "A";
    const tampered = `${payload}.${replacement}${signature.slice(1)}`;
    const request = new Request("http://localhost/api/memories", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=${tampered}` }
    });

    assert.equal(await getOwnerContext(request), null);
  });
});

test("requireOwnerContext throws AUTH_REQUIRED when authentication is absent", async () => {
  await withEnv({ AUTH_SESSION_SECRET: TEST_SESSION_SECRET }, async () => {
    const { OwnerContextError, requireOwnerContext } = require("../src/lib/auth/owner-context") as
      typeof import("../src/lib/auth/owner-context");

    await assert.rejects(
      () => requireOwnerContext(new Request("http://localhost/api/memories")),
      (error: unknown) => {
        assert.ok(error instanceof OwnerContextError);
        assert.equal(error.code, "AUTH_REQUIRED");
        assert.equal(error.status, 401);
        return true;
      }
    );
  });
});

test("malformed percent-encoded session cookie fails closed", async () => {
  await withEnv({ AUTH_SESSION_SECRET: TEST_SESSION_SECRET }, async () => {
    const { SESSION_COOKIE_NAME } = require("../src/lib/auth/session-token");
    const { getOwnerContext } = require("../src/lib/auth/owner-context");
    const request = new Request("http://localhost/api/memories", {
      headers: { cookie: `${SESSION_COOKIE_NAME}=%E0%A4%A` }
    });

    assert.equal(await getOwnerContext(request), null);
  });
});

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
