import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { verifyProviderAccessToken } from "../src/lib/oauth/provider-verification";

test("provider verification normalizes Google Slack GitHub Notion and Discord identities", async () => {
  const cases = [
    {
      provider: "google" as const,
      payload: {
        sub: "google-1",
        name: "Google User",
        email: "google@example.com",
        picture: "https://example.com/google.png"
      },
      expected: {
        providerAccountId: "google-1",
        accountName: "Google User",
        accountEmail: "google@example.com",
        accountAvatarUrl: "https://example.com/google.png",
        workspaceId: null,
        workspaceName: null
      }
    },
    {
      provider: "slack" as const,
      payload: {
        ok: true,
        user_id: "slack-user-1",
        user: "slack-user",
        team_id: "slack-team-1",
        team: "Dreamwish"
      },
      expected: {
        providerAccountId: "slack-user-1",
        accountName: "slack-user",
        accountEmail: null,
        accountAvatarUrl: null,
        workspaceId: "slack-team-1",
        workspaceName: "Dreamwish"
      }
    },
    {
      provider: "github" as const,
      payload: {
        id: 42,
        login: "octocat",
        name: "Octo Cat",
        email: "octo@example.com",
        avatar_url: "https://example.com/octo.png"
      },
      expected: {
        providerAccountId: "42",
        accountName: "Octo Cat",
        accountEmail: "octo@example.com",
        accountAvatarUrl: "https://example.com/octo.png",
        workspaceId: null,
        workspaceName: null
      }
    },
    {
      provider: "notion" as const,
      payload: {
        id: "notion-bot-1",
        name: "Dreamwish Notion",
        avatar_url: "https://example.com/notion.png",
        bot: {
          workspace_name: "Dreamwish",
          owner: { type: "user", user: { person: { email: "notion@example.com" } } }
        }
      },
      expected: {
        providerAccountId: "notion-bot-1",
        accountName: "Dreamwish Notion",
        accountEmail: "notion@example.com",
        accountAvatarUrl: "https://example.com/notion.png",
        workspaceId: null,
        workspaceName: "Dreamwish"
      }
    },
    {
      provider: "discord" as const,
      payload: {
        id: "discord-1",
        username: "discord-user",
        global_name: "Discord User",
        email: "discord@example.com",
        avatar: "avatar-hash"
      },
      expected: {
        providerAccountId: "discord-1",
        accountName: "Discord User",
        accountEmail: "discord@example.com",
        accountAvatarUrl: "https://cdn.discordapp.com/avatars/discord-1/avatar-hash.png",
        workspaceId: null,
        workspaceName: null
      }
    }
  ];

  for (const item of cases) {
    const result = await verifyProviderAccessToken({
      provider: item.provider,
      accessToken: "provider-secret-token",
      fetchImpl: async () => jsonResponse(item.payload)
    });
    assert.equal(result.ok, true, item.provider);
    if (result.ok) assert.deepEqual(result.identity, item.expected, item.provider);
  }
});

test("provider verification returns a safe error for HTTP and provider failures", async () => {
  const httpFailure = await verifyProviderAccessToken({
    provider: "github",
    accessToken: "do-not-leak-this-token",
    fetchImpl: async () => jsonResponse({ message: "Bad credentials" }, 401)
  });
  assert.deepEqual(httpFailure, {
    ok: false,
    error: "GitHub account verification failed (401)."
  });
  assert.doesNotMatch(JSON.stringify(httpFailure), /do-not-leak-this-token/u);

  const slackFailure = await verifyProviderAccessToken({
    provider: "slack",
    accessToken: "do-not-leak-this-token",
    fetchImpl: async () => jsonResponse({ ok: false, error: "invalid_auth" })
  });
  assert.deepEqual(slackFailure, {
    ok: false,
    error: "Slack account verification failed: invalid_auth."
  });
});

test("OAuth callback verifies the exchanged token before persisting an active connection", async () => {
  const source = await fs.readFile(
    path.join(process.cwd(), "src/lib/oauth/oauth-callback.ts"),
    "utf8"
  );
  assert.match(source, /verifyProviderAccessToken\(/u);
  assert.match(source, /if \(!verification\.ok\)/u);
  assert.match(source, /verifiedAt:/u);
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
