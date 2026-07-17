import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateTotpCode } from "../src/lib/auth/totp";
import {
  beginTotpEnrollment,
  confirmTotpEnrollment
} from "../src/lib/auth/totp.service";
import { classifyApiAccess } from "../src/lib/auth/api-access-policy";

const SESSION_SECRET = "test-session-secret-that-is-at-least-32-bytes";
const ENCRYPTION_KEY = Buffer.alloc(32, 0x31).toString("base64");
const HASH_KEY = Buffer.alloc(32, 0x72).toString("base64");
const MFA_CHALLENGE_SECRET = Buffer.alloc(32, 0x4d).toString("base64");
const SESSION_COOKIE = "dreamwish-session";
const CHALLENGE_COOKIE = "dreamwish-mfa-challenge";

test("MFA challenge tokens are purpose-bound, signed, and expire after five minutes", async () => {
  await withMfaEnv(async () => {
    const {
      mintMfaChallengeToken,
      verifyMfaChallengeToken,
      MFA_CHALLENGE_COOKIE_NAME,
      MFA_CHALLENGE_TTL_SECONDS
    } = require("../src/lib/auth/mfa-challenge-token");
    const now = Date.parse("2026-07-17T00:00:00.000Z");
    const minted = mintMfaChallengeToken({ accountId: "token-account", now });

    assert.equal(MFA_CHALLENGE_COOKIE_NAME, CHALLENGE_COOKIE);
    assert.equal(MFA_CHALLENGE_TTL_SECONDS, 300);
    assert.equal(minted.expiresAt, new Date(now + 300_000).toISOString());

    const valid = verifyMfaChallengeToken({ token: minted.token, now: now + 299_000 });
    assert.equal(valid.ok, true);
    assert.equal(valid.accountId, "token-account");
    assert.equal(valid.challengeHash, minted.challengeHash);
    assert.doesNotMatch(minted.token, /token-account.*[A-Za-z0-9+/=]{40}/u);

    const expired = verifyMfaChallengeToken({ token: minted.token, now: now + 301_000 });
    assert.deepEqual({ ok: expired.ok, reason: expired.reason }, { ok: false, reason: "expired" });

    const [payload, signature] = minted.token.split(".");
    const tamperedSignature = `${payload}.${signature.startsWith("A") ? "B" : "A"}${signature.slice(1)}`;
    assert.equal(verifyMfaChallengeToken({ token: tamperedSignature, now }).ok, false);

    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...decoded, accountId: "someone-else" }),
      "utf8"
    ).toString("base64url");
    assert.equal(verifyMfaChallengeToken({ token: `${forgedPayload}.${signature}`, now }).ok, false);

    const otherSecretToken = await withEnvValues(
      { AUTH_MFA_CHALLENGE_SECRET: Buffer.alloc(32, 0x5a).toString("base64") },
      () => mintMfaChallengeToken({ accountId: "token-account", now }).token
    );
    assert.equal(verifyMfaChallengeToken({ token: otherSecretToken, now }).ok, false);
  });
});

test("PostgreSQL serializes login challenge issuance per account", () => {
  const source = fs.readFileSync("src/lib/auth/totp.repository.ts", "utf8");
  const postgres = source.slice(source.indexOf("export class PostgresTotpSecurityRepository"));
  const issuance = postgres.slice(
    postgres.indexOf("async createLoginChallenge"),
    postgres.indexOf("async peekLoginChallenge")
  );

  const lockIndex = issuance.indexOf("pg_advisory_xact_lock");
  const accountScopeIndex = issuance.indexOf("`totp:${input.accountId}`");
  const invalidationIndex = issuance.indexOf("UPDATE account_totp_challenges");
  assert.notEqual(lockIndex, -1, "expected an account-scoped PostgreSQL issuance lock");
  assert.ok(
    accountScopeIndex > lockIndex && accountScopeIndex < invalidationIndex,
    "issuance lock must be scoped to the account"
  );
  assert.ok(lockIndex < invalidationIndex, "issuance must lock before invalidating active challenges");
});

test("password login without an authenticator issues the normal full session", async () => {
  await withMfaEnv(async () => {
    await withFirebaseUser("plain-user-1", "plain@example.com", async () => {
      const response = await callLoginRoute();
      const json = (await response.json()) as { ok?: boolean; mfaRequired?: boolean };

      assert.equal(response.status, 200);
      assert.equal(json.ok, true);
      assert.notEqual(json.mfaRequired, true);
      const sessionCookie = findSetCookie(response, SESSION_COOKIE);
      assert.ok(sessionCookie, "expected a dreamwish-session cookie");
      assert.match(sessionCookie, /httponly/iu);
      assert.match(sessionCookie, /secure/iu);
      assert.equal(findSetCookie(response, CHALLENGE_COOKIE), null);
    });
  });
});

test("password login with an active authenticator sets only the five-minute MFA challenge cookie", async () => {
  await withMfaEnv(async (dataDir) => {
    await enrollAuthenticator("mfa-user-1", "mfa-user@example.com");
    await withFirebaseUser("mfa-user-1", "mfa-user@example.com", async () => {
      const response = await callLoginRoute(`${SESSION_COOKIE}=pre-existing-session`);
      const json = (await response.json()) as {
        ok?: boolean;
        mfaRequired?: boolean;
        account?: unknown;
        access?: unknown;
      };

      assert.equal(response.status, 200);
      assert.equal(json.ok, true);
      assert.equal(json.mfaRequired, true);
      assert.equal(json.account, undefined);
      assert.equal(json.access, undefined);

      assert.match(findSetCookie(response, SESSION_COOKIE) || "", /max-age=0/iu);
      const challengeCookie = findSetCookie(response, CHALLENGE_COOKIE);
      assert.ok(challengeCookie, "expected a dreamwish-mfa-challenge cookie");
      assert.match(challengeCookie, /httponly/iu);
      assert.match(challengeCookie, /secure/iu);
      assert.match(challengeCookie, /samesite=lax/iu);
      assert.match(challengeCookie, /path=\//iu);
      assert.match(challengeCookie, /max-age=300/iu);

      const token = cookieValue(challengeCookie);
      const { verifySessionToken } = require("../src/lib/auth/session-token");
      assert.equal(await verifySessionToken(token), null);

      const persisted = fs.readFileSync(path.join(dataDir, "auth-security.json"), "utf8");
      assert.equal(persisted.includes(token), false);
      const payload = JSON.parse(
        Buffer.from(token.split(".")[0], "base64url").toString("utf8")
      ) as { nonce?: string };
      assert.ok(payload.nonce, "challenge token must carry a random nonce");
      assert.equal(persisted.includes(String(payload.nonce)), false);
    });
  });
});

test("Firebase session refresh with an active authenticator is gated behind MFA", async () => {
  await withMfaEnv(async () => {
    await enrollAuthenticator("mfa-user-2", "mfa-user-2@example.com");
    await withFirebaseUser("mfa-user-2", "mfa-user-2@example.com", async () => {
      const sessionRoute = requireProjectModule<{ POST(request: Request): Promise<Response> }>(
        "app/api/auth/session/route.ts"
      );
      const response = await sessionRoute.POST(
        new Request("http://localhost/api/auth/session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: `${SESSION_COOKIE}=pre-existing-session`
          },
          body: JSON.stringify({ idToken: "verified-token" })
        })
      );
      const json = (await response.json()) as { ok?: boolean; mfaRequired?: boolean; access?: unknown };

      assert.equal(response.status, 200);
      assert.equal(json.ok, true);
      assert.equal(json.mfaRequired, true);
      assert.equal(json.access, undefined);
      assert.match(findSetCookie(response, SESSION_COOKIE) || "", /max-age=0/iu);
      assert.ok(findSetCookie(response, CHALLENGE_COOKIE));
    });
  });
});

test("every primary authentication path issues sessions only through completePrimaryAuthentication", () => {
  const login = fs.readFileSync("app/api/auth/login/route.ts", "utf8");
  const session = fs.readFileSync("app/api/auth/session/route.ts", "utf8");
  const callback = fs.readFileSync("app/api/auth/oauth/[provider]/callback/route.ts", "utf8");

  for (const [name, source] of [
    ["login", login],
    ["session", session],
    ["callback", callback]
  ] as const) {
    assert.match(source, /completePrimaryAuthentication/u, name);
    assert.doesNotMatch(source, /createSessionToken/u, name);
  }
  assert.match(callback, /new URL\("\/\?oauth_login=mfa_required", origin\)/u);
  assert.doesNotMatch(callback, /mfa_required[^\n]*\$\{/u);
  assert.doesNotMatch(callback, /searchParams\.set\([^)]*token/iu);
});

test("Kakao and Naver MFA callbacks clear a pre-existing full session", async () => {
  await withMfaEnv(async () => {
    await withEnvValues(
      {
        AUTH_OAUTH_STATE_SECRET: "test-oauth-state-secret-that-is-at-least-32-bytes",
        KAKAO_CLIENT_ID: "kakao-client-id",
        KAKAO_CLIENT_SECRET: "kakao-client-secret",
        KAKAO_REDIRECT_URI: "https://dreamwish.co.kr/api/auth/oauth/kakao/callback",
        NAVER_CLIENT_ID: "naver-client-id",
        NAVER_CLIENT_SECRET: "naver-client-secret",
        NAVER_REDIRECT_URI: "https://dreamwish.co.kr/api/auth/oauth/naver/callback",
        NEXT_PUBLIC_APP_URL: "https://dreamwish.co.kr"
      },
      async () => {
        const { issueOAuthLoginState, OAUTH_LOGIN_STATE_COOKIE } = require(
          "../src/lib/auth/oauth-login-state"
        );
        const { getSocialAccountId } = require("../src/lib/auth/social-identity.service");
        const callbackRoute = requireProjectModule<{
          GET(
            request: Request,
            context: { params: Promise<{ provider: string }> }
          ): Promise<Response>;
        }>("app/api/auth/oauth/[provider]/callback/route.ts");

        for (const provider of ["kakao", "naver"] as const) {
          const subject = `${provider}-mfa-subject`;
          const email = `${provider}-mfa@example.com`;
          await enrollAuthenticator(getSocialAccountId(provider, subject), email);
          const issued = await issueOAuthLoginState({
            provider,
            pendingCouponHash: null
          });
          const response = await withSocialOAuthProfile(
            provider,
            { subject, email },
            () =>
              callbackRoute.GET(
                new Request(
                  `https://dreamwish.co.kr/api/auth/oauth/${provider}/callback?code=verified-code&state=${issued.state}`,
                  {
                    headers: {
                      cookie: `${OAUTH_LOGIN_STATE_COOKIE}=${encodeURIComponent(issued.cookie)}; ${SESSION_COOKIE}=pre-existing-session`
                    }
                  }
                ),
                { params: Promise.resolve({ provider }) }
              )
          );

          assert.match(response.headers.get("location") || "", /oauth_login=mfa_required/u);
          assert.ok(findSetCookie(response, CHALLENGE_COOKIE));
          assert.match(findSetCookie(response, SESSION_COOKIE) || "", /max-age=0/iu);
        }
      }
    );
  });
});

test("a valid TOTP code consumes the challenge and issues the full session", async () => {
  await withMfaEnv(async () => {
    const { secret } = await enrollAuthenticator("mfa-user-3", "mfa-user-3@example.com");
    await withFirebaseUser("mfa-user-3", "mfa-user-3@example.com", async () => {
      const loginResponse = await callLoginRoute();
      const challengeToken = cookieValue(findSetCookie(loginResponse, CHALLENGE_COOKIE) || "");
      assert.ok(challengeToken);

      const response = await callMfaVerifyRoute(challengeToken, {
        method: "totp",
        code: generateTotpCode({ secret, nowMs: Date.now() })
      });
      const json = (await response.json()) as { ok?: boolean; access?: { email?: string } };

      assert.equal(response.status, 200);
      assert.equal(json.ok, true);
      assert.equal(json.access?.email, "mfa-user-3@example.com");

      const sessionCookie = findSetCookie(response, SESSION_COOKIE);
      assert.ok(sessionCookie, "expected the full session cookie after MFA verification");
      const { verifySessionToken } = require("../src/lib/auth/session-token");
      const claims = await verifySessionToken(cookieValue(sessionCookie));
      assert.equal(claims?.uid, "mfa-user-3");
      assert.equal(claims?.email, "mfa-user-3@example.com");

      const clearedChallenge = findSetCookie(response, CHALLENGE_COOKIE);
      assert.ok(clearedChallenge, "expected the challenge cookie to be cleared");
      assert.match(clearedChallenge, /max-age=0/iu);

      const { listAuthSecurityAuditEvents } = require("../src/lib/auth/auth-security-audit");
      const actions = (await listAuthSecurityAuditEvents("mfa-user-3")).map(
        (event: { action: string }) => event.action
      );
      assert.ok(actions.includes("mfa_challenge_issued"));
      assert.ok(actions.includes("mfa_login_completed"));
    });
  });
});

test("a valid unused recovery code consumes the challenge and issues the full session", async () => {
  await withMfaEnv(async () => {
    const { recoveryCodes } = await enrollAuthenticator("mfa-user-4", "mfa-user-4@example.com");
    await withFirebaseUser("mfa-user-4", "mfa-user-4@example.com", async () => {
      const loginResponse = await callLoginRoute();
      const challengeToken = cookieValue(findSetCookie(loginResponse, CHALLENGE_COOKIE) || "");

      const response = await callMfaVerifyRoute(challengeToken, {
        method: "recovery",
        code: recoveryCodes[0]
      });

      assert.equal(response.status, 200);
      assert.ok(findSetCookie(response, SESSION_COOKIE));
      assert.match(findSetCookie(response, CHALLENGE_COOKIE) || "", /max-age=0/iu);
    });
  });
});

test("concurrent MFA verification consumes only the recovery code paired with the winning challenge request", async () => {
  await withMfaEnv(async () => {
    const { recoveryCodes } = await enrollAuthenticator(
      "mfa-user-atomic",
      "mfa-user-atomic@example.com"
    );
    await withFirebaseUser("mfa-user-atomic", "mfa-user-atomic@example.com", async () => {
      const loginResponse = await callLoginRoute();
      const challengeToken = cookieValue(
        findSetCookie(loginResponse, CHALLENGE_COOKIE) || ""
      );

      const attempts = await Promise.all(
        recoveryCodes.slice(0, 2).map((code) =>
          callMfaVerifyRoute(challengeToken, { method: "recovery", code })
        )
      );
      assert.deepEqual(
        attempts.map((response) => response.status).sort((left, right) => left - right),
        [200, 409]
      );

      const losingIndex = attempts.findIndex((response) => response.status === 409);
      assert.notEqual(losingIndex, -1);
      const retryLoginResponse = await callLoginRoute();
      const retryChallengeToken = cookieValue(
        findSetCookie(retryLoginResponse, CHALLENGE_COOKIE) || ""
      );
      const retry = await callMfaVerifyRoute(retryChallengeToken, {
        method: "recovery",
        code: recoveryCodes[losingIndex]
      });

      assert.equal(retry.status, 200);
      assert.ok(findSetCookie(retry, SESSION_COOKIE));
    });
  });
});

test("an unavailable account does not consume its MFA challenge or recovery code", async () => {
  await withMfaEnv(async () => {
    const accountId = "mfa-user-unavailable";
    const email = "mfa-user-unavailable@example.com";
    const { recoveryCodes } = await enrollAuthenticator(accountId, email);
    await withFirebaseUser(accountId, email, async () => {
      const loginResponse = await callLoginRoute();
      const challengeToken = cookieValue(
        findSetCookie(loginResponse, CHALLENGE_COOKIE) || ""
      );
      const { mutateOperationalAccount } = require(
        "../src/lib/admin/account-admin.repository"
      );
      await mutateOperationalAccount(accountId, { type: "suspend" });

      const rejected = await callMfaVerifyRoute(challengeToken, {
        method: "recovery",
        code: recoveryCodes[0]
      });
      assert.equal(rejected.status, 401);
      assert.equal(findSetCookie(rejected, SESSION_COOKIE), null);

      const { verifyMfaChallengeToken } = require("../src/lib/auth/mfa-challenge-token");
      const token = verifyMfaChallengeToken({ token: challengeToken });
      assert.equal(token.ok, true);
      const { getTotpSecurityRepository } = require("../src/lib/auth/totp.repository");
      assert.equal(
        await getTotpSecurityRepository().peekLoginChallenge({
          accountId,
          challengeHash: token.challengeHash,
          now: new Date().toISOString()
        }),
        "active"
      );

      const { listAuthSecurityAuditEvents } = require(
        "../src/lib/auth/auth-security-audit"
      );
      const events = await listAuthSecurityAuditEvents(accountId);
      assert.equal(
        events.some((event: { action: string }) => event.action === "mfa_login_completed"),
        false
      );
      assert.equal(
        events.some((event: { action: string }) => event.action === "recovery_code_used"),
        false
      );
      assert.equal(events.at(-1)?.action, "mfa_challenge_rejected");
      assert.deepEqual(
        events.at(-1)?.safeMetadata,
        { reason: "account_unavailable" }
      );

      await mutateOperationalAccount(accountId, { type: "restore" });
      const retryLogin = await callLoginRoute();
      const retryChallenge = cookieValue(
        findSetCookie(retryLogin, CHALLENGE_COOKIE) || ""
      );
      const retry = await callMfaVerifyRoute(retryChallenge, {
        method: "recovery",
        code: recoveryCodes[0]
      });
      assert.equal(retry.status, 200);
    });
  });
});

test("an expired MFA challenge fails closed with a Korean error", async () => {
  await withMfaEnv(async () => {
    const { secret } = await enrollAuthenticator("mfa-user-5", "mfa-user-5@example.com");
    const { mintMfaChallengeToken } = require("../src/lib/auth/mfa-challenge-token");
    const { getTotpSecurityRepository } = require("../src/lib/auth/totp.repository");
    const { createAuthSecurityAuditEvent } = require("../src/lib/auth/auth-security-audit");
    const mintedAt = Date.now() - 6 * 60_000;
    const minted = mintMfaChallengeToken({ accountId: "mfa-user-5", now: mintedAt });
    await getTotpSecurityRepository().createLoginChallenge({
      challengeId: "expired-challenge-id",
      accountId: "mfa-user-5",
      challengeHash: minted.challengeHash,
      expiresAt: minted.expiresAt,
      now: new Date(mintedAt).toISOString(),
      auditEvent: createAuthSecurityAuditEvent({
        accountId: "mfa-user-5",
        action: "mfa_challenge_issued",
        safeMetadata: { expiresAt: minted.expiresAt },
        now: new Date(mintedAt).toISOString()
      })
    });

    const response = await callMfaVerifyRoute(minted.token, {
      method: "totp",
      code: generateTotpCode({ secret, nowMs: Date.now() })
    });
    const json = (await response.json()) as { ok?: boolean; error?: string };

    assert.equal(response.status, 410);
    assert.equal(json.ok, false);
    assert.match(json.error || "", /만료/u);
    assert.equal(findSetCookie(response, SESSION_COOKIE), null);
    assert.match(findSetCookie(response, CHALLENGE_COOKIE) || "", /max-age=0/iu);
  });
});

test("a consumed MFA challenge cannot be replayed", async () => {
  await withMfaEnv(async () => {
    const { secret } = await enrollAuthenticator("mfa-user-6", "mfa-user-6@example.com");
    await withFirebaseUser("mfa-user-6", "mfa-user-6@example.com", async () => {
      const loginResponse = await callLoginRoute();
      const challengeToken = cookieValue(findSetCookie(loginResponse, CHALLENGE_COOKIE) || "");

      const first = await callMfaVerifyRoute(challengeToken, {
        method: "totp",
        code: generateTotpCode({ secret, nowMs: Date.now() })
      });
      assert.equal(first.status, 200);

      const replay = await callMfaVerifyRoute(challengeToken, {
        method: "totp",
        code: generateTotpCode({ secret, nowMs: Date.now() + 30_000 })
      });
      const json = (await replay.json()) as { ok?: boolean; error?: string };

      assert.equal(replay.status, 409);
      assert.equal(json.ok, false);
      assert.match(json.error || "", /이미 사용/u);
      assert.equal(findSetCookie(replay, SESSION_COOKIE), null);
    });
  });
});

test("a challenge minted for one account cannot complete for another account", async () => {
  await withMfaEnv(async () => {
    const { secret } = await enrollAuthenticator("mfa-owner-a", "mfa-owner-a@example.com");
    await enrollAuthenticator("mfa-owner-b", "mfa-owner-b@example.com");
    await withFirebaseUser("mfa-owner-a", "mfa-owner-a@example.com", async () => {
      const loginResponse = await callLoginRoute();
      const challengeToken = cookieValue(findSetCookie(loginResponse, CHALLENGE_COOKIE) || "");

      const [payload, signature] = challengeToken.split(".");
      const decoded = JSON.parse(
        Buffer.from(payload, "base64url").toString("utf8")
      ) as Record<string, unknown>;
      const forgedPayload = Buffer.from(
        JSON.stringify({ ...decoded, accountId: "mfa-owner-b" }),
        "utf8"
      ).toString("base64url");
      const forged = await callMfaVerifyRoute(`${forgedPayload}.${signature}`, {
        method: "totp",
        code: generateTotpCode({ secret, nowMs: Date.now() })
      });
      assert.equal(forged.status, 401);
      assert.equal(findSetCookie(forged, SESSION_COOKIE), null);

      const { verifyMfaChallengeToken } = require("../src/lib/auth/mfa-challenge-token");
      const verification = verifyMfaChallengeToken({ token: challengeToken });
      assert.equal(verification.ok, true);
      const { getTotpSecurityRepository } = require("../src/lib/auth/totp.repository");
      assert.equal(
        await getTotpSecurityRepository().peekLoginChallenge({
          accountId: "mfa-owner-b",
          challengeHash: verification.challengeHash,
          now: new Date().toISOString()
        }),
        "not_found"
      );
    });
  });
});

test("logout clears both the session and the MFA challenge cookies", async () => {
  await withMfaEnv(async () => {
    const logoutRoute = requireProjectModule<{ POST(): Promise<Response> }>(
      "app/api/auth/logout/route.ts"
    );
    const response = await logoutRoute.POST();

    assert.equal(response.status, 200);
    const sessionCookie = findSetCookie(response, SESSION_COOKIE);
    const challengeCookie = findSetCookie(response, CHALLENGE_COOKIE);
    assert.ok(sessionCookie, "expected the session cookie to be cleared");
    assert.ok(challengeCookie, "expected the MFA challenge cookie to be cleared");
    assert.match(sessionCookie, /max-age=0/iu);
    assert.match(challengeCookie, /max-age=0/iu);
    assert.match(challengeCookie, /httponly/iu);
  });
});

test("the MFA challenge cookie never grants API access outside its verification endpoint", async () => {
  await withMfaEnv(async () => {
    assert.equal(classifyApiAccess("/api/auth/mfa/verify"), "public");
    assert.equal(classifyApiAccess("/api/auth/mfa/verify/"), "public");
    assert.equal(classifyApiAccess("/api/ai/chat"), "protected");

    const { mintMfaChallengeToken } = require("../src/lib/auth/mfa-challenge-token");
    const challengeToken = mintMfaChallengeToken({
      accountId: "policy-account",
      now: Date.now()
    }).token;
    const { NextRequest } = require("next/server") as typeof import("next/server");
    const middlewareModule = requireProjectModule<typeof import("../middleware")>("middleware.ts");

    const withChallengeCookie = await middlewareModule.middleware(
      new NextRequest("http://localhost/api/ai/chat", {
        headers: { cookie: `${CHALLENGE_COOKIE}=${challengeToken}` }
      })
    );
    assert.equal(withChallengeCookie.status, 401);

    const challengeAsSession = await middlewareModule.middleware(
      new NextRequest("http://localhost/api/ai/chat", {
        headers: { cookie: `${SESSION_COOKIE}=${challengeToken}` }
      })
    );
    assert.equal(challengeAsSession.status, 401);
  });
});

async function enrollAuthenticator(accountId: string, email: string) {
  const enrolledAt = Date.now() - 120_000;
  const enrollment = await beginTotpEnrollment({
    account: { id: accountId, email },
    networkKey: `network-${accountId}-begin`,
    now: enrolledAt
  });
  const confirmation = await confirmTotpEnrollment({
    accountId,
    enrollmentId: enrollment.enrollmentId,
    code: generateTotpCode({ secret: enrollment.manualKey, nowMs: enrolledAt }),
    networkKey: `network-${accountId}-confirm`,
    now: enrolledAt
  });
  return { secret: enrollment.manualKey, recoveryCodes: confirmation.recoveryCodes };
}

async function callLoginRoute(cookieHeader?: string) {
  const loginRoute = requireProjectModule<{ POST(request: Request): Promise<Response> }>(
    "app/api/auth/login/route.ts"
  );
  return loginRoute.POST(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookieHeader ? { cookie: cookieHeader } : {})
      },
      body: JSON.stringify({ idToken: "verified-token" })
    })
  );
}

async function withSocialOAuthProfile<T>(
  provider: "kakao" | "naver",
  profile: { subject: string; email: string },
  run: () => T | Promise<T>
) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("/token")) {
      return new Response(JSON.stringify({ access_token: "social-access-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    const body =
      provider === "kakao"
        ? {
            id: profile.subject,
            kakao_account: {
              email: profile.email,
              is_email_valid: true,
              is_email_verified: true,
              profile: { nickname: "MFA User" }
            }
          }
        : {
            response: {
              id: profile.subject,
              email: profile.email,
              name: "MFA User"
            }
          };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function callMfaVerifyRoute(
  challengeToken: string,
  body: { method: string; code: string }
) {
  const verifyRoute = requireProjectModule<{ POST(request: Request): Promise<Response> }>(
    "app/api/auth/mfa/verify/route.ts"
  );
  return verifyRoute.POST(
    new Request("http://localhost/api/auth/mfa/verify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `${CHALLENGE_COOKIE}=${challengeToken}`
      },
      body: JSON.stringify(body)
    })
  );
}

async function withFirebaseUser(
  localId: string,
  email: string,
  run: () => Promise<void>
) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        users: [
          {
            localId,
            email,
            displayName: null,
            providerUserInfo: [{ providerId: "password" }]
          }
        ]
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function findSetCookie(response: Response, name: string): string | null {
  for (const cookie of readSetCookies(response)) {
    if (cookie.trim().toLowerCase().startsWith(`${name.toLowerCase()}=`)) return cookie;
  }
  return null;
}

function readSetCookies(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie();
  const combined = response.headers.get("set-cookie");
  return combined ? combined.split(/,(?=\s*[A-Za-z0-9_-]+=)/u) : [];
}

function cookieValue(setCookie: string): string {
  const first = setCookie.split(";")[0] || "";
  return first.slice(first.indexOf("=") + 1).trim();
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

async function withEnvValues<T>(
  values: Record<string, string | undefined>,
  run: () => T | Promise<T>
): Promise<T> {
  const original = { ...process.env };
  process.env = { ...original };
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await run();
  } finally {
    process.env = original;
  }
}

async function withMfaEnv(run: (dataDir: string) => void | Promise<void>) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dreamwish-mfa-gating-"));
  const original = { ...process.env };
  process.env = {
    ...original,
    DATA_DIR: dataDir,
    AUTH_SESSION_SECRET: SESSION_SECRET,
    AUTH_TOTP_ENCRYPTION_KEY: ENCRYPTION_KEY,
    AUTH_SECURITY_HASH_KEY: HASH_KEY,
    AUTH_MFA_CHALLENGE_SECRET: MFA_CHALLENGE_SECRET,
    NEXT_PUBLIC_FIREBASE_API_KEY: "firebase-test-key",
    NODE_ENV: "production"
  };
  delete process.env.DATABASE_URL;
  try {
    await run(dataDir);
  } finally {
    process.env = original;
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}
