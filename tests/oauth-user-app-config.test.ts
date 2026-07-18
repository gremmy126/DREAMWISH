import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import fsSync from "node:fs";
import {
  getOAuthAppConfig,
  getOAuthAppConfigVersion,
  revokeOAuthAppConfig,
  saveOAuthAppConfig,
  toPublicOAuthAppConfig
} from "../src/lib/repositories/oauth-app-config.repository";

const TEST_ENCRYPTION_KEY = "oauth-app-config-test-key-at-least-thirty-two-bytes";

test("user OAuth app config encrypts the secret and exposes only public status", async () => {
  await withLocalOAuthConfigStore(async (dataDir) => {
    const saved = await saveOAuthAppConfig({
      ownerId: "owner-1",
      appId: "gmail",
      provider: "google",
      clientId: "client-1",
      clientSecret: "secret-value-123",
      redirectUri: "https://dreamwish.co.kr/api/integrations/google/callback"
    });

    assert.equal(saved.version, 1);
    assert.notEqual(saved.clientSecretCiphertext, "secret-value-123");
    assert.doesNotMatch(
      JSON.stringify(toPublicOAuthAppConfig(saved)),
      /secret-value-123|clientSecretCiphertext|ciphertext/u
    );
    assert.equal((await getOAuthAppConfig("owner-2", "gmail")), null);

    const stored = await fs.readFile(path.join(dataDir, "oauth-app-configs.json"), "utf8");
    assert.doesNotMatch(stored, /secret-value-123/u);
  });
});

test("changing an OAuth client secret creates an immutable owner-scoped version", async () => {
  await withLocalOAuthConfigStore(async () => {
    const first = await saveConfig("secret-one");
    const second = await saveConfig("secret-two");

    assert.equal(second.id, first.id);
    assert.equal(second.version, first.version + 1);
    assert.equal(
      (await getOAuthAppConfigVersion("owner-1", first.id, first.version))?.clientSecret,
      "secret-one"
    );
    assert.equal(
      (await getOAuthAppConfigVersion("owner-1", second.id, second.version))?.clientSecret,
      "secret-two"
    );
    assert.equal(await getOAuthAppConfigVersion("owner-2", first.id, first.version), null);
  });
});

test("OAuth app config rejects a provider mismatch and a non-canonical redirect URI", async () => {
  await withLocalOAuthConfigStore(async () => {
    await assert.rejects(
      () =>
        saveOAuthAppConfig({
          ownerId: "owner-1",
          appId: "gmail",
          provider: "dropbox",
          clientId: "client-1",
          clientSecret: "secret-value-123",
          redirectUri: "https://dreamwish.co.kr/api/integrations/dropbox/callback"
        }),
      (error: unknown) => hasCode(error, "OAUTH_APP_CONFIG_INVALID")
    );

    await assert.rejects(
      () =>
        saveOAuthAppConfig({
          ownerId: "owner-1",
          appId: "gmail",
          provider: "google",
          clientId: "client-1",
          clientSecret: "secret-value-123",
          redirectUri: "https://attacker.example/api/integrations/google/callback"
        }),
      (error: unknown) => hasCode(error, "OAUTH_APP_CONFIG_INVALID")
    );
  });
});

test("revoking an OAuth app config affects only the owning account", async () => {
  await withLocalOAuthConfigStore(async () => {
    const ownerOne = await saveConfig("owner-one-secret");
    await saveOAuthAppConfig({
      ownerId: "owner-2",
      appId: "gmail",
      provider: "google",
      clientId: "owner-two-client",
      clientSecret: "owner-two-secret",
      redirectUri: "https://dreamwish.co.kr/api/integrations/google/callback"
    });

    assert.equal(await revokeOAuthAppConfig("owner-1", "gmail"), true);
    assert.equal(await getOAuthAppConfig("owner-1", "gmail"), null);
    assert.equal((await getOAuthAppConfig("owner-2", "gmail"))?.clientSecret, "owner-two-secret");
    assert.equal(
      (await getOAuthAppConfigVersion("owner-1", ownerOne.id, ownerOne.version))?.status,
      "revoked"
    );
  });
});

test("OAuth app config API is owner-scoped, CSRF-protected, and returns only public config", () => {
  const routePath = "app/api/integrations/[appId]/oauth-config/route.ts";
  assert.equal(fsSync.existsSync(routePath), true);
  const source = fsSync.readFileSync(routePath, "utf8");

  assert.match(source, /requireOwnerContext\(request\)/u);
  assert.match(source, /assertSameOriginMutation\(request\)/u);
  assert.match(source, /getOAuthRedirectUri/u);
  assert.match(source, /toPublicOAuthAppConfig/u);
  assert.match(source, /export async function GET/u);
  assert.match(source, /export async function PUT/u);
  assert.match(source, /export async function DELETE/u);
  assert.doesNotMatch(source, /config:\s*saved\s*[},]/u);
});

async function saveConfig(clientSecret: string) {
  return saveOAuthAppConfig({
    ownerId: "owner-1",
    appId: "gmail",
    provider: "google",
    clientId: "client-1",
    clientSecret,
    redirectUri: "https://dreamwish.co.kr/api/integrations/google/callback"
  });
}

async function withLocalOAuthConfigStore(run: (dataDir: string) => Promise<void>) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dreamwish-oauth-config-"));
  const original = { ...process.env };
  process.env = {
    ...original,
    DATA_DIR: dataDir,
    APP_URL: "https://dreamwish.co.kr",
    INTEGRATION_TOKEN_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY
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
