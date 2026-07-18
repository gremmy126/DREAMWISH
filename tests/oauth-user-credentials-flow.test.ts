import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createProviderAuthorizationUrl,
  exchangeProviderAuthorizationCode,
  getOAuthAppTarget
} from "../src/lib/oauth/oauth-provider-adapter";
import { resolveOAuthSessionAppConfig } from "../src/lib/oauth/oauth-authorization-flow";
import {
  revokeOAuthAppConfig,
  saveOAuthAppConfig
} from "../src/lib/repositories/oauth-app-config.repository";
import {
  consumeOAuthSession,
  createOAuthSession
} from "../src/lib/repositories/oauth-session.repository";

test("user OAuth guide covers every canonical OAuth provider without secret examples", async () => {
  const guide = await fs.readFile(
    path.join(process.cwd(), "docs/user-managed-oauth-connections.md"),
    "utf8"
  );
  for (const provider of ["Google", "Slack", "GitHub", "Notion", "Discord", "Microsoft", "Dropbox"]) {
    assert.match(guide, new RegExp(provider, "u"));
  }
  assert.match(guide, /Redirect URI/u);
  assert.match(guide, /Client ID/u);
  assert.match(guide, /Client Secret/u);
  assert.match(guide, /재연결/u);
  assert.doesNotMatch(guide, /sk-[A-Za-z0-9]|ghp_[A-Za-z0-9]|Bearer [A-Za-z0-9]/u);
});

test("provider authorization uses the owner's OAuth client id without exposing its secret", () => {
  withEnv({ GOOGLE_CLIENT_ID: "platform-client-id" }, () => {
    const url = new URL(
      createProviderAuthorizationUrl({
        target: getOAuthAppTarget("gmail"),
        credentials: {
          clientId: "owner-client-id",
          clientSecret: "owner-client-secret"
        },
        redirectUri: "https://dreamwish.co.kr/api/integrations/google/callback",
        state: "state-value",
        codeChallenge: "challenge-value"
      })
    );

    assert.equal(url.searchParams.get("client_id"), "owner-client-id");
    assert.doesNotMatch(url.toString(), /owner-client-secret/u);
  });
});

test("Notion OAuth preserves the rotating refresh token returned for a public connection", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({
    access_token: "notion-access-value",
    refresh_token: "notion-refresh-value",
    bot_id: "bot-1",
    workspace_id: "workspace-1",
    workspace_name: "Workspace"
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  try {
    const result = await exchangeProviderAuthorizationCode({
      target: getOAuthAppTarget("notion"),
      credentials: { clientId: "owner-notion-client", clientSecret: "owner-notion-secret" },
      code: "authorization-code",
      redirectUri: "https://dreamwish.co.kr/api/integrations/notion/callback",
      codeVerifier: "unused-for-notion"
    });
    assert.equal(result.refreshToken, "notion-refresh-value");
  } finally {
    global.fetch = originalFetch;
  }
});

test("OAuth sessions persist the exact owner app config version without its secret", async () => {
  await withLocalSessionStore(async (dataDir) => {
    const session = await createOAuthSession({
      ownerId: "owner-1",
      provider: "google",
      service: "gmail",
      appId: "gmail",
      oauthAppConfigId: "config-1",
      oauthAppConfigVersion: 3,
      requestedScopes: ["gmail.send"],
      state: "version-bound-state",
      redirectUri: "https://dreamwish.co.kr/api/integrations/google/callback",
      codeVerifier: "pkce-verifier",
      returnTo: "/?view=integrations"
    });

    assert.equal(session.oauthAppConfigId, "config-1");
    assert.equal(session.oauthAppConfigVersion, 3);

    const consumed = await consumeOAuthSession({
      ownerId: "owner-1",
      state: "version-bound-state",
      provider: "google"
    });
    assert.equal(consumed.oauthAppConfigId, "config-1");
    assert.equal(consumed.oauthAppConfigVersion, 3);

    const stored = await fs.readFile(path.join(dataDir, "oauth-sessions.json"), "utf8");
    assert.doesNotMatch(stored, /owner-client-secret/u);
  });
});

test("callback config resolution rejects changed and revoked OAuth app versions", async () => {
  assert.equal(typeof resolveOAuthSessionAppConfig, "function");

  await withLocalSessionStore(async () => {
    const first = await saveOAuthAppConfig({
      ownerId: "owner-1",
      appId: "gmail",
      provider: "google",
      clientId: "owner-client-v1",
      clientSecret: "owner-secret-v1",
      redirectUri: "https://dreamwish.co.kr/api/integrations/google/callback"
    });
    const changedSession = await createOAuthSession({
      ownerId: "owner-1",
      provider: "google",
      service: "gmail",
      appId: "gmail",
      oauthAppConfigId: first.id,
      oauthAppConfigVersion: first.version,
      state: "changed-config-state",
      redirectUri: first.redirectUri
    });

    await saveOAuthAppConfig({
      ownerId: "owner-1",
      appId: "gmail",
      provider: "google",
      clientId: "owner-client-v2",
      clientSecret: "owner-secret-v2",
      redirectUri: "https://dreamwish.co.kr/api/integrations/google/callback"
    });
    await assert.rejects(
      () => resolveOAuthSessionAppConfig(changedSession),
      (error: unknown) => hasCode(error, "OAUTH_APP_CONFIG_CHANGED")
    );

    const active = await saveOAuthAppConfig({
      ownerId: "owner-2",
      appId: "gmail",
      provider: "google",
      clientId: "owner-two-client",
      clientSecret: "owner-two-secret",
      redirectUri: "https://dreamwish.co.kr/api/integrations/google/callback"
    });
    const revokedSession = await createOAuthSession({
      ownerId: "owner-2",
      provider: "google",
      service: "gmail",
      appId: "gmail",
      oauthAppConfigId: active.id,
      oauthAppConfigVersion: active.version,
      state: "revoked-config-state",
      redirectUri: active.redirectUri
    });
    await revokeOAuthAppConfig("owner-2", "gmail");
    await assert.rejects(
      () => resolveOAuthSessionAppConfig(revokedSession),
      (error: unknown) => hasCode(error, "OAUTH_APP_CONFIG_CHANGED")
    );
  });
});

test("OAuth callback, durable connection, and refresh paths retain the bound config version", async () => {
  const callbackRoutes = await Promise.all([
    "app/api/integrations/[appId]/callback/route.ts",
    "app/api/integrations/[appId]/oauth/callback/route.ts"
  ].map((file) => fs.readFile(path.join(process.cwd(), file), "utf8")));
  for (const source of callbackRoutes) {
    assert.match(source, /resolveOAuthSessionAppConfig\(session\)/u);
    assert.match(source, /oauthAppConfigId:\s*oauthAppConfig\.id/u);
    assert.match(source, /oauthAppConfigVersion:\s*oauthAppConfig\.version/u);
    assert.match(source, /credentials:\s*oauthAppConfig/u);
  }

  const repository = await fs.readFile(
    path.join(process.cwd(), "src/lib/repositories/integration-connection.repository.ts"),
    "utf8"
  );
  assert.match(repository, /oauth_app_config_id/u);
  assert.match(repository, /oauth_app_config_version/u);

  const service = await fs.readFile(
    path.join(process.cwd(), "src/lib/oauth/oauth-connection.service.ts"),
    "utf8"
  );
  assert.match(service, /getOAuthAppConfigVersion/u);
  assert.match(service, /getLatestOAuthAppConfigVersionNumber/u);
  assert.match(service, /credentials:\s*oauthAppConfig/u);
});

async function withLocalSessionStore(run: (dataDir: string) => Promise<void>) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dreamwish-oauth-session-config-"));
  const original = { ...process.env };
  process.env = {
    ...original,
    DATA_DIR: dataDir,
    APP_URL: "https://dreamwish.co.kr",
    INTEGRATION_TOKEN_ENCRYPTION_KEY: "oauth-session-test-key-at-least-thirty-two-bytes",
    OAUTH_TOKEN_ENCRYPTION_KEY: "oauth-session-test-key-at-least-thirty-two-bytes"
  };
  delete process.env.DATABASE_URL;
  try {
    await run(dataDir);
  } finally {
    process.env = original;
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}

function hasCode(error: unknown, code: string) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
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
