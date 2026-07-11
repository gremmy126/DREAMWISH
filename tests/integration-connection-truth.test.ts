import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getOAuthConnectionStatus } from "../src/lib/oauth/token.service";
import {
  revokeOAuthToken,
  saveOAuthToken
} from "../src/lib/repositories/oauth-token.repository";

test("environment tokens are configured but unverified rather than connected", async () => {
  await withTempDataDir(async () => {
    await withEnv({ GITHUB_TOKEN: "environment-token" }, async () => {
      const status = await getOAuthConnectionStatus("owner-a", "github", "github");
      assert.equal(status.connectionState, "configured_unverified");
      assert.equal(status.connected, false);
      assert.equal(status.accountEmail, null);
    });
  });
});

test("only a verified active owner token is connected", async () => {
  await withTempDataDir(async () => {
    await saveOAuthToken({
      ownerId: "owner-a",
      provider: "google",
      service: "gmail",
      providerAccountId: "google-1",
      accountEmail: "verified@example.com",
      accessToken: "verified-token",
      scope: ["gmail.readonly"],
      verifiedAt: "2026-07-11T00:00:00.000Z"
    });

    const status = await getOAuthConnectionStatus("owner-a", "google", "gmail");
    assert.equal(status.connectionState, "connected");
    assert.equal(status.connected, true);
    assert.equal(status.accountEmail, "verified@example.com");
    assert.equal(status.verifiedAt, "2026-07-11T00:00:00.000Z");
  });
});

test("unverified expired and revoked tokens have distinct truthful states", async () => {
  await withTempDataDir(async () => {
    await saveOAuthToken({
      ownerId: "owner-a",
      provider: "github",
      service: "github",
      accountEmail: "unverified@example.com",
      accessToken: "unverified-token",
      scope: []
    });
    assert.equal(
      (await getOAuthConnectionStatus("owner-a", "github", "github")).connectionState,
      "configured_unverified"
    );

    await saveOAuthToken({
      ownerId: "owner-a",
      provider: "google",
      service: "calendar",
      accountEmail: "expired@example.com",
      accessToken: "expired-token",
      expiresAt: "2020-01-01T00:00:00.000Z",
      scope: [],
      verifiedAt: "2020-01-01T00:00:00.000Z"
    });
    assert.equal(
      (await getOAuthConnectionStatus("owner-a", "google", "calendar")).connectionState,
      "expired"
    );

    await revokeOAuthToken("owner-a", "github", "github");
    assert.equal(
      (await getOAuthConnectionStatus("owner-a", "github", "github")).connectionState,
      "revoked"
    );
  });
});

test("Firebase project settings are configuration only and never an account connection", async () => {
  await withTempDataDir(async () => {
    await withEnv({ NEXT_PUBLIC_FIREBASE_PROJECT_ID: "dreamwish" }, async () => {
      const status = await getOAuthConnectionStatus("owner-a", "firebase");
      assert.equal(status.connectionState, "configuration_only");
      assert.equal(status.connected, false);
      assert.equal(status.accountEmail, null);
    });
  });
});

test("integration status and UI expose truthful reconnect state with safe API parsing", async () => {
  const statusSource = await fs.readFile(
    path.join(process.cwd(), "src/lib/integrations/connection-status.ts"),
    "utf8"
  );
  const centerSource = await fs.readFile(
    path.join(process.cwd(), "components/Integrations/IntegrationCenter.tsx"),
    "utf8"
  );
  const connectSource = await fs.readFile(
    path.join(process.cwd(), "components/Integrations/OAuthConnectButton.tsx"),
    "utf8"
  );
  const disconnectSource = await fs.readFile(
    path.join(process.cwd(), "components/Integrations/IntegrationDisconnectButton.tsx"),
    "utf8"
  );

  assert.match(statusSource, /connectionState: oauth\.connectionState/u);
  assert.match(statusSource, /canReconnect:/u);
  assert.match(statusSource, /configuration_only/u);
  assert.match(centerSource, /readApiResponse/u);
  assert.match(centerSource, /connectionState/u);
  assert.match(connectSource, /reconnect/u);
  assert.match(disconnectSource, /readApiResponse/u);
});

async function withTempDataDir(run: () => Promise<void>) {
  const previous = process.env.DATA_DIR;
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dreamwish-connection-state-"));
  process.env.DATA_DIR = dataDir;
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}

async function withEnv(
  values: Record<string, string | undefined>,
  run: () => Promise<void>
) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
