import assert from "node:assert/strict";
import {
  getIntegrationConnectPath,
  getIntegrationDisconnectPath
} from "../src/lib/oauth/oauth-connect-url";
import { createOAuthAuthorizationUrl } from "../src/lib/oauth/oauth.service";
import {
  getOAuthRedirectDiagnostic,
  getOAuthRedirectUri
} from "../src/lib/oauth/oauth-redirect";
import {
  createOAuthSecurityParams,
  createS256CodeChallenge
} from "../src/lib/oauth/oauth-state";

test("getOAuthRedirectUri builds canonical integration callback urls from APP_URL", () => {
  withEnv(
    {
      APP_URL: "https://dreamwish.co.kr/",
      GOOGLE_REDIRECT_URI: undefined
    },
    () => {
      assert.equal(
        getOAuthRedirectUri("google", "http://127.0.0.1:3100/api/integrations/google/connect"),
        "https://dreamwish.co.kr/api/integrations/google/callback"
      );
    }
  );
});

test("getOAuthRedirectUri ignores a stale provider redirect and keeps the canonical callback", () => {
  withEnv(
    {
      APP_URL: "https://dreamwish.co.kr",
      GOOGLE_REDIRECT_URI: "https://old.example.com/oauth/google"
    },
    () => {
      assert.equal(
        getOAuthRedirectUri("google", "https://dreamwish.co.kr/api/integrations/google/connect"),
        "https://dreamwish.co.kr/api/integrations/google/callback"
      );
    }
  );
});

test("getOAuthRedirectDiagnostic reports configured redirect drift without exposing secrets", () => {
  withEnv(
    {
      APP_URL: "https://dreamwish.co.kr",
      GOOGLE_REDIRECT_URI: "https://old.example.com/oauth/google?token=secret"
    },
    () => {
      assert.deepEqual(
        getOAuthRedirectDiagnostic(
          "google",
          "https://dreamwish.co.kr/api/integrations/google/connect"
        ),
        {
          matches: false,
          expected: "https://dreamwish.co.kr/api/integrations/google/callback",
          configured: "https://old.example.com/oauth/google"
        }
      );
    }
  );
});

test("getOAuthRedirectUri rejects localhost APP_URL in hosted deployments", () => {
  withEnv(
    {
      APP_URL: "http://localhost:3000",
      RAILWAY_ENVIRONMENT: "production",
      GOOGLE_REDIRECT_URI: undefined
    },
    () => {
      assert.throws(
        () => getOAuthRedirectUri("google", "https://dreamwish.co.kr/api/integrations/google/connect"),
        /APP_URL must be a public URL in hosted deployments/u
      );
    }
  );
});

test("Google Drive authorization url uses only drive scopes and PKCE", () => {
  withEnv(
    {
      GOOGLE_CLIENT_ID: "google-client",
      GOOGLE_REDIRECT_URI: "https://dreamwish.co.kr/api/integrations/google/callback"
    },
    () => {
      const url = createOAuthAuthorizationUrl({
        provider: "google",
        service: "drive",
        redirectUri: "https://dreamwish.co.kr/api/integrations/google/callback",
        state: "state-1",
        codeChallenge: "challenge-1"
      });

      assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
      assert.equal(url.searchParams.get("client_id"), "google-client");
      assert.equal(
        url.searchParams.get("redirect_uri"),
        "https://dreamwish.co.kr/api/integrations/google/callback"
      );
      assert.equal(url.searchParams.get("include_granted_scopes"), "true");
      assert.equal(url.searchParams.get("code_challenge"), "challenge-1");
      assert.equal(url.searchParams.get("code_challenge_method"), "S256");
      assert.deepEqual(url.searchParams.get("scope")?.split(" ").sort(), [
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
        "openid"
      ]);
    }
  );
});

test("Slack authorization url uses Slack OAuth v2 bot scopes", () => {
  withEnv(
    {
      SLACK_CLIENT_ID: "slack-client",
      SLACK_REDIRECT_URI: "https://dreamwish.co.kr/api/integrations/slack/callback"
    },
    () => {
      const url = createOAuthAuthorizationUrl({
        provider: "slack",
        redirectUri: "https://dreamwish.co.kr/api/integrations/slack/callback",
        state: "state-1",
        codeChallenge: "unused-for-slack"
      });

      assert.equal(url.origin + url.pathname, "https://slack.com/oauth/v2/authorize");
      assert.deepEqual(url.searchParams.get("scope")?.split(",").sort(), [
        "channels:read",
        "chat:write",
        "groups:read",
        "im:read",
        "mpim:read",
        "team:read",
        "users:read"
      ]);
    }
  );
});

test("Discord authorization url is generated through the same server-side flow", () => {
  withEnv(
    {
      DISCORD_CLIENT_ID: "discord-client",
      DISCORD_REDIRECT_URI: "https://dreamwish.co.kr/api/integrations/discord/callback"
    },
    () => {
      const url = createOAuthAuthorizationUrl({
        provider: "discord",
        redirectUri: "https://dreamwish.co.kr/api/integrations/discord/callback",
        state: "state-1",
        codeChallenge: "challenge-1"
      });

      assert.equal(url.origin + url.pathname, "https://discord.com/oauth2/authorize");
      assert.equal(url.searchParams.get("client_id"), "discord-client");
      assert.equal(url.searchParams.get("scope"), "identify email");
      assert.equal(
        url.searchParams.get("redirect_uri"),
        "https://dreamwish.co.kr/api/integrations/discord/callback"
      );
    }
  );
});

test("Integration connect paths point only to first-party server APIs", () => {
  assert.equal(
    getIntegrationConnectPath({ provider: "google", service: "gmail" }),
    "/api/integrations/google/connect?service=gmail"
  );
  assert.equal(
    getIntegrationDisconnectPath({ provider: "google", service: "calendar" }),
    "/api/integrations/google/disconnect?service=calendar"
  );
  assert.equal(
    getIntegrationConnectPath({ provider: "slack", service: "slack" }),
    "/api/integrations/slack/connect"
  );
});

test("OAuth state and PKCE params are high entropy and use S256 challenge", () => {
  const first = createOAuthSecurityParams();
  const second = createOAuthSecurityParams();

  assert.notEqual(first.state, second.state);
  assert.notEqual(first.codeVerifier, second.codeVerifier);
  assert.equal(first.codeChallenge, createS256CodeChallenge(first.codeVerifier));
  assert.match(first.state, /^[A-Za-z0-9_-]{40,}$/u);
  assert.match(first.codeVerifier, /^[A-Za-z0-9_-]{80,}$/u);
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
