import assert from "node:assert/strict";
import {
  getFirebaseAuthClientConfig,
  isFirebaseAuthConfigured
} from "../src/lib/firebase/firebase-client-config";
import { canEnableFirebaseGitHubLogin } from "../src/lib/firebase/firebase-auth-providers";
import { NAVER_SITE_VERIFICATION } from "../src/lib/site/metadata";
import { upsertOptimisticChatSession } from "../src/lib/chat/session-list";
import fs from "node:fs";

test("Firebase client config is available only when public client settings exist", () => {
  withEnv(
    {
      NEXT_PUBLIC_FIREBASE_API_KEY: "api-key",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "dreamwish.firebaseapp.com",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "dreamwish",
      NEXT_PUBLIC_FIREBASE_APP_ID: "app-id"
    },
    () => {
      assert.equal(isFirebaseAuthConfigured(), true);
      assert.deepEqual(getFirebaseAuthClientConfig(), {
        apiKey: "api-key",
        authDomain: "dreamwish.firebaseapp.com",
        projectId: "dreamwish",
        appId: "app-id",
        storageBucket: undefined,
        messagingSenderId: undefined
      });
    }
  );
});

test("Firebase browser config uses statically analyzable public environment references", () => {
  const source = fs.readFileSync("src/lib/firebase/firebase-client-config.ts", "utf8");
  for (const key of [
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID"
  ]) {
    assert.match(source, new RegExp(`process\\.env\\.${key}`, "u"));
  }
  assert.doesNotMatch(source, /process\.env\[key\]/u);
});

test("Firebase auth client exposes signup and authenticated password change", () => {
  const source = fs.readFileSync("src/lib/firebase/firebase-client.ts", "utf8");
  assert.match(source, /createUserWithEmailAndPassword/u);
  assert.match(source, /EmailAuthProvider/u);
  assert.match(source, /reauthenticateWithCredential/u);
  assert.match(source, /EmailAuthProvider\.credential\(auth\.currentUser\.email, input\.currentPassword\)/u);
  assert.match(source, /updatePassword/u);
  assert.match(source, /export async function createFirebasePasswordAccount/u);
  assert.match(source, /export async function changeFirebasePassword/u);
  assert.match(source, /export function firebaseUserHasPasswordProvider/u);
  assert.match(source, /hasPasswordProvider\(auth\?\.currentUser\?\.providerData \|\| \[\]\)/u);
});

test("login UI exposes account creation, Google login, reset, and password change", () => {
  const authSource = fs.readFileSync("components/auth/AuthGate.tsx", "utf8");
  const loginShellSource = fs.readFileSync("components/auth/LoginShell.tsx", "utf8");
  assert.match(authSource, /createFirebasePasswordAccount/u);
  assert.match(authSource, /signInWithFirebaseGoogle/u);
  assert.match(authSource, /sendFirebasePasswordReset/u);
  assert.match(authSource, /changeFirebasePassword/u);
  assert.match(loginShellSource, /계정을 만들어 시작하세요/u);
  assert.match(loginShellSource, /Google로 계속하기/u);
  assert.match(loginShellSource, /GitHub로 계속하기/u);
  assert.match(loginShellSource, /비밀번호 찾기/u);
});

test("login UI uses safe auth errors and an explicit reauthenticated password form", () => {
  const authSource = fs.readFileSync("components/auth/AuthGate.tsx", "utf8");
  const loginShellSource = fs.readFileSync("components/auth/LoginShell.tsx", "utf8");
  assert.match(authSource, /getFirebaseAuthErrorMessage/u);
  assert.match(authSource, /validatePasswordChange/u);
  assert.match(authSource, /firebaseUserHasPasswordProvider/u);
  assert.match(authSource, /canEnableFirebaseGitHubLogin/u);
  assert.match(authSource, /currentPassword/u);
  assert.match(authSource, /newPassword/u);
  assert.match(authSource, /confirmPassword/u);
  assert.match(authSource, /autoComplete="current-password"/u);
  assert.match(authSource, /autoComplete="new-password"/u);
  assert.match(loginShellSource, /<form/u);
  assert.match(loginShellSource, /autoComplete="email"/u);
  assert.match(
    loginShellSource,
    /autoComplete=\{creatingAccount \? "new-password" : "current-password"\}/u
  );
  assert.match(loginShellSource, /Google로 계속하기/u);
  assert.match(loginShellSource, /GitHub로 계속하기/u);
  assert.doesNotMatch(authSource, /window\.prompt/u);
  assert.doesNotMatch(authSource, /process\.env\.NEXT_PUBLIC_ENABLE_FIREBASE_GITHUB_LOGIN/u);
});

test("AI chat streams answers and renders submitted-query connected context", () => {
  const source = fs.readFileSync("components/Chat/ChatView.tsx", "utf8");
  assert.match(source, /\/api\/ai\/providers/u);
  assert.match(source, /\/api\/ai\/chat\/stream/u);
  assert.match(source, /ConnectedContextWorkspace/u);
  assert.match(source, /const contextQuery = lastQuery\.trim\(\)/u);
  assert.match(source, /<ConnectedContextWorkspace query=\{contextQuery\} \/>/u);
  assert.match(source, /setLastQuery\(lastUserMessage\?\.content \|\| ""\)/u);
  assert.match(source, /setLastQuery\(contextualQuery\)/u);
  assert.doesNotMatch(source, /const contextQuery = input\.trim\(\)/u);
  assert.doesNotMatch(source, /hard=true/u);
});

test("chat archive routes resolve and pass the authenticated owner", () => {
  const sessionListRoute = normalizedSource("app/api/ai/sessions/route.ts");
  const sessionRoute = normalizedSource("app/api/ai/sessions/[id]/route.ts");
  const chatRoute = normalizedSource("app/api/ai/chat/route.ts");
  const streamRoute = normalizedSource("app/api/ai/chat/stream/route.ts");
  const contextRoute = normalizedSource("app/api/local/context/query/route.ts");

  assert.match(sessionListRoute, /requireOwnerContext\(request\)/u);
  assert.match(sessionListRoute, /listSessions\(owner\.uid\)/u);
  assert.match(sessionRoute, /getSession\(owner\.uid, id\)/u);
  assert.match(sessionRoute, /archiveSession\(owner\.uid, id\)/u);

  for (const source of [chatRoute, streamRoute]) {
    assert.match(source, /requireOwnerContext\(request\)/u);
    assert.match(source, /ensureSession\(owner\.uid, sessionId, message\)/u);
    assert.match(source, /ownerId: owner\.uid/u);
    assert.match(source, /saveAssistantExchange\(\s*owner\.uid,/u);
  }

  assert.match(contextRoute, /requireOwnerContext\(request\)/u);
  assert.match(contextRoute, /searchChatMessages\(owner\.uid, query, 8\)/u);
});

test("Firebase GitHub login is exposed only when explicitly enabled and client id exists", () => {
  withEnv(
    {
      NEXT_PUBLIC_ENABLE_FIREBASE_GITHUB_LOGIN: "true",
      GITHUB_CLIENT_ID: "github-client"
    },
    () => {
      assert.equal(canEnableFirebaseGitHubLogin(), true);
    }
  );

  withEnv(
    {
      NEXT_PUBLIC_ENABLE_FIREBASE_GITHUB_LOGIN: undefined,
      GITHUB_CLIENT_ID: "github-client"
    },
    () => {
      assert.equal(canEnableFirebaseGitHubLogin(), false);
    }
  );
});

test("Firebase auth errors map to safe actionable Korean messages", () => {
  const modulePath = "../src/lib/firebase/firebase-auth-errors";
  assert.equal(fs.existsSync("src/lib/firebase/firebase-auth-errors.ts"), true);
  const { getFirebaseAuthErrorMessage } = require(modulePath) as {
    getFirebaseAuthErrorMessage: (
      error: unknown,
      method?: "password" | "google" | "github" | "generic"
    ) => string;
  };

  const cases = [
    ["auth/popup-closed-by-user", "취소"],
    ["auth/popup-blocked", "팝업"],
    ["auth/account-exists-with-different-credential", "다른 로그인 방법"],
    ["auth/requires-recent-login", "다시 로그인"],
    ["auth/unauthorized-domain", "허용되지 않은 도메인"]
  ] as const;

  for (const [code, expected] of cases) {
    assert.match(getFirebaseAuthErrorMessage({ code }), new RegExp(expected, "u"));
  }
  assert.match(
    getFirebaseAuthErrorMessage({ code: "auth/invalid-credential" }, "password"),
    /이메일 또는 비밀번호/u
  );
  assert.match(
    getFirebaseAuthErrorMessage({ code: "auth/invalid-credential" }, "google"),
    /Google 로그인 정보/u
  );
  assert.doesNotMatch(
    getFirebaseAuthErrorMessage({ code: "auth/invalid-credential" }, "google"),
    /비밀번호/u
  );
  assert.match(
    getFirebaseAuthErrorMessage({ code: "auth/invalid-credential" }, "github"),
    /GitHub 로그인 정보/u
  );
  assert.doesNotMatch(
    getFirebaseAuthErrorMessage({ code: "auth/invalid-credential" }, "generic"),
    /비밀번호/u
  );
  assert.equal(
    getFirebaseAuthErrorMessage({ code: "auth/internal-error", message: "secret-token-value" }),
    "인증 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
  );
});

test("auth actions preserve the Firebase provider when mapping failures", () => {
  const source = fs.readFileSync("components/auth/AuthGate.tsx", "utf8");

  assert.match(source, /getAuthActionError\(caught, "password"\)/u);
  assert.match(source, /getAuthActionError\(caught, "google"\)/u);
  assert.match(source, /getAuthActionError\(caught, "github"\)/u);
});

test("password change policy requires reauthentication inputs and a password provider", () => {
  const modulePath = "../src/lib/firebase/firebase-password-policy";
  assert.equal(fs.existsSync("src/lib/firebase/firebase-password-policy.ts"), true);
  const { validatePasswordChange, hasPasswordProvider } = require(modulePath) as {
    validatePasswordChange: (input: {
      currentPassword: string;
      newPassword: string;
      confirmPassword: string;
    }) => string | null;
    hasPasswordProvider: (providers: Array<{ providerId?: string | null }>) => boolean;
  };

  assert.match(
    validatePasswordChange({ currentPassword: "", newPassword: "abcdef", confirmPassword: "abcdef" }) || "",
    /현재 비밀번호/u
  );
  assert.match(
    validatePasswordChange({ currentPassword: "old-pass", newPassword: "12345", confirmPassword: "12345" }) || "",
    /6자/u
  );
  assert.match(
    validatePasswordChange({ currentPassword: "old-pass", newPassword: "abcdef", confirmPassword: "abcdeg" }) || "",
    /일치/u
  );
  assert.equal(
    validatePasswordChange({ currentPassword: "old-pass", newPassword: "abcdef", confirmPassword: "abcdef" }),
    null
  );
  assert.equal(hasPasswordProvider([{ providerId: "google.com" }, { providerId: "password" }]), true);
  assert.equal(hasPasswordProvider([{ providerId: "google.com" }, { providerId: "github.com" }]), false);
});

test("Firebase GitHub browser visibility depends only on its public enable flag", () => {
  withEnv(
    {
      NEXT_PUBLIC_ENABLE_FIREBASE_GITHUB_LOGIN: "true",
      GITHUB_CLIENT_ID: undefined
    },
    () => {
      assert.equal(canEnableFirebaseGitHubLogin(), true);
    }
  );
});

test("authentication configuration documents the server session secret and provider consoles", () => {
  const exampleEnv = fs.readFileSync(".env.example", "utf8");
  assert.match(exampleEnv, /# Auth Session - Server Only[\s\S]*AUTH_SESSION_SECRET=""/u);
  assert.doesNotMatch(exampleEnv, /NEXT_PUBLIC_AUTH_SESSION_SECRET/u);

  assert.equal(fs.existsSync("docs/authentication.md"), true);
  const guide = fs.readFileSync("docs/authentication.md", "utf8");
  for (const requirement of [
    "Email/Password",
    "Google",
    "GitHub",
    "localhost",
    "dreamwish.co.kr",
    "Authorized domains",
    "Authorization callback URL",
    "AUTH_SESSION_SECRET",
    "Railway"
  ]) {
    assert.match(guide, new RegExp(requirement.replace("/", "\\/"), "u"));
  }
});

test("Naver site verification metadata is configured", () => {
  assert.equal(
    NAVER_SITE_VERIFICATION,
    "89a2cae4c4d0e846aee8304cfb48e4ad71c7c6d7"
  );
});

test("new chat sessions are inserted into the session list immediately", () => {
  const sessions = upsertOptimisticChatSession([], {
    id: "session-1",
    owner_id: "uid-a",
    title: "첫 질문",
    created_at: "2026-07-10T00:00:00.000Z",
    updated_at: "2026-07-10T00:00:00.000Z",
    archived_at: null
  });

  assert.equal(sessions[0].id, "session-1");
  assert.equal(sessions[0].title, "첫 질문");
  assert.equal(upsertOptimisticChatSession(sessions, { ...sessions[0], title: "수정" }).length, 1);
});

function normalizedSource(filePath: string) {
  return fs.readFileSync(filePath, "utf8").replace(/\s+/gu, " ");
}

function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const original = { ...process.env };
  process.env = { ...original };
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    process.env = original;
  }
}
