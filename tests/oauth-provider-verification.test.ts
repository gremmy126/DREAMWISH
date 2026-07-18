import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { verifyProviderAccessToken } from "../src/lib/oauth/provider-verification";
import { AUTOMATION_APPS } from "../src/lib/automation/app-registry";
import {
  getOAuthAppTarget
} from "../src/lib/oauth/oauth-provider-adapter";
import { getOAuthProviderConfig } from "../src/lib/oauth/oauth-provider-registry";

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

test("all canonical OAuth targets resolve to a provider adapter", () => {
  for (const app of AUTOMATION_APPS.filter((item) => item.oauthTarget)) {
    const target = getOAuthAppTarget(app.id);
    assert.equal(target.provider, app.oauthTarget!.provider);
    assert.equal(target.service, app.oauthTarget!.service);
    assert.equal(getOAuthProviderConfig(target.provider).id, target.provider);
  }
});

test("Microsoft and Dropbox access tokens resolve verified provider identities", async () => {
  const microsoft = await verifyProviderAccessToken({
    provider: "microsoft",
    accessToken: "microsoft-secret-token",
    fetchImpl: async (url, init) => {
      assert.equal(String(url), "https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName");
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer microsoft-secret-token");
      return jsonResponse({
        id: "ms-user-1",
        displayName: "Microsoft User",
        mail: null,
        userPrincipalName: "microsoft@example.com"
      });
    }
  });
  assert.deepEqual(microsoft, {
    ok: true,
    identity: {
      providerAccountId: "ms-user-1",
      accountName: "Microsoft User",
      accountEmail: "microsoft@example.com",
      accountAvatarUrl: null,
      workspaceId: null,
      workspaceName: null
    }
  });

  const dropbox = await verifyProviderAccessToken({
    provider: "dropbox",
    accessToken: "dropbox-secret-token",
    fetchImpl: async (url, init) => {
      assert.equal(String(url), "https://api.dropboxapi.com/2/users/get_current_account");
      assert.equal(init?.method, "POST");
      return jsonResponse({
        account_id: "dbid:dropbox-1",
        email: "dropbox@example.com",
        name: { display_name: "Dropbox User" },
        team: { id: "team-1", name: "DREAMWISH" }
      });
    }
  });
  assert.deepEqual(dropbox, {
    ok: true,
    identity: {
      providerAccountId: "dbid:dropbox-1",
      accountName: "Dropbox User",
      accountEmail: "dropbox@example.com",
      accountAvatarUrl: null,
      workspaceId: "team-1",
      workspaceName: "DREAMWISH"
    }
  });
});

test("Notion OAuth account verification uses the current API version", async () => {
  const result = await verifyProviderAccessToken({
    provider: "notion",
    accessToken: "notion-oauth-token",
    fetchImpl: async (_url, init) => {
      assert.equal(
        new Headers(init?.headers).get("notion-version"),
        "2026-03-11"
      );
      return jsonResponse({ id: "notion-bot", name: "DREAMWISH" });
    }
  });
  assert.equal(result.ok, true);
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
