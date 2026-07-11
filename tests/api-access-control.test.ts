import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

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
    ["/api", "protected"],
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

test("Firebase lookup requires localId and returns canonical uid", async () => {
  await withEnv({ NEXT_PUBLIC_FIREBASE_API_KEY: "firebase-test-key" }, async () => {
    const originalFetch = globalThis.fetch;
    const { verifyFirebaseIdToken } = requireProjectModule<
      typeof import("../src/lib/firebase/firebase-server-auth")
    >("src/lib/firebase/firebase-server-auth.ts");

    try {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            users: [
              {
                localId: "firebase-uid-123",
                email: "verified@example.com",
                displayName: "Verified User",
                providerUserInfo: [{ providerId: "google.com" }]
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );

      assert.deepEqual(await verifyFirebaseIdToken("verified-token"), {
        uid: "firebase-uid-123",
        email: "verified@example.com",
        name: "Verified User",
        providerUserInfo: [{ providerId: "google.com" }]
      });

      globalThis.fetch = async () =>
        new Response(JSON.stringify({ users: [{ email: "verified@example.com" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });

      await assert.rejects(
        () => verifyFirebaseIdToken("token-without-local-id"),
        /Firebase authentication failed/u
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("auth routes reject email-only identity with 401", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dreamwish-auth-missing-token-"));
  try {
    await withEnv(
      { DATA_DIR: dataDir, AUTH_SESSION_SECRET: TEST_SESSION_SECRET },
      async () => {
        const loginRoute = requireProjectModule<typeof import("../app/api/auth/login/route")>(
          "app/api/auth/login/route.ts"
        );
        const sessionRoute = requireProjectModule<
          typeof import("../app/api/auth/session/route")
        >("app/api/auth/session/route.ts");
        const requestBody = JSON.stringify({
          email: "kara111131@naver.com",
          name: "Forged Admin"
        });

        const loginResponse = await loginRoute.POST(
          new Request("http://localhost/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: requestBody
          })
        );
        const sessionResponse = await sessionRoute.POST(
          new Request("http://localhost/api/auth/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: requestBody
          })
        );

        assert.equal(loginResponse.status, 401);
        assert.equal(sessionResponse.status, 401);
      }
    );
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("verified auth routes use canonical Firebase claims and set hardened session cookies", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dreamwish-auth-cookie-"));
  const originalFetch = globalThis.fetch;
  try {
    await withEnv(
      {
        DATA_DIR: dataDir,
        AUTH_SESSION_SECRET: TEST_SESSION_SECRET,
        NEXT_PUBLIC_FIREBASE_API_KEY: "firebase-test-key",
        NODE_ENV: "production"
      },
      async () => {
        globalThis.fetch = async () =>
          new Response(
            JSON.stringify({
              users: [
                {
                  localId: "canonical-firebase-uid",
                  email: "canonical@example.com",
                  displayName: "Canonical Name",
                  providerUserInfo: [{ providerId: "password" }]
                }
              ]
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );

        const loginRoute = requireProjectModule<typeof import("../app/api/auth/login/route")>(
          "app/api/auth/login/route.ts"
        );
        const sessionRoute = requireProjectModule<
          typeof import("../app/api/auth/session/route")
        >("app/api/auth/session/route.ts");
        const forgedBody = {
          idToken: "verified-token",
          email: "kara111131@naver.com",
          name: "Forged Admin"
        };
        const loginResponse = await loginRoute.POST(
          new Request("http://localhost/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(forgedBody)
          })
        );
        const loginJson = (await loginResponse.json()) as {
          account?: { email?: string; name?: string | null };
          access?: { email?: string; role?: string };
        };

        assert.equal(loginResponse.status, 200);
        assert.equal(loginJson.account?.email, "canonical@example.com");
        assert.equal(loginJson.account?.name, "Canonical Name");
        assert.equal(loginJson.access?.email, "canonical@example.com");
        assert.equal(loginJson.access?.role, "user");
        await assertHardenedSessionCookie(loginResponse);

        const sessionResponse = await sessionRoute.POST(
          new Request("http://localhost/api/auth/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(forgedBody)
          })
        );
        const sessionJson = (await sessionResponse.json()) as {
          access?: { email?: string; role?: string };
        };

        assert.equal(sessionResponse.status, 200);
        assert.equal(sessionJson.access?.email, "canonical@example.com");
        assert.equal(sessionJson.access?.role, "user");
        await assertHardenedSessionCookie(sessionResponse);
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("logout clears the hardened session cookie", async () => {
  await withEnv({ NODE_ENV: "production" }, async () => {
    const logoutRoute = requireProjectModule<typeof import("../app/api/auth/logout/route")>(
      "app/api/auth/logout/route.ts"
    );
    const response = await logoutRoute.POST();
    const cookie = response.headers.get("set-cookie") || "";

    assert.equal(response.status, 200);
    assert.match(cookie, /dreamwish-session=/iu);
    assert.match(cookie, /HttpOnly/iu);
    assert.match(cookie, /SameSite=lax/iu);
    assert.match(cookie, /Path=\//iu);
    assert.match(cookie, /Max-Age=0/iu);
    assert.match(cookie, /Secure/iu);
  });
});

test("middleware enforces signed session access and ignores forged admin headers", async () => {
  await withEnv({ AUTH_SESSION_SECRET: TEST_SESSION_SECRET }, async () => {
    const { NextRequest } = require("next/server") as typeof import("next/server");
    const middlewareModule = requireProjectModule<typeof import("../middleware")>("middleware.ts");
    const { createSessionToken, SESSION_COOKIE_NAME } = require("../src/lib/auth/session-token");
    const unpaidToken = await createSessionToken(baseClaims({ paid: false }));
    const paidToken = await createSessionToken(baseClaims({ paid: true }));
    const adminToken = await createSessionToken(
      baseClaims({ email: "kara111131@naver.com", paid: false })
    );

    const unauthorized = await middlewareModule.middleware(
      new NextRequest("http://localhost/api/ai/chat")
    );
    assert.equal(unauthorized.status, 401);
    assert.deepEqual(await unauthorized.json(), {
      ok: false,
      error: { code: "UNAUTHORIZED", message: "Authentication is required." }
    });

    const unpaid = await middlewareModule.middleware(
      apiRequest("/api/ai/chat", SESSION_COOKIE_NAME, unpaidToken)
    );
    assert.equal(unpaid.status, 402);

    const paid = await middlewareModule.middleware(
      apiRequest("/api/ai/chat", SESSION_COOKIE_NAME, paidToken)
    );
    assert.equal(paid.headers.get("x-middleware-next"), "1");

    const forgedAdmin = await middlewareModule.middleware(
      apiRequest("/api/admin/audit-log", SESSION_COOKIE_NAME, paidToken, {
        "x-dreamwish-admin": "true"
      })
    );
    assert.equal(forgedAdmin.status, 403);

    const admin = await middlewareModule.middleware(
      apiRequest("/api/admin/audit-log", SESSION_COOKIE_NAME, adminToken)
    );
    assert.equal(admin.headers.get("x-middleware-next"), "1");
  });
});

test("auth UI restores only from Firebase and logs out server sessions", () => {
  const authGate = fs.readFileSync("components/auth/AuthGate.tsx", "utf8");
  const restoreSource = authGate.slice(
    authGate.indexOf("async function restoreSession"),
    authGate.indexOf("async function login")
  );

  assert.doesNotMatch(restoreSource, /localStorage\.getItem\(AUTH_SESSION_KEY\)/u);
  assert.doesNotMatch(restoreSource, /fetchAccess\(session\.email/u);
  assert.match(restoreSource, /waitForFirebaseUser/u);
  assert.match(restoreSource, /localStorage\.removeItem\(AUTH_SESSION_KEY\)/u);
  assert.match(authGate, /fetch\("\/api\/auth\/logout"/u);
  assert.doesNotMatch(authGate, /let idToken: string \| undefined/u);
  assert.match(authGate, /if \(!firebaseAuth\)/u);
});

test("all client session refreshes require a Firebase ID token", () => {
  const sidebar = fs.readFileSync("components/layout/Sidebar.tsx", "utf8");

  assert.match(sidebar, /waitForFirebaseUser/u);
  assert.match(sidebar, /getIdToken\(\)/u);
  assert.match(sidebar, /body: JSON\.stringify\(\{ idToken \}\)/u);
  assert.doesNotMatch(sidebar, /body: JSON\.stringify\(\{ email: session\.email \}\)/u);
});

test("the topbar logout clears Firebase and server sessions", () => {
  const topbar = fs.readFileSync("components/layout/Topbar.tsx", "utf8");

  assert.match(topbar, /logoutFirebaseUser/u);
  assert.match(topbar, /fetch\("\/api\/auth\/logout", \{ method: "POST" \}\)/u);
});

test("middleware matcher covers APIs and audit route has no header bypass", () => {
  const middlewareSource = fs.readFileSync("middleware.ts", "utf8");
  const auditRoute = fs.readFileSync("app/api/admin/audit-log/route.ts", "utf8");

  assert.match(middlewareSource, /matcher:\s*\[?"\/api\/:path\*"/u);
  assert.doesNotMatch(middlewareSource, /x-dreamwish-admin/u);
  assert.doesNotMatch(auditRoute, /x-dreamwish-admin/u);
  assert.match(auditRoute, /listAuditLogEntries\("admin"\)/u);
});

async function assertHardenedSessionCookie(response: Response) {
  const cookie = response.headers.get("set-cookie") || "";
  assert.match(cookie, /dreamwish-session=/iu);
  assert.match(cookie, /HttpOnly/iu);
  assert.match(cookie, /SameSite=lax/iu);
  assert.match(cookie, /Path=\//iu);
  assert.match(cookie, /Max-Age=3600/iu);
  assert.match(cookie, /Secure/iu);

  const token = cookie.match(/dreamwish-session=([^;]+)/iu)?.[1] || "";
  const { verifySessionToken } = require("../src/lib/auth/session-token");
  const claims = await verifySessionToken(token);
  assert.equal(claims?.uid, "canonical-firebase-uid");
  assert.equal(claims?.email, "canonical@example.com");
  assert.equal(claims?.name, "Canonical Name");
}

function apiRequest(
  pathname: string,
  cookieName: string,
  token: string,
  headers: Record<string, string> = {}
) {
  const { NextRequest } = require("next/server") as typeof import("next/server");
  return new NextRequest(`http://localhost${pathname}`, {
    headers: { ...headers, cookie: `${cookieName}=${token}` }
  });
}

function requireProjectModule<T>(relativePath: string): T {
  const moduleLoader = require("node:module") as {
    _resolveFilename: (
      request: string,
      parent: unknown,
      isMain: boolean,
      options?: unknown
    ) => string;
  };
  const originalResolve = moduleLoader._resolveFilename;
  moduleLoader._resolveFilename = function resolveProjectAlias(
    request: string,
    parent: unknown,
    isMain: boolean,
    options?: unknown
  ) {
    const mapped = request.startsWith("@/")
      ? path.join(process.cwd(), request.slice(2))
      : request;
    return originalResolve.call(this, mapped, parent, isMain, options);
  };

  try {
    return require(path.join(process.cwd(), relativePath)) as T;
  } finally {
    moduleLoader._resolveFilename = originalResolve;
  }
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
