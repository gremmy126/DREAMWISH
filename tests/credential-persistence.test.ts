import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  isCredentialPersistenceError,
  revealCredential,
  saveCredentialValues,
  saveVerifiedCredential
} from "../src/lib/automation/credential.repository";
import { resolveStructuredActionCredential, validateActionConnection } from "../src/lib/automation/action-credential.service";

test("credential-backed apps require a selected connection even when the provider has no OAuth scopes", async () => {
  await assert.rejects(
    () => validateActionConnection({ ownerId: "owner-a", connectionId: null, appId: "telegram", requiredScopes: [] }),
    (error: unknown) => (error as { code?: string }).code === "CONNECTION_REQUIRED"
  );
  assert.equal(
    (await validateActionConnection({ ownerId: "owner-a", connectionId: null, appId: "ai", requiredScopes: [] })).credentialStatus,
    "valid"
  );
});

test("production credentials fall back to the integration key and retain their key identity", async () => {
  await withCredentialEnvironment(async () => {
    Reflect.set(process.env, "NODE_ENV", "production");
    process.env.INTEGRATION_TOKEN_ENCRYPTION_KEY = "integration-key-for-test";

    const saved = await saveCredentialValues({
      ownerId: "owner-a",
      appId: "notion",
      label: "Notion",
      values: { integrationToken: "secret-notion-token" }
    });
    assert.equal(saved.keyId, "integration");
    assert.equal("ciphertext" in saved, false);
    assert.equal("iv" in saved, false);
    assert.equal("authTag" in saved, false);

    process.env.AUTOMATION_CREDENTIAL_ENCRYPTION_KEY = "new-preferred-key";
    assert.deepEqual(
      JSON.parse((await revealCredential("owner-a", saved.id)) || "{}"),
      { integrationToken: "secret-notion-token" }
    );
  });
});

test("production credential storage fails closed with a typed safe error", async () => {
  await withCredentialEnvironment(async () => {
    Reflect.set(process.env, "NODE_ENV", "production");
    await assert.rejects(
      () =>
        saveCredentialValues({
          ownerId: "owner-a",
          appId: "notion",
          label: "Notion",
          values: { integrationToken: "must-not-leak" }
        }),
      (error: unknown) =>
        isCredentialPersistenceError(error) &&
        error.code === "CREDENTIAL_ENCRYPTION_NOT_CONFIGURED" &&
        !error.message.includes("must-not-leak")
    );
  });
});

test("credential API maps persistence failures without returning encrypted material", async () => {
  const source = await fs.readFile("app/api/automation/credentials/route.ts", "utf8");
  assert.match(source, /isCredentialPersistenceError/u);
  assert.match(source, /error\.code/u);
  assert.doesNotMatch(source, /ciphertext|authTag|\.secret\b/u);
});

test("verified structured credentials resolve for the same owner and app only", async () => {
  await withCredentialEnvironment(async () => {
    const saved = await saveVerifiedCredential({
      ownerId: "owner-a",
      appId: "notion",
      label: "Notion key",
      values: { integrationToken: "secret-notion-token" },
      accountLabel: "DREAMWISH Notion"
    });
    const resolved = await resolveStructuredActionCredential("owner-a", saved.id, "notion");
    assert.equal(resolved.accountLabel, "DREAMWISH Notion");
    assert.equal(resolved.values.integrationToken, "secret-notion-token");
    await assert.rejects(
      () => resolveStructuredActionCredential("owner-a", saved.id, "github"),
      /선택한 키를 이 앱에서 사용할 수 없습니다/u
    );
  });
});

async function withCredentialEnvironment(run: () => Promise<void>) {
  const names = [
    "DATA_DIR",
    "DATABASE_URL",
    "NODE_ENV",
    "AUTOMATION_CREDENTIAL_ENCRYPTION_KEY",
    "INTEGRATION_TOKEN_ENCRYPTION_KEY",
    "OAUTH_TOKEN_ENCRYPTION_KEY"
  ] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dreamwish-credentials-"));
  for (const name of names) Reflect.deleteProperty(process.env, name);
  process.env.DATA_DIR = dataDir;
  try {
    await run();
  } finally {
    for (const name of names) {
      const value = previous[name];
      if (value === undefined) Reflect.deleteProperty(process.env, name);
      else Reflect.set(process.env, name, value);
    }
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}
