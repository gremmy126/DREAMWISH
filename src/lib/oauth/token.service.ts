import { decryptToken } from "./token-encryption";
import type {
  ConnectableOAuthProviderId,
  OAuthConnectionState,
  OAuthProviderId,
  OAuthServiceId
} from "./oauth.types";
import {
  getOAuthClientId,
  getOAuthClientSecret
} from "./oauth-provider-registry";
import {
  listOAuthTokens,
  saveOAuthToken
} from "../repositories/oauth-token.repository";

export async function getActiveAccessToken(
  ownerId: string,
  provider: OAuthProviderId,
  service?: OAuthServiceId | null
) {
  if (provider === "firebase") return null;

  let token = (await listOAuthTokens(ownerId)).find(
    (item) =>
      item.provider === provider &&
      item.status === "active" &&
      (!service || (item.service || item.provider) === service)
  );
  if (!token || !token.verifiedAt) return null;
  if (token.expiresAt && new Date(token.expiresAt).getTime() <= Date.now() + 60000) {
    token = (await refreshOAuthToken(ownerId, provider, service)) || token;
  }
  return decryptToken(token.accessTokenEncrypted);
}

export async function getOAuthConnectionStatus(
  ownerId: string,
  provider: OAuthProviderId,
  service?: OAuthServiceId | null
) {
  const token = (await listOAuthTokens(ownerId)).find(
    (item) =>
      item.provider === provider &&
      (!service || (item.service || item.provider) === service)
  );
  const envToken = getEnvAccessToken(provider);
  const firebaseConfigured =
    provider === "firebase" &&
    Boolean(
      process.env.FIREBASE_PROJECT_ID?.trim() ||
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim()
    );

  const connectionState = resolveConnectionState({
    token,
    envToken: Boolean(envToken),
    firebaseConfigured
  });

  return {
    provider,
    service: service || null,
    connectionState,
    connected: connectionState === "connected",
    configured: connectionState !== "not_connected",
    accountEmail: token?.accountEmail || null,
    accountName: token?.accountName || null,
    workspaceName: token?.workspaceName || null,
    scope: token?.scope || [],
    expiresAt: token?.expiresAt || null,
    verifiedAt: token?.verifiedAt || null,
    lastVerificationError: token?.lastVerificationError || null
  };
}

function resolveConnectionState(input: {
  token: Awaited<ReturnType<typeof listOAuthTokens>>[number] | undefined;
  envToken: boolean;
  firebaseConfigured: boolean;
}): OAuthConnectionState {
  if (input.token) {
    if (input.token.status === "revoked") return "revoked";
    if (
      input.token.status === "expired" ||
      (input.token.expiresAt && new Date(input.token.expiresAt).getTime() <= Date.now())
    ) {
      return "expired";
    }
    if (input.token.lastVerificationError) return "error";
    if (input.token.status === "active" && input.token.verifiedAt) return "connected";
    return "configured_unverified";
  }
  if (input.firebaseConfigured) return "configuration_only";
  if (input.envToken) return "configured_unverified";
  return "not_connected";
}

export async function refreshOAuthToken(
  ownerId: string,
  provider: ConnectableOAuthProviderId,
  service?: OAuthServiceId | null
) {
  const token = (await listOAuthTokens(ownerId)).find(
    (item) =>
      item.provider === provider &&
      item.status === "active" &&
      (!service || (item.service || item.provider) === service)
  );
  if (!token || token.status !== "active") return null;

  const refreshToken = decryptToken(token.refreshTokenEncrypted);
  if (!refreshToken) return token;
  if (provider !== "google") return token;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getOAuthClientId("google"),
      client_secret: getOAuthClientSecret("google"),
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });

  if (!response.ok) throw new Error("Google refresh token failed.");
  const data = (await response.json()) as {
    access_token: string;
    expires_in?: number;
    scope?: string;
  };

  return saveOAuthToken({
    ownerId,
    provider: "google",
    service: token.service || "drive",
    providerAccountId: token.providerAccountId,
    accountName: token.accountName,
    accountEmail: token.accountEmail,
    accountAvatarUrl: token.accountAvatarUrl,
    workspaceId: token.workspaceId,
    workspaceName: token.workspaceName,
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

  if (provider === "github") {
    return process.env.GITHUB_TOKEN || process.env.GITHUB_OAUTH_TOKEN || null;
  }

  if (provider === "notion") {
    return process.env.NOTION_ACCESS_TOKEN || process.env.NOTION_TOKEN || null;
  }

  if (provider === "discord") {
    return process.env.DISCORD_ACCESS_TOKEN || process.env.DISCORD_BOT_TOKEN || null;
  }

  if (provider === "firebase") {
    return null;
  }

  return (
    process.env.GOOGLE_ACCESS_TOKEN ||
    process.env.GOOGLE_OAUTH_TOKEN ||
    process.env.GMAIL_ACCESS_TOKEN ||
    null
  );
}
