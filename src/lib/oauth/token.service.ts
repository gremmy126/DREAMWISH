import { decryptToken } from "./token-encryption";
import type { OAuthProviderId } from "./oauth.types";
import {
  listOAuthTokens,
  saveOAuthToken
} from "@/src/lib/repositories/oauth-token.repository";

export async function getActiveAccessToken(provider: OAuthProviderId) {
  let token = (await listOAuthTokens()).find(
    (item) => item.provider === provider && item.status === "active"
  );
  if (!token) return getEnvAccessToken(provider);
  if (token.expiresAt && new Date(token.expiresAt).getTime() <= Date.now() + 60000) {
    token = (await refreshOAuthToken(provider)) || token;
  }
  return decryptToken(token.accessTokenEncrypted);
}

export async function getOAuthConnectionStatus(provider: OAuthProviderId) {
  const token = (await listOAuthTokens()).find((item) => item.provider === provider);
  const envToken = getEnvAccessToken(provider);
  return {
    provider,
    connected: token?.status === "active" || Boolean(envToken),
    accountEmail: token?.accountEmail || (envToken ? `${provider} token from env` : null),
    scope: token?.scope || [],
    expiresAt: token?.expiresAt || null
  };
}

export async function refreshOAuthToken(provider: OAuthProviderId) {
  const token = (await listOAuthTokens()).find((item) => item.provider === provider);
  if (!token || token.status !== "active") return null;

  const refreshToken = decryptToken(token.refreshTokenEncrypted);
  if (!refreshToken) return token;
  if (provider !== "google") return token;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });

  if (!response.ok) throw new Error("Google Refresh Token 갱신에 실패했습니다.");
  const data = (await response.json()) as {
    access_token: string;
    expires_in?: number;
    scope?: string;
  };

  return saveOAuthToken({
    provider: "google",
    accountEmail: token.accountEmail,
    accessToken: data.access_token,
    refreshToken,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : token.expiresAt,
    scope: data.scope?.split(" ").filter(Boolean) || token.scope
  });
}

function getEnvAccessToken(provider: OAuthProviderId) {
  if (provider === "slack") {
    return process.env.SLACK_BOT_TOKEN || process.env.SLACK_ACCESS_TOKEN || null;
  }

  return (
    process.env.GOOGLE_ACCESS_TOKEN ||
    process.env.GOOGLE_OAUTH_TOKEN ||
    process.env.GMAIL_ACCESS_TOKEN ||
    null
  );
}
