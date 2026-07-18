import {
  getDefaultOAuthScopes,
  getOAuthClientId,
  getOAuthClientSecret,
  getOAuthProviderConfig
} from "./oauth-provider-registry";
import type { OAuthAuthorizationRequest } from "./oauth.types";

export const SLACK_OAUTH_SCOPES = [
  "channels:read",
  "groups:read",
  "im:read",
  "mpim:read",
  "chat:write",
  "users:read",
  "team:read"
] as const;

export function createSlackOAuthAuthorizationUrl(request: OAuthAuthorizationRequest) {
  const config = getOAuthProviderConfig("slack");
  const url = new URL(config.authorizationUrl);
  url.searchParams.set("client_id", request.clientId || getOAuthClientId("slack"));
  url.searchParams.set("redirect_uri", request.redirectUri);
  url.searchParams.set("state", request.state);
  url.searchParams.set(
    "scope",
    (request.scopes || getDefaultOAuthScopes("slack", request.service)).join(",")
  );
  return url;
}

export async function exchangeSlackOAuthCode(
  code: string,
  redirectUri: string,
  credentials?: { clientId: string; clientSecret: string }
) {
  const response = await fetch(getOAuthProviderConfig("slack").tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials?.clientId || getOAuthClientId("slack"),
      client_secret: credentials?.clientSecret || getOAuthClientSecret("slack"),
      code,
      redirect_uri: redirectUri
    })
  });
  const data = (await response.json()) as {
    ok?: boolean;
    access_token?: string;
    authed_user?: { id?: string; access_token?: string };
    bot_user_id?: string;
    scope?: string;
    token_type?: string;
    refresh_token?: string;
    expires_in?: number;
    team?: { id?: string; name?: string };
    enterprise?: { id?: string; name?: string };
    error?: string;
  };

  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Slack OAuth token exchange failed.");
  }

  return data;
}
