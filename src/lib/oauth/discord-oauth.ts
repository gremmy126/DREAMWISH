import {
  getDefaultOAuthScopes,
  getOAuthClientId,
  getOAuthClientSecret,
  getOAuthProviderConfig
} from "./oauth-provider-registry";
import type { OAuthAuthorizationRequest } from "./oauth.types";

export const DISCORD_OAUTH_SCOPES = ["identify", "email"] as const;

export function createDiscordOAuthAuthorizationUrl(request: OAuthAuthorizationRequest) {
  const config = getOAuthProviderConfig("discord");
  const url = new URL(config.authorizationUrl);
  url.searchParams.set("client_id", request.clientId || getOAuthClientId("discord"));
  url.searchParams.set("redirect_uri", request.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", request.state);
  url.searchParams.set(
    "scope",
    (request.scopes || getDefaultOAuthScopes("discord", request.service)).join(" ")
  );
  if (request.codeChallenge) {
    url.searchParams.set("code_challenge", request.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url;
}

export async function exchangeDiscordOAuthCode(
  code: string,
  redirectUri: string,
  codeVerifier?: string | null,
  credentials?: { clientId: string; clientSecret: string }
) {
  const body = new URLSearchParams({
    client_id: credentials?.clientId || getOAuthClientId("discord"),
    client_secret: credentials?.clientSecret || getOAuthClientSecret("discord"),
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri
  });
  if (codeVerifier) body.set("code_verifier", codeVerifier);

  const response = await fetch(getOAuthProviderConfig("discord").tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Discord OAuth token exchange failed.");
  }

  return data;
}

export async function fetchDiscordAccountProfile(accessToken: string) {
  const response = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    return {
      providerAccountId: null,
      accountName: null,
      accountEmail: "discord-connected-account",
      accountAvatarUrl: null
    };
  }

  const data = (await response.json()) as {
    id?: string;
    username?: string;
    global_name?: string | null;
    email?: string | null;
    avatar?: string | null;
  };
  const avatarUrl =
    data.id && data.avatar
      ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png`
      : null;
  return {
    providerAccountId: data.id || null,
    accountName: data.global_name || data.username || data.email || null,
    accountEmail: data.email || data.username || "discord-connected-account",
    accountAvatarUrl: avatarUrl
  };
}
