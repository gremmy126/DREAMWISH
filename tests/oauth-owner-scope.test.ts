import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  consumeOAuthSession,
  createOAuthSession
} from "../src/lib/repositories/oauth-session.repository";
import {
  listOAuthTokens,
  revokeOAuthToken,
  saveOAuthToken
} from "../src/lib/repositories/oauth-token.repository";

test("OAuth sessions belong to one owner and reject cross-owner callback consumption", async () => {
  await withTempDataDir(async () => {
    await createOAuthSession({
      ownerId: "owner-a",
      provider: "google",
      service: "gmail",
      state: "owner-a-state",
      redirectUri: "https://dreamwish.co.kr/api/integrations/google/callback"
    });

    await assert.rejects(
      consumeOAuthSession({
        ownerId: "owner-b",
        state: "owner-a-state",
        provider: "google"
      }),
      /invalid or expired/u
    );

    const session = await consumeOAuthSession({
      ownerId: "owner-a",
      state: "owner-a-state",
      provider: "google"
    });
    assert.equal(session.ownerId, "owner-a");
  });
});

test("OAuth token save list and revoke operations are isolated by owner", async () => {
  await withTempDataDir(async () => {
    await saveOAuthToken({
      ownerId: "owner-a",
      provider: "google",
      service: "gmail",
      providerAccountId: "google-a",
      accountEmail: "a@example.com",
      accessToken: "access-a",
      scope: ["gmail.readonly"]
    });
    await saveOAuthToken({
      ownerId: "owner-b",
      provider: "google",
      service: "gmail",
      providerAccountId: "google-b",
      accountEmail: "b@example.com",
      accessToken: "access-b",
      scope: ["gmail.readonly"]
    });

    const ownerATokens = await listOAuthTokens("owner-a");
    assert.deepEqual(ownerATokens.map((token) => token.accountEmail), ["a@example.com"]);

    await revokeOAuthToken("owner-a", "google", "gmail");
    assert.equal((await listOAuthTokens("owner-a"))[0]?.status, "revoked");
    assert.equal((await listOAuthTokens("owner-b"))[0]?.status, "active");
  });
});

test("legacy ownerless OAuth tokens remain quarantined from authenticated owners", async () => {
  await withTempDataDir(async (dataDir) => {
    await fs.writeFile(
      path.join(dataDir, "oauth-tokens.json"),
      JSON.stringify({
        tokens: [
          {
            id: "legacy-token",
            provider: "github",
            service: "github",
            providerAccountId: "legacy",
            accountName: "Legacy",
            accountEmail: "legacy@example.com",
            accountAvatarUrl: null,
            workspaceId: null,
            workspaceName: null,
            accessTokenEncrypted: "unreadable",
            refreshTokenEncrypted: "unreadable",
            expiresAt: null,
            scope: [],
            status: "active",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z"
          }
        ]
      }),
      "utf8"
    );

    assert.deepEqual(await listOAuthTokens("owner-a"), []);
  });
});

test("OAuth connect callback status and disconnect routes derive the owner from the session", async () => {
  const routePaths = [
    "app/api/integrations/[connectorId]/connect/route.ts",
    "app/api/integrations/[connectorId]/callback/route.ts",
    "app/api/integrations/[connectorId]/disconnect/route.ts",
    "app/api/integrations/[connectorId]/sync/route.ts",
    "app/api/integrations/status/route.ts",
    "app/api/oauth/[provider]/disconnect/route.ts"
  ];

  for (const routePath of routePaths) {
    const source = await fs.readFile(path.join(process.cwd(), routePath), "utf8");
    assert.match(source, /requireOwnerContext\(request\)/u, routePath);
    assert.doesNotMatch(source, /x-owner-id/iu, routePath);
  }
});

async function withTempDataDir(run: (dataDir: string) => Promise<void>) {
  const previous = process.env.DATA_DIR;
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dreamwish-oauth-owner-"));
  process.env.DATA_DIR = dataDir;
  try {
    await run(dataDir);
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}
