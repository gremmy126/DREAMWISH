import assert from "node:assert/strict";
import fs from "node:fs";

test("login form validation distinguishes empty malformed and valid input", () => {
  assert.equal(fs.existsSync("src/lib/auth/login-form-validation.ts"), true);
  const { validateLoginForm, validatePasswordResetEmail } = require(
    "../src/lib/auth/login-form-validation"
  ) as {
    validateLoginForm: (input: {
      email: string;
      password: string;
      mode: "signin" | "signup";
    }) => { email?: string; password?: string };
    validatePasswordResetEmail: (email: string) => string | null;
  };

  assert.deepEqual(validateLoginForm({ email: "", password: "", mode: "signin" }), {
    email: "이메일을 입력해주세요.",
    password: "비밀번호를 입력해주세요."
  });
  assert.deepEqual(
    validateLoginForm({ email: "wrong-address", password: "secret1", mode: "signin" }),
    { email: "올바른 이메일 주소를 입력해주세요." }
  );
  assert.deepEqual(
    validateLoginForm({ email: " name@example.com ", password: "secret1", mode: "signin" }),
    {}
  );
  assert.deepEqual(
    validateLoginForm({ email: "name@example.com", password: "12345", mode: "signup" }),
    { password: "비밀번호는 6자 이상이어야 합니다." }
  );
  assert.equal(validatePasswordResetEmail(""), "비밀번호를 재설정할 이메일을 입력해주세요.");
  assert.equal(
    validatePasswordResetEmail("wrong-address"),
    "올바른 이메일 주소를 입력해주세요."
  );
  assert.equal(validatePasswordResetEmail(" name@example.com "), null);
});

test("Firebase email authentication normalizes surrounding whitespace", () => {
  const { normalizeFirebaseAuthEmail } = require(
    "../src/lib/auth/login-form-validation"
  ) as {
    normalizeFirebaseAuthEmail?: (email: string) => string;
  };

  assert.equal(typeof normalizeFirebaseAuthEmail, "function");
  assert.equal(normalizeFirebaseAuthEmail?.("  name@example.com"), "name@example.com");
  assert.equal(normalizeFirebaseAuthEmail?.("name@example.com  "), "name@example.com");
  assert.equal(normalizeFirebaseAuthEmail?.("  name@example.com  "), "name@example.com");
});

test("AuthGate passes normalized email to Firebase login and signup", () => {
  const source = fs.readFileSync("components/auth/AuthGate.tsx", "utf8").replace(/\s+/gu, " ");

  assert.match(
    source,
    /async function login\(\).*?const normalizedEmail = normalizeFirebaseAuthEmail\(email\);.*?signInWithFirebasePassword\(\{ email: normalizedEmail, password \}\)/u
  );
  assert.match(
    source,
    /async function signup\(\).*?const normalizedEmail = normalizeFirebaseAuthEmail\(email\);.*?createFirebasePasswordAccount\(\{ email: normalizedEmail, password, name \}\)/u
  );
});

test("login decisions block invalid actions and route valid auth intent", () => {
  const { decideLoginSubmission, decidePasswordReset } = require(
    "../src/lib/auth/login-form-validation"
  ) as {
    decideLoginSubmission: (input: {
      email: string;
      password: string;
      mode: "signin" | "signup";
    }) => {
      action: "signin" | "signup" | null;
      canSubmit: boolean;
      fieldErrors: { email?: string; password?: string };
    };
    decidePasswordReset: (email: string) => {
      action: "reset" | null;
      canSubmit: boolean;
      emailError: string | null;
    };
  };

  assert.equal(typeof decideLoginSubmission, "function");
  assert.equal(typeof decidePasswordReset, "function");
  assert.deepEqual(decideLoginSubmission({ email: "", password: "", mode: "signin" }), {
    action: null,
    canSubmit: false,
    fieldErrors: {
      email: "이메일을 입력해주세요.",
      password: "비밀번호를 입력해주세요."
    }
  });
  assert.deepEqual(
    decideLoginSubmission({ email: "name@example.com", password: "secret1", mode: "signin" }),
    { action: "signin", canSubmit: true, fieldErrors: {} }
  );
  assert.deepEqual(
    decideLoginSubmission({ email: "name@example.com", password: "secret1", mode: "signup" }),
    { action: "signup", canSubmit: true, fieldErrors: {} }
  );
  assert.deepEqual(decidePasswordReset(""), {
    action: null,
    canSubmit: false,
    emailError: "비밀번호를 재설정할 이메일을 입력해주세요."
  });
  assert.deepEqual(decidePasswordReset(" name@example.com "), {
    action: "reset",
    canSubmit: true,
    emailError: null
  });
});

test("auth mode reset state clears transient credentials in both directions", () => {
  const { getAuthModeResetState } = require(
    "../src/lib/auth/login-form-validation"
  ) as {
    getAuthModeResetState?: (nextCreatingAccount: boolean) => {
      creatingAccount: boolean;
      password: string;
      error: null;
      resetMessage: null;
    };
  };

  assert.equal(typeof getAuthModeResetState, "function");
  assert.deepEqual(getAuthModeResetState?.(true), {
    creatingAccount: true,
    password: "",
    error: null,
    resetMessage: null
  });
  assert.deepEqual(getAuthModeResetState?.(false), {
    creatingAccount: false,
    password: "",
    error: null,
    resetMessage: null
  });
});

test("login dialog provides the approved responsive accessible SaaS layout", () => {
  assert.equal(fs.existsSync("components/auth/LoginDialog.tsx"), true);
  const source = fs.readFileSync("components/auth/LoginDialog.tsx", "utf8");

  for (const contract of [
    /max-w-\[440px\]/u,
    /role="dialog"/u,
    /aria-modal="true"/u,
    /aria-describedby="login-dialog-description"/u,
    /id="login-dialog-description"/u,
    /나만의 기억과 업무 데이터를 AI가 안전하게 이어갑니다/u,
    /나만의 AI와 대화를 시작할 수 있습니다/u,
    /<form/u,
    /onSubmit=/u,
    /id="auth-email"/u,
    /type="email"/u,
    /autoComplete="email"/u,
    /placeholder="name@example.com"/u,
    /id="auth-password"/u,
    /autoComplete=\{props\.creatingAccount \? "new-password" : "current-password"\}/u,
    /aria-invalid/u,
    /role="alert"/u,
    /Google로 계속하기/u,
    /GitHub로 계속하기/u,
    /const decision = decideLoginSubmission\(/u,
    /const decision = decidePasswordReset\(/u
  ]) {
    assert.match(source, contract);
  }

  for (const icon of ["Mail", "LockKeyhole", "Chrome", "Github", "UserRound"]) {
    assert.match(source, new RegExp(`\\b${icon}\\b`, "u"));
  }

  assert.match(source, /useRef/u);
  assert.match(source, /getFocusableElements/u);
  assert.match(source, /event\.key === "Tab"/u);
  assert.match(source, /emailInputRef\.current\?\.focus\(\)/u);
  assert.match(source, /previousActiveElement\?\.focus\(\)/u);
});

test("auth session failures are stable Korean messages without server details", () => {
  assert.equal(fs.existsSync("src/lib/auth/auth-session-errors.ts"), true);
  const { getAuthSessionFailureMessage } = require(
    "../src/lib/auth/auth-session-errors"
  ) as { getAuthSessionFailureMessage: (status: number) => string };

  assert.equal(
    getAuthSessionFailureMessage(401),
    "로그인 세션을 확인하지 못했습니다. 다시 로그인해주세요."
  );
  assert.equal(
    getAuthSessionFailureMessage(429),
    "로그인 요청이 많습니다. 잠시 후 다시 시도해주세요."
  );
  assert.equal(
    getAuthSessionFailureMessage(503),
    "로그인 서버에 일시적인 문제가 있습니다. 잠시 후 다시 시도해주세요."
  );
  assert.equal(
    getAuthSessionFailureMessage(418),
    "로그인 처리를 완료하지 못했습니다. 다시 시도해주세요."
  );
});

test("auth session access reader accepts only a complete runtime AccessState", async () => {
  const authSessionModule = loadAuthSessionModule();
  assertAuthSessionModule(authSessionModule);
  const { AuthSessionError, readAuthSessionAccess } = authSessionModule;

  assert.deepEqual(
    await readAuthSessionAccess(jsonResponse({ access: VALID_ACCESS_STATE })),
    VALID_ACCESS_STATE
  );

  const invalidAccessStates: unknown[] = [
    { ...VALID_ACCESS_STATE, email: 42 },
    { ...VALID_ACCESS_STATE, role: "owner" },
    { ...VALID_ACCESS_STATE, paid: "true" },
    { ...VALID_ACCESS_STATE, adminBypass: 0 },
    { ...VALID_ACCESS_STATE, canUseApp: null },
    { ...VALID_ACCESS_STATE, requiresPayment: undefined }
  ];
  for (const access of invalidAccessStates) {
    await assertAuthSessionError(
      () => readAuthSessionAccess(jsonResponse({ access })),
      AuthSessionError,
      GENERIC_AUTH_SESSION_FAILURE
    );
  }
});

test("auth session access reader handles malformed and non-object JSON safely", async () => {
  const authSessionModule = loadAuthSessionModule();
  assertAuthSessionModule(authSessionModule);
  const { AuthSessionError, readAuthSessionAccess } = authSessionModule;

  for (const body of ["null", "[]", "42", '"text"', "{"]) {
    await assertAuthSessionError(
      () => readAuthSessionAccess(rawResponse(body)),
      AuthSessionError,
      GENERIC_AUTH_SESSION_FAILURE
    );
  }
});

test("auth session access reader prioritizes mapped HTTP status failures", async () => {
  const authSessionModule = loadAuthSessionModule();
  assertAuthSessionModule(authSessionModule);
  const { AuthSessionError, readAuthSessionAccess } = authSessionModule;
  const cases = [
    [401, '{"error":"private server detail"}', "로그인 세션을 확인하지 못했습니다. 다시 로그인해주세요."],
    [403, "null", "로그인 세션을 확인하지 못했습니다. 다시 로그인해주세요."],
    [429, "{", "로그인 요청이 많습니다. 잠시 후 다시 시도해주세요."],
    [503, "[]", "로그인 서버에 일시적인 문제가 있습니다. 잠시 후 다시 시도해주세요."]
  ] as const;

  for (const [status, body, expectedMessage] of cases) {
    await assertAuthSessionError(
      () => readAuthSessionAccess(rawResponse(body, status), "서버 상세를 노출하면 안 됩니다."),
      AuthSessionError,
      expectedMessage
    );
  }
});

test("auth session access reader preserves the successful-response missing-access fallback", async () => {
  const authSessionModule = loadAuthSessionModule();
  assertAuthSessionModule(authSessionModule);
  const { AuthSessionError, readAuthSessionAccess } = authSessionModule;
  const fallback = "기존 세션 복원 실패 안내";

  await assertAuthSessionError(
    () => readAuthSessionAccess(jsonResponse({}), fallback),
    AuthSessionError,
    fallback
  );
  await assertAuthSessionError(
    () => readAuthSessionAccess(jsonResponse({ access: { email: "incomplete@example.com" } }), fallback),
    AuthSessionError,
    fallback
  );
});

test("AuthGate delegates modal presentation and keeps Firebase auth effects", () => {
  const source = fs.readFileSync("components/auth/AuthGate.tsx", "utf8");
  assert.match(source, /import \{ LoginDialog \} from "@\/components\/auth\/LoginDialog"/u);
  assert.match(
    source,
    /import \{ AuthSessionError, readAuthSessionAccess \} from "@\/src\/lib\/auth\/auth-session-errors"/u
  );
  assert.match(source, /getAuthModeResetState\(nextCreatingAccount\)/u);
  assert.match(source, /function changeAuthMode/u);
  assert.doesNotMatch(source, /export function LoginDialog/u);
  assert.doesNotMatch(source, /class AuthSessionError/u);
  assert.doesNotMatch(source, /response\.json\(\)\.catch/u);
  assert.equal(source.match(/readAuthSessionAccess\(response(?:, fallback)?\)/gu)?.length, 2);
  assert.match(source, /readAuthSessionAccess\(response, fallback\)/u);
  for (const preserved of [
    "signInWithFirebasePassword",
    "createFirebasePasswordAccount",
    "signInWithFirebaseGoogle",
    "signInWithFirebaseGithub",
    "sendFirebasePasswordReset",
    'fetch("/api/auth/login"',
    'fetch("/api/auth/session"'
  ]) {
    assert.match(source, new RegExp(preserved.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
  for (const wiring of [
    /onSubmit=\{login\}/u,
    /onSignup=\{signup\}/u,
    /onResetPassword=\{resetPassword\}/u,
    /onGoogle=\{loginWithGoogle\}/u,
    /githubEnabled=\{canEnableFirebaseGitHubLogin\(\)\}/u,
    /onGithub=\{loginWithGithub\}/u,
    /onModeChange=\{changeAuthMode\}/u
  ]) {
    assert.match(source, wiring);
  }
});

type TestAccessState = {
  email: string;
  role: "admin" | "user";
  paid: boolean;
  adminBypass: boolean;
  canUseApp: boolean;
  requiresPayment: boolean;
};

type AuthSessionModule = {
  AuthSessionError: new (message: string) => Error;
  readAuthSessionAccess: (
    response: Response,
    missingAccessMessage?: string
  ) => Promise<TestAccessState>;
};

const VALID_ACCESS_STATE: TestAccessState = {
  email: "member@example.com",
  role: "user",
  paid: true,
  adminBypass: false,
  canUseApp: true,
  requiresPayment: false
};

const GENERIC_AUTH_SESSION_FAILURE = "로그인 처리를 완료하지 못했습니다. 다시 시도해주세요.";

function loadAuthSessionModule() {
  return require("../src/lib/auth/auth-session-errors") as Partial<AuthSessionModule>;
}

function assertAuthSessionModule(
  module: Partial<AuthSessionModule>
): asserts module is AuthSessionModule {
  assert.equal(typeof module.AuthSessionError, "function");
  assert.equal(typeof module.readAuthSessionAccess, "function");
}

function jsonResponse(value: unknown, status = 200) {
  return rawResponse(JSON.stringify(value), status);
}

function rawResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

async function assertAuthSessionError(
  run: () => Promise<unknown>,
  AuthSessionError: AuthSessionModule["AuthSessionError"],
  expectedMessage: string
) {
  await assert.rejects(run, (error: unknown) => {
    assert.ok(error instanceof AuthSessionError);
    assert.equal((error as Error).message, expectedMessage);
    return true;
  });
}
