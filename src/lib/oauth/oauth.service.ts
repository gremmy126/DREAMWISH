import {
  createGitHubOAuthAuthorizationUrl,
  exchangeGitHubOAuthCode
} from "./github-oauth";
import {
  createGoogleOAuthAuthorizationUrl,
  exchangeGoogleOAuthCode
} from "./google-oauth";
import {
  createNotionOAuthAuthorizationUrl,
  exchangeNotionOAuthCode
} from "./notion-oauth";
import type {
  OAuthAuthorizationRequest,
  OAuthProviderId,
  OAuthTokenExchangeInput,
  OAuthTokenExchangeResult
} from "./oauth.types";
import {
  createSlackOAuthAuthorizationUrl,
  exchangeSlackOAuthCode
} from "./slack-oauth";

export function createOAuthAuthorizationUrl(request: OAuthAuthorizationRequest) {
  if (request.provider === "google") return createGoogleOAuthAuthorizationUrl(request);
  if (request.provider === "slack") return createSlackOAuthAuthorizationUrl(request);
  if (request.provider === "github") return createGitHubOAuthAuthorizationUrl(request);
  if (request.provider === "notion") return createNotionOAuthAuthorizationUrl(request);
  throw new Error("Firebase uses project configuration instead of OAuth authorization.");
}

export async function exchangeOAuthCode(
  input: OAuthTokenExchangeInput
): Promise<OAuthTokenExchangeResult> {
  if (input.provider === "google") {
    const token = await exchangeGoogleOAuthCode(input.code, input.redirectUri);
    return {
      provider: "google",
      accessToken: token.access_token,
      refreshToken: token.refresh_token || null,
      expiresAt: token.expires_in ? addSeconds(token.expires_in) : null,
      scope: token.scope?.split(" ").filter(Boolean) || [],
      accountEmail: "google-connected-account"
    };
  }

  if (input.provider === "slack") {
    const token = await exchangeSlackOAuthCode(input.code, input.redirectUri);
    return {
      provider: "slack",
      accessToken: token.access_token || token.authed_user?.access_token || "",
      refreshToken: null,
      expiresAt: null,
      scope: token.scope?.split(",").filter(Boolean) || [],
      accountEmail: token.team?.name || "slack-connected-workspace"
    };
  }

  if (input.provider === "github") {
    const token = await exchangeGitHubOAuthCode(input.code, input.redirectUri);
    return {
      provider: "github",
      accessToken: token.access_token || "",
      refreshToken: null,
      expiresAt: null,
      scope: token.scope?.split(",").filter(Boolean) || [],
      accountEmail: "github-connected-account"
    };
  }

  if (input.provider === "notion") {
    const token = await exchangeNotionOAuthCode(input.code, input.redirectUri);
    return {
      provider: "notion",
      accessToken: token.access_token || "",
      refreshToken: null,
      expiresAt: null,
      scope: [],
      accountEmail: token.workspace_name || token.bot_id || "notion-connected-workspace"
    };
  }

  throw new Error("Firebase uses project configuration instead of OAuth token exchange.");
}

export function assertOAuthProvider(provider: string): OAuthProviderId {
  if (
    provider === "google" ||
    provider === "slack" ||
    provider === "github" ||
    provider === "notion" ||
    provider === "firebase"
  ) {
    return provider;
  }
  throw new Error(`Unsupported OAuth provider: ${provider}`);
}

function addSeconds(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}
