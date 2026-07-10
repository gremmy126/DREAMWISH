import assert from "node:assert/strict";

const TEST_SESSION_SECRET = "test-session-secret-that-is-at-least-32-bytes";

function baseClaims(overrides: Record<string, unknown> = {}) {
  return {
    uid: "firebase-user-1",
    email: "paid@example.com",
    name: "Paid User",
    paid: true,
    ...overrides
  };
}

test("signed session token verifies valid canonical claims", async () => {
  await withEnv({ AUTH_SESSION_SECRET: TEST_SESSION_SECRET }, async () => {
    const { createSessionToken, verifySessionToken } = require("../src/lib/auth/session-token");
    const token = await createSessionToken(baseClaims());
    const claims = await verifySessionToken(token);

    assert.match(token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);
    assert.equal(claims?.uid, "firebase-user-1");
    assert.equal(claims?.email, "paid@example.com");
    assert.equal(claims?.paid, true);
    assert.ok((claims?.exp || 0) > (claims?.iat || 0));
  });
});

test("signed session token rejects a tampered signature", async () => {
  await withEnv({ AUTH_SESSION_SECRET: TEST_SESSION_SECRET }, async () => {
    const { createSessionToken, verifySessionToken } = require("../src/lib/auth/session-token");
    const token = await createSessionToken(baseClaims());
    const [payload, signature] = token.split(".");
    const replacement = signature.startsWith("A") ? "B" : "A";
    const tampered = `${payload}.${replacement}${signature.slice(1)}`;

    assert.equal(await verifySessionToken(tampered), null);
  });
});

test("signed session token rejects expired claims", async () => {
  await withEnv({ AUTH_SESSION_SECRET: TEST_SESSION_SECRET }, async () => {
    const { createSessionToken, verifySessionToken } = require("../src/lib/auth/session-token");
    const now = Math.floor(Date.now() / 1000);
    const token = await createSessionToken(baseClaims({ iat: now - 120, exp: now - 60 }));

    assert.equal(await verifySessionToken(token), null);
  });
});

test("production refuses a short session secret", async () => {
  await withEnv(
    { AUTH_SESSION_SECRET: "too-short", NODE_ENV: "production" },
    async () => {
      const { createSessionToken } = require("../src/lib/auth/session-token");
      await assert.rejects(() => createSessionToken(baseClaims()), /AUTH_SESSION_SECRET/u);
    }
  );
});

test("production refuses a missing session secret", async () => {
  await withEnv(
    { AUTH_SESSION_SECRET: undefined, NODE_ENV: "production" },
    async () => {
      const { createSessionToken } = require("../src/lib/auth/session-token");
      await assert.rejects(() => createSessionToken(baseClaims()), /AUTH_SESSION_SECRET/u);
    }
  );
});

test("signed session token rejects malformed and future-issued claims", async () => {
  await withEnv({ AUTH_SESSION_SECRET: TEST_SESSION_SECRET }, async () => {
    const { createSessionToken, verifySessionToken } = require("../src/lib/auth/session-token");
    const now = Math.floor(Date.now() / 1000);
    const token = await createSessionToken(baseClaims({ iat: now + 120, exp: now + 3600 }));

    assert.equal(await verifySessionToken("not-a-token"), null);
    assert.equal(await verifySessionToken(token), null);
  });
});

test("API access policy classifies public, checkout, protected, and admin paths", () => {
  const { classifyApiAccess } = require("../src/lib/auth/api-access-policy");
  const cases = new Map<string, string>([
    ["/api/auth/login", "public"],
    ["/api/auth/session", "public"],
    ["/api/auth/logout", "public"],
    ["/api/webhooks/polar", "public"],
    ["/api/oauth/google/callback", "public"],
    ["/api/integrations/gmail/callback", "public"],
    ["/api/payments/polar/checkout", "checkout"],
    ["/api/payments/polar/checkout/ch_123", "checkout"],
    ["/api/admin/audit-log", "admin"],
    ["/api/ai/chat", "protected"]
  ]);

  for (const [pathname, expected] of cases) {
    assert.equal(classifyApiAccess(pathname), expected, pathname);
  }
});

test("API access decision requires payment only for protected non-admin users", () => {
  const { decideApiAccess } = require("../src/lib/auth/api-access-policy");
  const now = Math.floor(Date.now() / 1000);
  const unpaid = baseClaims({ paid: false, iat: now, exp: now + 3600 });
  const paid = baseClaims({ paid: true, iat: now, exp: now + 3600 });
  const admin = baseClaims({
    email: "kara111131@naver.com",
    paid: false,
    iat: now,
    exp: now + 3600
  });

  assert.deepEqual(decideApiAccess("/api/ai/chat", null), {
    allowed: false,
    status: 401,
    code: "UNAUTHORIZED"
  });
  assert.deepEqual(decideApiAccess("/api/ai/chat", unpaid), {
    allowed: false,
    status: 402,
    code: "PAYMENT_REQUIRED"
  });
  assert.deepEqual(decideApiAccess("/api/ai/chat", paid), { allowed: true });
  assert.deepEqual(decideApiAccess("/api/payments/polar/checkout", unpaid), {
    allowed: true
  });
  assert.deepEqual(decideApiAccess("/api/admin/audit-log", admin), { allowed: true });
});

test("API access decision keeps public callbacks open and rejects unauthorized elevations", () => {
  const { decideApiAccess } = require("../src/lib/auth/api-access-policy");
  const now = Math.floor(Date.now() / 1000);
  const paidNonAdmin = baseClaims({ paid: true, iat: now, exp: now + 3600 });

  assert.deepEqual(decideApiAccess("/api/webhooks/polar", null), { allowed: true });
  assert.deepEqual(decideApiAccess("/api/payments/polar/checkout", null), {
    allowed: false,
    status: 401,
    code: "UNAUTHORIZED"
  });
  assert.deepEqual(decideApiAccess("/api/admin/audit-log", paidNonAdmin), {
    allowed: false,
    status: 403,
    code: "FORBIDDEN"
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
