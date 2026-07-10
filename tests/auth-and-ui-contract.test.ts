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
  assert.match(source, /updatePassword/u);
  assert.match(source, /export async function createFirebasePasswordAccount/u);
  assert.match(source, /export async function changeFirebasePassword/u);
});

test("login UI exposes account creation, Google login, reset, and password change", () => {
  const source = fs.readFileSync("components/auth/AuthGate.tsx", "utf8");
  assert.match(source, /createFirebasePasswordAccount/u);
  assert.match(source, /signInWithFirebaseGoogle/u);
  assert.match(source, /sendFirebasePasswordReset/u);
  assert.match(source, /changeFirebasePassword/u);
});

test("AI chat uses server provider catalog and omits recommended connections", () => {
  const source = fs.readFileSync("components/Chat/ChatView.tsx", "utf8");
  assert.match(source, /\/api\/ai\/providers/u);
  assert.doesNotMatch(source, /ConnectedContextWorkspace/u);
  assert.doesNotMatch(source, /hard=true/u);
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

test("Naver site verification metadata is configured", () => {
  assert.equal(
    NAVER_SITE_VERIFICATION,
    "89a2cae4c4d0e846aee8304cfb48e4ad71c7c6d7"
  );
});

test("new chat sessions are inserted into the session list immediately", () => {
  const sessions = upsertOptimisticChatSession([], {
    id: "session-1",
    title: "첫 질문",
    created_at: "2026-07-10T00:00:00.000Z",
    updated_at: "2026-07-10T00:00:00.000Z",
    archived_at: null
  });

  assert.equal(sessions[0].id, "session-1");
  assert.equal(sessions[0].title, "첫 질문");
  assert.equal(upsertOptimisticChatSession(sessions, { ...sessions[0], title: "수정" }).length, 1);
});

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
