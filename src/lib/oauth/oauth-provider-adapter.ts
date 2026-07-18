import { createOAuthAuthorizationUrl, exchangeOAuthCode } from "./oauth.service";
import { getOAuthProviderConfig } from "./oauth-provider-registry";
import type { OAuthClientCredentials } from "./oauth-app-config.types";
import type {
  ConnectableOAuthProviderId,
  OAuthServiceId,
  OAuthTokenExchangeResult
} from "./oauth.types";
import { verifyProviderAccessToken } from "./provider-verification";

export type OAuthAppTarget = {
  appId: string;
  provider: ConnectableOAuthProviderId;
  service: OAuthServiceId;
  scopes: string[];
};

export type OAuthRefreshResult = { accessToken: string; refreshToken: string | null; expiresAt: string | null; scopes: string[] | null };

export function getOAuthAppTarget(appId: string): OAuthAppTarget {
  const targets: Record<string, Omit<OAuthAppTarget, "appId">> = {
    gmail: { provider: "google", service: "gmail", scopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose", "https://www.googleapis.com/auth/gmail.modify", "https://www.googleapis.com/auth/gmail.send"] },
    drive: { provider: "google", service: "drive", scopes: ["https://www.googleapis.com/auth/drive.file"] },
    "google-sheets": { provider: "google", service: "sheets", scopes: ["https://www.googleapis.com/auth/spreadsheets"] },
    youtube: { provider: "google", service: "youtube", scopes: ["https://www.googleapis.com/auth/youtube", "https://www.googleapis.com/auth/youtube.upload"] },
    calendar: { provider: "google", service: "calendar", scopes: ["https://www.googleapis.com/auth/calendar.readonly", "https://www.googleapis.com/auth/calendar.events"] },
    slack: { provider: "slack", service: "slack", scopes: getOAuthProviderConfig("slack").defaultScopes },
    github: { provider: "github", service: "github", scopes: ["read:user", "user:email", "repo", "workflow"] },
    notion: { provider: "notion", service: "notion", scopes: [] },
    discord: { provider: "discord", service: "discord", scopes: ["identify", "email", "guilds"] },
    outlook: { provider: "microsoft", service: "outlook", scopes: ["openid", "profile", "email", "offline_access", "User.Read", "Mail.ReadWrite", "Mail.Send", "Calendars.ReadWrite"] },
    "microsoft-teams": { provider: "microsoft", service: "microsoft-teams", scopes: ["openid", "profile", "email", "offline_access", "User.Read", "ChannelMessage.Send", "ChatMessage.Send", "OnlineMeetings.ReadWrite"] },
    onedrive: { provider: "microsoft", service: "onedrive", scopes: ["openid", "profile", "email", "offline_access", "User.Read", "Files.ReadWrite.All"] },
    dropbox: { provider: "dropbox", service: "dropbox", scopes: getOAuthProviderConfig("dropbox").defaultScopes }
  };
  const target = targets[appId];
  if (!target) throw new Error(`OAuth is not supported for app: ${appId}`);
  return { appId, ...target, scopes: [...target.scopes] };
}

export function getOAuthAppIdForLegacyTarget(provider: ConnectableOAuthProviderId, service: OAuthServiceId | null) {
  if (provider === "google") {
    if (service === "gmail") return "gmail";
    if (service === "calendar") return "calendar";
    if (service === "sheets") return "google-sheets";
    if (service === "youtube") return "youtube";
    return "drive";
  }
  if (provider === "microsoft") {
    if (service === "outlook") return "outlook";
    if (service === "microsoft-teams") return "microsoft-teams";
    return "onedrive";
  }
  return provider;
}

export function createProviderAuthorizationUrl(input: {
  target: OAuthAppTarget;
  credentials: OAuthClientCredentials;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  requestedScopes?: string[];
}) {
  const scopes = input.requestedScopes?.length ? input.requestedScopes : input.target.scopes;
  const allowedScopes = new Set(input.target.scopes);
  if (scopes.some((scope) => !allowedScopes.has(scope))) throw new Error("Requested OAuth scopes exceed the app contract.");
  if (!["microsoft", "dropbox"].includes(input.target.provider)) {
    return createOAuthAuthorizationUrl({
      provider: input.target.provider,
      service: input.target.service,
      redirectUri: input.redirectUri,
      state: input.state,
      codeChallenge: getOAuthProviderConfig(input.target.provider).supportsPkce ? input.codeChallenge : undefined,
      scopes,
      clientId: input.credentials.clientId
    });
  }
  const config = getOAuthProviderConfig(input.target.provider);
  const url = new URL(config.authorizationUrl);
  url.searchParams.set("client_id", input.credentials.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (input.target.provider === "microsoft") url.searchParams.set("response_mode", "query");
  if (input.target.provider === "dropbox") url.searchParams.set("token_access_type", "offline");
  return url.toString();
}

export async function exchangeProviderAuthorizationCode(input: {
  target: OAuthAppTarget;
  credentials: OAuthClientCredentials;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<OAuthTokenExchangeResult> {
  if (!["microsoft", "dropbox"].includes(input.target.provider)) {
    return exchangeOAuthCode({
      provider: input.target.provider,
      service: input.target.service,
      code: input.code,
      redirectUri: input.redirectUri,
      codeVerifier: getOAuthProviderConfig(input.target.provider).supportsPkce ? input.codeVerifier : null,
      clientId: input.credentials.clientId,
      clientSecret: input.credentials.clientSecret
    });
  }
  const data = await requestToken(input.target.provider, input.credentials, {
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
    ...(input.target.provider === "microsoft" ? { scope: input.target.scopes.join(" ") } : {})
  });
  const identity = input.target.provider === "microsoft"
    ? await fetchMicrosoftIdentity(data.access_token)
    : await fetchDropboxIdentity(data.access_token);
  return {
    provider: input.target.provider,
    service: input.target.service,
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null,
    scope: parseScopes(data.scope) || input.target.scopes,
    providerAccountId: identity.id,
    accountName: identity.name,
    accountEmail: identity.email,
    accountAvatarUrl: null,
    workspaceId: identity.workspaceId,
    workspaceName: identity.workspaceName
  };
}

export async function refreshProviderToken(input: {
  provider: ConnectableOAuthProviderId;
  credentials: OAuthClientCredentials;
  refreshToken: string;
  scopes: string[];
}): Promise<OAuthRefreshResult> {
  const data = await requestToken(input.provider, input.credentials, {
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
    ...(input.provider === "microsoft" ? { scope: input.scopes.join(" ") } : {})
  });
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || null,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null,
    scopes: parseScopes(data.scope)
  };
}

export async function revokeProviderToken(provider: ConnectableOAuthProviderId, accessToken: string) {
  const request = provider === "dropbox"
    ? { url: "https://api.dropboxapi.com/2/auth/token/revoke", method: "POST" }
    : provider === "google"
      ? { url: `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`, method: "POST" }
      : provider === "slack"
        ? { url: "https://slack.com/api/auth.revoke", method: "POST" }
        : provider === "discord"
          ? { url: "https://discord.com/api/oauth2/token/revoke", method: "POST" }
          : null;
  if (!request) return { attempted: false, revoked: false, result: "provider_revoke_not_supported" };
  const response = await fetch(request.url, { method: request.method, headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10_000) });
  return { attempted: true, revoked: response.ok, result: response.ok ? "revoked" : `provider_http_${response.status}` };
}

export async function validateProviderToken(provider: ConnectableOAuthProviderId, accessToken: string) {
  if (provider === "microsoft") return fetchMicrosoftIdentity(accessToken);
  if (provider === "dropbox") return fetchDropboxIdentity(accessToken);
  const result = await verifyProviderAccessToken({ provider, accessToken });
  if (!result.ok) throw new Error(result.error);
  return {
    id: result.identity.providerAccountId,
    name: result.identity.accountName,
    email: result.identity.accountEmail,
    workspaceId: result.identity.workspaceId,
    workspaceName: result.identity.workspaceName
  };
}

async function requestToken(
  provider: ConnectableOAuthProviderId,
  credentials: OAuthClientCredentials,
  values: Record<string, string>
) {
  const isNotion = provider === "notion";
  const authorization = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64");
  const response = await fetch(getOAuthProviderConfig(provider).tokenUrl, {
    method: "POST",
    headers: isNotion
      ? { Authorization: `Basic ${authorization}`, "Content-Type": "application/json", "Notion-Version": "2026-03-11" }
      : { "Content-Type": "application/x-www-form-urlencoded" },
    body: isNotion
      ? JSON.stringify(values)
      : new URLSearchParams({
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret,
          ...values
        }),
    signal: AbortSignal.timeout(15_000)
  });
  const data = await response.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string; error_description?: string };
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || `${provider} token request failed.`);
  return data as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
}

async function fetchMicrosoftIdentity(accessToken: string) {
  const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName", { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10_000) });
  const data = await response.json().catch(() => ({})) as { id?: string; displayName?: string; mail?: string; userPrincipalName?: string };
  if (!response.ok || !data.id) throw new Error("Microsoft account verification failed.");
  return { id: data.id, name: data.displayName || data.mail || "Microsoft account", email: data.mail || data.userPrincipalName || "microsoft-account", workspaceId: null, workspaceName: null };
}

async function fetchDropboxIdentity(accessToken: string) {
  const response = await fetch("https://api.dropboxapi.com/2/users/get_current_account", { method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10_000) });
  const data = await response.json().catch(() => ({})) as { account_id?: string; email?: string; name?: { display_name?: string }; team?: { id?: string; name?: string } };
  if (!response.ok || !data.account_id) throw new Error("Dropbox account verification failed.");
  return { id: data.account_id, name: data.name?.display_name || data.email || "Dropbox account", email: data.email || "dropbox-account", workspaceId: data.team?.id || null, workspaceName: data.team?.name || null };
}

function parseScopes(value?: string) { return value ? value.split(/[ ,]+/u).filter(Boolean) : null; }
