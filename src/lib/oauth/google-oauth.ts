import {
  getDefaultOAuthScopes,
  getOAuthClientId,
  getOAuthClientSecret,
  getOAuthProviderConfig
} from "./oauth-provider-registry";
import type { OAuthAuthorizationRequest } from "./oauth.types";

export const GOOGLE_OAUTH_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile"
] as const;

export function createGoogleOAuthAuthorizationUrl(request: OAuthAuthorizationRequest) {
  const config = getOAuthProviderConfig("google");
  const url = new URL(config.authorizationUrl);
  url.searchParams.set("client_id", getOAuthClientId("google"));
  url.searchParams.set("redirect_uri", request.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", request.state);
  url.searchParams.set(
    "scope",
    (request.scopes || getDefaultOAuthScopes("google", request.service)).join(" ")
  );
  if (request.codeChallenge) {
    url.searchParams.set("code_challenge", request.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  return url;
}

export async function exchangeGoogleOAuthCode(
  code: string,
  redirectUri: string,
  codeVerifier?: string | null
) {
  const body = new URLSearchParams({
    client_id: getOAuthClientId("google"),
    client_secret: getOAuthClientSecret("google"),
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri
  });
  if (codeVerifier) body.set("code_verifier", codeVerifier);

  const response = await fetch(getOAuthProviderConfig("google").tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    throw new Error("Google OAuth token exchange failed.");
  }

  return response.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    id_token?: string;
  }>;
}

export async function fetchGoogleAccountProfile(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    return {
      providerAccountId: null,
      accountName: null,
      accountEmail: "google-connected-account",
      accountAvatarUrl: null
    };
  }

  const data = (await response.json()) as {
    sub?: string;
    name?: string;
    email?: string;
    picture?: string;
  };
  return {
    providerAccountId: data.sub || null,
    accountName: data.name || data.email || null,
    accountEmail: data.email || "google-connected-account",
    accountAvatarUrl: data.picture || null
  };
}
