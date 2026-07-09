import { createGoogleOAuthAuthorizationUrl } from "./google-oauth";
import type {
  OAuthAuthorizationRequest,
  OAuthProviderId,
  OAuthTokenExchangeInput,
  OAuthTokenExchangeResult
} from "./oauth.types";
import { exchangeSlackOAuthCode, createSlackOAuthAuthorizationUrl } from "./slack-oauth";
import { exchangeGoogleOAuthCode } from "./google-oauth";

export function createOAuthAuthorizationUrl(request: OAuthAuthorizationRequest) {
  if (request.provider === "google") return createGoogleOAuthAuthorizationUrl(request);
  return createSlackOAuthAuthorizationUrl(request);
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

export function assertOAuthProvider(provider: string): OAuthProviderId {
  if (provider === "google" || provider === "slack") return provider;
  throw new Error(`지원하지 않는 OAuth provider입니다: ${provider}`);
}

function addSeconds(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}
