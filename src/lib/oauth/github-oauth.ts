import {
  getDefaultOAuthScopes,
  getOAuthClientId,
  getOAuthClientSecret,
  getOAuthProviderConfig
} from "./oauth-provider-registry";
import type { OAuthAuthorizationRequest } from "./oauth.types";

export const GITHUB_OAUTH_SCOPES = ["read:user", "user:email"] as const;

export function createGitHubOAuthAuthorizationUrl(request: OAuthAuthorizationRequest) {
  const config = getOAuthProviderConfig("github");
  const url = new URL(config.authorizationUrl);
  url.searchParams.set("client_id", request.clientId || getOAuthClientId("github"));
  url.searchParams.set("redirect_uri", request.redirectUri);
  url.searchParams.set("state", request.state);
  url.searchParams.set(
    "scope",
    (request.scopes || getDefaultOAuthScopes("github", request.service)).join(" ")
  );
  url.searchParams.set("allow_signup", "false");
  return url;
}

export async function exchangeGitHubOAuthCode(
  code: string,
  redirectUri: string,
  credentials?: { clientId: string; clientSecret: string }
) {
  const response = await fetch(getOAuthProviderConfig("github").tokenUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: credentials?.clientId || getOAuthClientId("github"),
      client_secret: credentials?.clientSecret || getOAuthClientSecret("github"),
      code,
      redirect_uri: redirectUri
    })
  });
  const data = (await response.json()) as {
    access_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "GitHub OAuth token exchange failed.");
  }

  return data;
}

export async function fetchGitHubAccountProfile(accessToken: string) {
  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });
  if (!userResponse.ok) {
    return {
      providerAccountId: null,
      accountName: null,
      accountEmail: "github-connected-account",
      accountAvatarUrl: null
    };
  }

  const user = (await userResponse.json()) as {
    id?: number;
    login?: string;
    name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  };
  const email = user.email || (await fetchPrimaryGitHubEmail(accessToken));
  return {
    providerAccountId: user.id ? String(user.id) : user.login || null,
    accountName: user.name || user.login || email || null,
    accountEmail: email || user.login || "github-connected-account",
    accountAvatarUrl: user.avatar_url || null
  };
}

async function fetchPrimaryGitHubEmail(accessToken: string) {
  const response = await fetch("https://api.github.com/user/emails", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });
  if (!response.ok) return null;
  const emails = (await response.json()) as Array<{
    email?: string;
    primary?: boolean;
    verified?: boolean;
  }>;
  return (
    emails.find((item) => item.primary && item.verified)?.email ||
    emails.find((item) => item.primary)?.email ||
    emails.find((item) => item.email)?.email ||
    null
  );
}
