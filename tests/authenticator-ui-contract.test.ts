import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const TEST_SESSION_SECRET = "task-five-session-secret-that-is-at-least-32-bytes";

const ROUTES = [
  ["status", "GET"],
  ["enroll", "POST"],
  ["verify-enrollment", "POST"],
  ["recovery-codes", "POST"],
  ["disable", "POST"]
] as const;

test("authenticator Settings routes require the signed-in owner", async () => {
  for (const [name, method] of ROUTES) {
    const routePath = `app/api/auth/totp/${name}/route.ts`;
    assert.equal(fs.existsSync(routePath), true, `${routePath} must exist`);
    const route = requireProjectModule<Record<
      string,
      (request: Request) => Promise<Response>
    >>(`app/api/auth/totp/${name}/route.ts`);
    const response = await route[method](
      new Request(`http://localhost/api/auth/totp/${name}`, {
        method,
        headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
        body: method === "POST" ? "{}" : undefined
      })
    );
    const body = (await response.json()) as { code?: string };

    assert.equal(response.status, 401, `${name} must reject an unsigned request`);
    assert.equal(body.code, "AUTH_REQUIRED");
  }
});

test("recovery regeneration and disable reject sessions older than five minutes", async () => {
  await withEnv({ AUTH_SESSION_SECRET: TEST_SESSION_SECRET }, async () => {
    const { createSessionToken, SESSION_COOKIE_NAME } = require(
      "../src/lib/auth/session-token"
    ) as typeof import("../src/lib/auth/session-token");
    const now = Math.floor(Date.now() / 1000);
    const token = await createSessionToken({
      uid: "stale-owner",
      email: "stale-owner@example.com",
      paid: true,
      iat: now - 301,
      exp: now + 3_000
    });

    for (const name of ["recovery-codes", "disable"] as const) {
      const route = requireProjectModule<{
        POST: (request: Request) => Promise<Response>;
      }>(`app/api/auth/totp/${name}/route.ts`);
      const response = await route.POST(
        new Request(`http://localhost/api/auth/totp/${name}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            cookie: `${SESSION_COOKIE_NAME}=${token}`
          },
          body: JSON.stringify({ currentTotpCode: "123456" })
        })
      );
      const body = (await response.json()) as { code?: string; error?: string };

      assert.equal(response.status, 401);
      assert.equal(body.code, "PRIMARY_REAUTH_REQUIRED");
      assert.match(body.error || "", /다시 로그인/u);
    }
  });
});

test("authenticator routes delegate owner-scoped mutations to the existing TOTP service", () => {
  const status = source("app/api/auth/totp/status/route.ts");
  const enroll = source("app/api/auth/totp/enroll/route.ts");
  const verifyEnrollment = source("app/api/auth/totp/verify-enrollment/route.ts");
  const recovery = source("app/api/auth/totp/recovery-codes/route.ts");
  const disable = source("app/api/auth/totp/disable/route.ts");

  assert.match(status, /getTotpFactorStatus\(owner\.uid\)/u);
  assert.match(enroll, /beginTotpEnrollment/u);
  assert.match(enroll, /account:\s*\{\s*id:\s*owner\.uid,\s*email:\s*owner\.email\s*\}/u);
  assert.match(verifyEnrollment, /confirmTotpEnrollment/u);
  assert.match(verifyEnrollment, /accountId:\s*owner\.uid/u);
  assert.match(recovery, /regenerateRecoveryCodes/u);
  assert.match(recovery, /accountId:\s*owner\.uid/u);
  assert.match(recovery, /currentTotpCode/u);
  assert.match(disable, /disableTotp/u);
  assert.match(disable, /accountId:\s*owner\.uid/u);
  assert.match(disable, /currentTotpCode/u);
});

test("Settings enrollment renders only the returned otpauth URI in the QR and keeps secrets ephemeral", () => {
  const card = source("components/Settings/AuthenticatorSettingsCard.tsx");
  const settings = source("components/Settings/SettingsView.tsx");

  assert.match(settings, /AuthenticatorSettingsCard/u);
  assert.match(card, /QRCodeSVG/u);
  assert.match(card, /value=\{enrollment\.otpauthUri\}/u);
  assert.match(card, /navigator\.clipboard\.writeText\(enrollment\.manualKey\)/u);
  assert.match(card, /disabled|pending|active/u);
  assert.match(card, /recoveryCodes/u);
  assert.match(card, /setRecoveryCodes\(null\)/u);
  assert.match(card, /복구 코드를 안전하게 보관했습니다/u);
  assert.doesNotMatch(card, /localStorage|sessionStorage/u);
  assert.doesNotMatch(card, /value=\{enrollment\.manualKey\}/u);
});

test("authenticator Settings UI has six-digit input, one-time recovery acknowledgement, and accessible controls", () => {
  const card = source("components/Settings/AuthenticatorSettingsCard.tsx");

  assert.match(card, /inputMode="numeric"/u);
  assert.match(card, /pattern="\[0-9\]\{6\}"/u);
  assert.match(card, /aria-live="polite"/u);
  assert.match(card, /role="status"/u);
  assert.match(card, /\.focus\(\)/u);
  assert.match(card, /h-11/u);
  assert.match(card, /복구 코드 다시 만들기/u);
  assert.match(card, /인증기 사용 중지/u);
});

test("MFA errors provide actionable Korean messages for invalid, expired, replayed, rate-limited, and clock-drift cases", () => {
  const dialog = source("components/auth/MfaChallengeDialog.tsx");

  const cases = [
    ["TOTP_INVALID_CODE", "올바르지"],
    ["TOTP_ENROLLMENT_EXPIRED", "만료"],
    ["MFA_CHALLENGE_EXPIRED", "만료"],
    ["TOTP_CODE_REPLAYED", "이미 사용"],
    ["TOTP_RATE_LIMITED", "너무 많"],
    ["TOTP_CLOCK_DRIFT", "시간"]
  ] as const;
  for (const [code, expected] of cases) {
    assert.match(dialog, new RegExp(`${code}:\\s*"[^"]*${expected}`, "u"));
  }
});

test("MFA challenge switches between six-digit authenticator and recovery code without persistence", () => {
  const dialog = source("components/auth/MfaChallengeDialog.tsx");

  assert.match(dialog, /type MfaMethod = "totp" \| "recovery"/u);
  assert.match(dialog, /인증 코드/u);
  assert.match(dialog, /복구 코드/u);
  assert.match(dialog, /inputMode=\{method === "totp" \? "numeric" : "text"\}/u);
  assert.match(dialog, /fetch\("\/api\/auth\/mfa\/verify"/u);
  assert.match(dialog, /aria-modal="true"/u);
  assert.match(dialog, /aria-live="polite"/u);
  assert.match(dialog, /\.focus\(\)/u);
  assert.match(dialog, /h-11|h-12/u);
  assert.match(dialog, /submittingRef\.current/u);
  assert.match(dialog, /event\.key === "Escape" && !submittingRef\.current/u);
  assert.doesNotMatch(dialog, /localStorage|sessionStorage|URLSearchParams/u);
});

test("Firebase and OAuth primary login hand off MFA before applying access", () => {
  const gate = source("components/auth/AuthGate.tsx");
  const login = source("components/auth/LoginDialog.tsx");

  assert.match(gate, /MfaChallengeDialog/u);
  assert.match(gate, /mfaRequired/u);
  assert.match(gate, /oauth_login/u);
  assert.match(gate, /mfa_required/u);
  assert.match(gate, /setMfaOpen\(true\)/u);
  assert.match(gate, /fetch\("\/api\/auth\/me",\s*\{\s*cache:\s*"no-store"\s*\}\)/u);
  assert.match(gate, /setLoginOpen\(false\)/u);
  assert.match(
    gate,
    /async function cancelMfaLogin\(\)[\s\S]*logoutServerSession\(\)[\s\S]*setLoginOpen\(true\)/u
  );
  assert.match(login, /h-11 w-11/u);
  assert.doesNotMatch(gate, /[?&](?:mfaToken|mfaCode)=/u);
});

test("MFA verification API returns stable error codes without exposing challenge material", () => {
  const route = source("app/api/auth/mfa/verify/route.ts");

  assert.match(route, /code:\s*error\.code/u);
  assert.match(route, /TOTP_INVALID_CODE/u);
  assert.match(route, /TOTP_CODE_REPLAYED/u);
  assert.match(route, /TOTP_CLOCK_DRIFT/u);
  assert.match(route, /TOTP_RATE_LIMITED/u);
  assert.doesNotMatch(route, /challengeHash.*NextResponse\.json/u);
});

test("canceling MFA invalidates stale auth work and signs out Firebase and server before reopening login", () => {
  const gate = source("components/auth/AuthGate.tsx");
  const cancelStart = gate.indexOf("async function cancelMfaLogin()");
  const cancelEnd = gate.indexOf("async function resetPassword()", cancelStart);
  const cancel = gate.slice(cancelStart, cancelEnd);

  assert.match(gate, /logoutFirebaseUser/u);
  assert.match(gate, /authFlowVersionRef/u);
  assert.match(gate, /pendingAuthRequestControllersRef/u);
  assert.match(cancel, /authFlowVersionRef\.current \+= 1/u);
  assert.match(cancel, /abortPendingAuthRequests\(\)/u);
  assert.match(
    cancel,
    /await Promise\.allSettled\(\[\s*logoutFirebaseUser\(\),\s*logoutServerSession\(\)\s*\]\)/u
  );
  assert.ok(
    cancel.indexOf("abortPendingAuthRequests()") < cancel.indexOf("await Promise.allSettled"),
    "in-flight session responses must be aborted before logout can clear their cookies"
  );
  assert.ok(
    cancel.indexOf("await Promise.allSettled") <
      cancel.indexOf("mfaPendingRef.current = false"),
    "the MFA pending guard must remain active until both logout operations settle"
  );
  assert.ok(
    cancel.indexOf("mfaPendingRef.current = false") < cancel.indexOf("setLoginOpen(true)"),
    "login must reopen only after the cancellation guard is released"
  );
  assert.ok(
    [...gate.matchAll(/authFlowVersionRef\.current !== flowVersion/gu)].length >= 3,
    "restore, refresh, and primary login must ignore results from invalidated auth flows"
  );
});

test("MFA challenge synchronously rejects a duplicate submit entry", () => {
  const dialog = source("components/auth/MfaChallengeDialog.tsx");
  const submitStart = dialog.indexOf("async function submit(");
  const submitEnd = dialog.indexOf("return (", submitStart);
  const submit = dialog.slice(submitStart, submitEnd);

  const guard = submit.indexOf("if (submittingRef.current) return");
  const lock = submit.indexOf("submittingRef.current = true");
  assert.ok(guard >= 0, "submit must have a synchronous re-entry guard");
  assert.ok(lock > guard, "submit must check the guard before acquiring the submission lock");
});

test("MFA verification success retries session hydration without resubmitting the consumed challenge", () => {
  const dialog = source("components/auth/MfaChallengeDialog.tsx");

  assert.match(dialog, /verificationCompleteRef/u);
  assert.match(
    dialog,
    /if \(!verificationCompleteRef\.current\) \{[\s\S]*fetch\("\/api\/auth\/mfa\/verify"[\s\S]*verificationCompleteRef\.current = true;[\s\S]*\}[\s\S]*await onSuccess\(\)/u
  );
  assert.match(dialog, /로그인 상태 다시 불러오기/u);
  assert.match(dialog, /추가 인증은 완료되었습니다/u);
});

function source(filePath: string) {
  assert.equal(fs.existsSync(filePath), true, `${filePath} must exist`);
  return fs.readFileSync(filePath, "utf8");
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
