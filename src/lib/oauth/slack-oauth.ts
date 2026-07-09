import type { OAuthAuthorizationRequest } from "./oauth.types";

export const SLACK_OAUTH_SCOPES = [
  "channels:read",
  "channels:history",
  "users:read"
] as const;

export function createSlackOAuthAuthorizationUrl(request: OAuthAuthorizationRequest) {
  const url = new URL("https://slack.com/oauth/v2/authorize");
  url.searchParams.set("client_id", process.env.SLACK_CLIENT_ID || "");
  url.searchParams.set("redirect_uri", request.redirectUri);
  url.searchParams.set("state", request.state);
  url.searchParams.set("scope", (request.scopes || [...SLACK_OAUTH_SCOPES]).join(","));
  return url;
}

export async function exchangeSlackOAuthCode(code: string, redirectUri: string) {
  const response = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.SLACK_CLIENT_ID || "",
      client_secret: process.env.SLACK_CLIENT_SECRET || "",
      code,
      redirect_uri: redirectUri
    })
  });
  const data = (await response.json()) as {
    ok?: boolean;
    access_token?: string;
    authed_user?: { access_token?: string };
    scope?: string;
    team?: { name?: string };
  };

  if (!response.ok || !data.ok) {
    throw new Error("Slack OAuth 토큰 교환에 실패했습니다.");
  }

  return data;
}
