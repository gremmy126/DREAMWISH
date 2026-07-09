import type { OAuthAuthorizationRequest } from "./oauth.types";

export function createNotionOAuthAuthorizationUrl(request: OAuthAuthorizationRequest) {
  const url = new URL("https://api.notion.com/v1/oauth/authorize");
  url.searchParams.set("client_id", process.env.NOTION_CLIENT_ID || "");
  url.searchParams.set("redirect_uri", request.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("owner", "user");
  url.searchParams.set("state", request.state);
  return url;
}

export async function exchangeNotionOAuthCode(code: string, redirectUri: string) {
  const clientId = process.env.NOTION_CLIENT_ID || "";
  const clientSecret = process.env.NOTION_CLIENT_SECRET || "";
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
    })
  });
  const data = (await response.json()) as {
    access_token?: string;
    workspace_name?: string;
    bot_id?: string;
    error?: string;
    message?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(data.message || data.error || "Notion OAuth token exchange failed.");
  }

  return data;
}
