import assert from "node:assert/strict";
import fs from "node:fs";

test("social OAuth start and callback keep secrets server-side and issue DREAMWISH sessions", () => {
  const start = fs.readFileSync("app/api/auth/oauth/[provider]/start/route.ts", "utf8");
  const callback = fs.readFileSync("app/api/auth/oauth/[provider]/callback/route.ts", "utf8");

  assert.match(start, /issueOAuthLoginState/u);
  assert.match(start, /assertSameOriginMutation/u);
  assert.match(start, /httpOnly:\s*true/u);
  assert.match(callback, /consumeOAuthLoginState/u);
  assert.match(callback, /exchangeSocialCode/u);
  assert.match(callback, /fetchSocialProfile/u);
  assert.match(callback, /createSessionToken/u);
  assert.match(callback, /SESSION_COOKIE_NAME/u);
  assert.doesNotMatch(callback, /accessToken.*cookies\.set/u);
});

test("login UI replaces Google and GitHub with Kakao, Naver, and coupon input", () => {
  const dialog = fs.readFileSync("components/auth/LoginDialog.tsx", "utf8");
  const gate = fs.readFileSync("components/auth/AuthGate.tsx", "utf8");

  assert.doesNotMatch(dialog, /Google로 계속하기|GitHub로 계속하기/u);
  assert.doesNotMatch(gate, /signInWithFirebaseGoogle|signInWithFirebaseGithub/u);
  assert.match(dialog, /카카오로 계속하기/u);
  assert.match(dialog, /네이버로 계속하기/u);
  assert.match(dialog, /쿠폰 코드/u);
  assert.match(gate, /startSocialLogin/u);
  assert.match(gate, /\/api\/auth\/oauth\/\$\{provider\}\/start/u);
});

test("AuthGate restores a valid server OAuth session without a Firebase user", () => {
  const source = fs.readFileSync("components/auth/AuthGate.tsx", "utf8");

  assert.match(source, /fetch\("\/api\/auth\/me"/u);
  assert.match(source, /serverOnlySessionRef/u);
  assert.match(source, /if \(serverOnlySessionRef\.current\) return/u);
});

