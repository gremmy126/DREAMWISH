import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const STATE_SECRET = "oauth-state-test-secret-that-is-at-least-32-bytes";

test("social profile normalization requires provider email consent", () => {
  const { normalizeSocialProfile } = require("../src/lib/auth/social-oauth") as
    typeof import("../src/lib/auth/social-oauth");

  assert.throws(
    () => normalizeSocialProfile({ subject: "k1", email: null, name: "K", emailVerified: false }),
    /email consent/u
  );
  assert.deepEqual(
    normalizeSocialProfile({ subject: "n1", email: " Member@Example.com ", name: " Naver ", emailVerified: true }),
    { subject: "n1", email: "member@example.com", name: "Naver", emailVerified: true }
  );
});

test("OAuth login state is provider-bound, one-time, expiring, and durable", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dreamwish-social-state-"));
  try {
    await withEnv({ DATA_DIR: dataDir, DATABASE_URL: undefined, AUTH_OAUTH_STATE_SECRET: STATE_SECRET }, async () => {
      const stateModule = require("../src/lib/auth/oauth-login-state") as
        typeof import("../src/lib/auth/oauth-login-state");
      const now = new Date("2026-07-17T00:00:00.000Z");
      const issued = await stateModule.issueOAuthLoginState({ provider: "kakao", pendingCouponHash: "a".repeat(64), now });

      await assert.rejects(
        () => stateModule.consumeOAuthLoginState({ provider: "naver", state: issued.state, cookie: issued.cookie, now }),
        /state/u
      );
      const consumed = await stateModule.consumeOAuthLoginState({ provider: "kakao", state: issued.state, cookie: issued.cookie, now });
      assert.equal(consumed.pendingCouponHash, "a".repeat(64));
      await assert.rejects(
        () => stateModule.consumeOAuthLoginState({ provider: "kakao", state: issued.state, cookie: issued.cookie, now }),
        /used|state/u
      );
    });
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("Kakao and Naver authorization URLs use server-only configured callbacks", async () => {
  await withEnv({
    KAKAO_CLIENT_ID: "kakao-client",
    KAKAO_CLIENT_SECRET: "kakao-secret",
    KAKAO_REDIRECT_URI: "https://dreamwish.co.kr/api/auth/oauth/kakao/callback",
    NAVER_CLIENT_ID: "naver-client",
    NAVER_CLIENT_SECRET: "naver-secret",
    NAVER_REDIRECT_URI: "https://dreamwish.co.kr/api/auth/oauth/naver/callback"
  }, async () => {
    const { createSocialAuthorizationUrl } = require("../src/lib/auth/social-oauth") as
      typeof import("../src/lib/auth/social-oauth");
    const kakao = new URL(createSocialAuthorizationUrl("kakao", "state-k"));
    const naver = new URL(createSocialAuthorizationUrl("naver", "state-n"));

    assert.equal(kakao.origin, "https://kauth.kakao.com");
    assert.equal(kakao.searchParams.get("state"), "state-k");
    assert.match(kakao.searchParams.get("scope") || "", /account_email/u);
    assert.equal(naver.origin, "https://nid.naver.com");
    assert.equal(naver.searchParams.get("state"), "state-n");
  });
});

async function withEnv(values: Record<string, string | undefined>, run: () => void | Promise<void>) {
  const original = { ...process.env };
  process.env = { ...original };
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  try { await run(); } finally { process.env = original; }
}

