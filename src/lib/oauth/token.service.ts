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
import { hasPostgresStorage } from "../db/postgres";
import {
  getIntegrationConnectionSecrets,
  listIntegrationConnections
} from "../repositories/integration-connection.repository";
import { refreshOAuthConnection } from "./oauth-connection.service";

export async function getActiveAccessToken(
  ownerId: string,
  provider: OAuthProviderId,
  service?: OAuthServiceId | null
) {
  if (provider === "firebase") return null;
  if (hasPostgresStorage()) {
    const connection = await findDurableConnection(ownerId, provider, service);
    if (!connection || connection.status !== "connected") return null;
    let secrets = await getIntegrationConnectionSecrets(ownerId, connection.id);
    if (!secrets) return null;
    if (connection.expiresAt && new Date(connection.expiresAt).getTime() <= Date.now() + 60_000) {
      const refreshed = await refreshOAuthConnection(ownerId, connection.id);
      if (refreshed.status !== "connected") return null;
      secrets = await getIntegrationConnectionSecrets(ownerId, connection.id);
    }
    return secrets?.accessToken || null;
  }

  const token = (await listOAuthTokens(ownerId)).find(
    (item) =>
      item.provider === provider &&
      item.status === "active" &&
      (!service || (item.service || item.provider) === service)
  );
  if (!token || !token.verifiedAt) return null;
  if (token.expiresAt && new Date(token.expiresAt).getTime() <= Date.now() + 60000) {
    const refreshed = await refreshOAuthToken(ownerId, provider, service);
    if (refreshed) return decryptToken(refreshed.accessTokenEncrypted);
  }
  return decryptToken(token.accessTokenEncrypted);
}

export async function getOAuthConnectionStatus(
  ownerId: string,
  provider: OAuthProviderId,
  service?: OAuthServiceId | null
) {
  if (provider !== "firebase" && hasPostgresStorage()) {
    const connection = await findDurableConnection(ownerId, provider, service);
    if (connection) {
      const expired = Boolean(connection.expiresAt && new Date(connection.expiresAt).getTime() <= Date.now());
      const connectionState: OAuthConnectionState = connection.status === "connected" && !expired
        ? "connected"
        : connection.status === "disconnected" || connection.status === "revoked"
          ? "revoked"
          : expired || connection.status === "token_expired"
            ? "expired"
            : "error";
      return {
        provider,
        service: service || null,
        connectionState,
        connected: connectionState === "connected",
        configured: true,
        accountEmail: connection.accountEmail,
        accountName: connection.accountLabel,
        workspaceName: connection.providerWorkspaceId,
        scope: connection.grantedScopes,
        expiresAt: connection.expiresAt,
        verifiedAt: connection.validatedAt || connection.connectedAt,
        lastVerificationError: connectionState === "error" ? connection.status : null
      };
    }
    const envToken = getEnvAccessToken(provider);
    return {
      provider,
      service: service || null,
      connectionState: envToken ? "configured_unverified" as const : "not_connected" as const,
      connected: false,
      configured: Boolean(envToken),
      accountEmail: null,
      accountName: null,
      workspaceName: null,
      scope: [] as string[],
      expiresAt: null,
      verifiedAt: null,
      lastVerificationError: null
    };
  }
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

async function findDurableConnection(
  ownerId: string,
  provider: Exclude<OAuthProviderId, "firebase">,
  service?: OAuthServiceId | null
) {
  const appIds = durableAppIds(provider, service);
  for (const appId of appIds) {
    const connections = await listIntegrationConnections(ownerId, appId);
    const connection = connections.find((candidate) => candidate.provider === provider && candidate.status === "connected")
      || connections.find((candidate) => candidate.provider === provider && !["disconnected", "revoked"].includes(candidate.status))
      || connections.find((candidate) => candidate.provider === provider);
    if (connection) return connection;
  }
  return null;
}

function durableAppIds(provider: Exclude<OAuthProviderId, "firebase">, service?: OAuthServiceId | null) {
  if (provider === "google") {
    if (service === "gmail") return ["gmail"];
    if (service === "calendar") return ["calendar"];
    if (service === "drive") return ["drive", "google-sheets"];
    return ["gmail", "drive", "google-sheets", "calendar"];
  }
  if (provider === "microsoft") {
    if (service === "outlook") return ["outlook"];
    if (service === "microsoft-teams") return ["microsoft-teams"];
    return ["onedrive", "outlook", "microsoft-teams"];
  }
  return [provider];
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
