import type { OAuthAuthorizationRequest } from "./oauth.types";

export const GITHUB_OAUTH_SCOPES = ["repo", "read:user", "user:email"] as const;

export function createGitHubOAuthAuthorizationUrl(request: OAuthAuthorizationRequest) {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID || "");
  url.searchParams.set("redirect_uri", request.redirectUri);
  url.searchParams.set("state", request.state);
  url.searchParams.set("scope", (request.scopes || [...GITHUB_OAUTH_SCOPES]).join(" "));
  return url;
}

export async function exchangeGitHubOAuthCode(code: string, redirectUri: string) {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: process.env.GITHUB_CLIENT_ID || "",
      client_secret: process.env.GITHUB_CLIENT_SECRET || "",
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
