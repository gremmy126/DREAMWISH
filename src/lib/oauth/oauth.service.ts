import {
  createDiscordOAuthAuthorizationUrl,
  exchangeDiscordOAuthCode,
  fetchDiscordAccountProfile
} from "./discord-oauth";
import {
  createGitHubOAuthAuthorizationUrl,
  exchangeGitHubOAuthCode,
  fetchGitHubAccountProfile
} from "./github-oauth";
import {
  createGoogleOAuthAuthorizationUrl,
  exchangeGoogleOAuthCode,
  fetchGoogleAccountProfile
} from "./google-oauth";
import {
  assertConnectableOAuthProvider,
  assertOAuthProvider,
  resolveOAuthService
} from "./oauth-provider-registry";
import {
  createNotionOAuthAuthorizationUrl,
  exchangeNotionOAuthCode
} from "./notion-oauth";
import type {
  OAuthAuthorizationRequest,
  OAuthTokenExchangeInput,
  OAuthTokenExchangeResult
} from "./oauth.types";
import {
  createSlackOAuthAuthorizationUrl,
  exchangeSlackOAuthCode
} from "./slack-oauth";

export { assertConnectableOAuthProvider, assertOAuthProvider, resolveOAuthService };

export function createOAuthAuthorizationUrl(request: OAuthAuthorizationRequest) {
  if (request.provider === "google") return createGoogleOAuthAuthorizationUrl(request);
  if (request.provider === "slack") return createSlackOAuthAuthorizationUrl(request);
  if (request.provider === "github") return createGitHubOAuthAuthorizationUrl(request);
  if (request.provider === "notion") return createNotionOAuthAuthorizationUrl(request);
  if (request.provider === "discord") return createDiscordOAuthAuthorizationUrl(request);
  throw new Error("Unsupported OAuth provider.");
}

export async function exchangeOAuthCode(
  input: OAuthTokenExchangeInput
): Promise<OAuthTokenExchangeResult> {
  const service = input.service || resolveOAuthService(input.provider, null);
  const credentials = input.clientId && input.clientSecret
    ? { clientId: input.clientId, clientSecret: input.clientSecret }
    : undefined;

  if (input.provider === "google") {
    const token = await exchangeGoogleOAuthCode(
      input.code,
      input.redirectUri,
      input.codeVerifier,
      credentials
    );
    const profile = await fetchGoogleAccountProfile(token.access_token);
    return {
      provider: "google",
      service,
      accessToken: token.access_token,
      refreshToken: token.refresh_token || null,
      expiresAt: token.expires_in ? addSeconds(token.expires_in) : null,
      scope: token.scope?.split(" ").filter(Boolean) || [],
      providerAccountId: profile.providerAccountId,
      accountName: profile.accountName,
      accountEmail: profile.accountEmail,
      accountAvatarUrl: profile.accountAvatarUrl,
      workspaceId: null,
      workspaceName: null
    };
  }

  if (input.provider === "slack") {
    const token = await exchangeSlackOAuthCode(input.code, input.redirectUri, credentials);
    return {
      provider: "slack",
      service,
      accessToken: token.access_token || token.authed_user?.access_token || "",
      refreshToken: token.refresh_token || null,
      expiresAt: token.expires_in ? addSeconds(token.expires_in) : null,
      scope: token.scope?.split(",").filter(Boolean) || [],
      providerAccountId: token.authed_user?.id || token.team?.id || null,
      accountName: token.team?.name || token.enterprise?.name || null,
      accountEmail: token.team?.name || "slack-connected-workspace",
      accountAvatarUrl: null,
      workspaceId: token.team?.id || token.enterprise?.id || null,
      workspaceName: token.team?.name || token.enterprise?.name || null
    };
  }

  if (input.provider === "github") {
    const token = await exchangeGitHubOAuthCode(input.code, input.redirectUri, credentials);
    const profile = await fetchGitHubAccountProfile(token.access_token || "");
    return {
      provider: "github",
      service,
      accessToken: token.access_token || "",
      refreshToken: null,
      expiresAt: null,
      scope: token.scope?.split(",").filter(Boolean) || [],
      providerAccountId: profile.providerAccountId,
      accountName: profile.accountName,
      accountEmail: profile.accountEmail,
      accountAvatarUrl: profile.accountAvatarUrl,
      workspaceId: null,
      workspaceName: null
    };
  }

  if (input.provider === "notion") {
    const token = await exchangeNotionOAuthCode(input.code, input.redirectUri, credentials);
    return {
      provider: "notion",
      service,
      accessToken: token.access_token || "",
      refreshToken: token.refresh_token || null,
      expiresAt: null,
      scope: [],
      providerAccountId: token.bot_id || token.workspace_id || null,
      accountName: token.workspace_name || token.bot_id || null,
      accountEmail: token.workspace_name || token.bot_id || "notion-connected-workspace",
      accountAvatarUrl: token.workspace_icon || null,
      workspaceId: token.workspace_id || null,
      workspaceName: token.workspace_name || null
    };
  }

  if (input.provider === "discord") {
    const token = await exchangeDiscordOAuthCode(
      input.code,
      input.redirectUri,
      input.codeVerifier,
      credentials
    );
    const profile = await fetchDiscordAccountProfile(token.access_token || "");
    return {
      provider: "discord",
      service,
      accessToken: token.access_token || "",
      refreshToken: token.refresh_token || null,
      expiresAt: token.expires_in ? addSeconds(token.expires_in) : null,
      scope: token.scope?.split(" ").filter(Boolean) || [],
      providerAccountId: profile.providerAccountId,
      accountName: profile.accountName,
      accountEmail: profile.accountEmail,
      accountAvatarUrl: profile.accountAvatarUrl,
      workspaceId: null,
      workspaceName: null
    };
  }

  throw new Error("Unsupported OAuth provider.");
}

function addSeconds(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}
