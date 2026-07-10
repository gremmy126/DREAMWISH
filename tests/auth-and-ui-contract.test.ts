import assert from "node:assert/strict";
import {
  getFirebaseAuthClientConfig,
  isFirebaseAuthConfigured
} from "../src/lib/firebase/firebase-client-config";
import { canEnableFirebaseGitHubLogin } from "../src/lib/firebase/firebase-auth-providers";
import { NAVER_SITE_VERIFICATION } from "../src/lib/site/metadata";
import { upsertOptimisticChatSession } from "../src/lib/chat/session-list";

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
