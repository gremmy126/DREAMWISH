import {
  getOAuthClientId,
  getOAuthClientSecret,
  getOAuthProviderConfig
} from "./oauth-provider-registry";
import type { OAuthAuthorizationRequest } from "./oauth.types";

export function createNotionOAuthAuthorizationUrl(request: OAuthAuthorizationRequest) {
  const config = getOAuthProviderConfig("notion");
  const url = new URL(config.authorizationUrl);
  url.searchParams.set("client_id", request.clientId || getOAuthClientId("notion"));
  url.searchParams.set("redirect_uri", request.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("owner", "user");
  url.searchParams.set("state", request.state);
  return url;
}

export async function exchangeNotionOAuthCode(
  code: string,
  redirectUri: string,
  credentials?: { clientId: string; clientSecret: string }
) {
  const clientId = credentials?.clientId || getOAuthClientId("notion");
  const clientSecret = credentials?.clientSecret || getOAuthClientSecret("notion");
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(getOAuthProviderConfig("notion").tokenUrl, {
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
    refresh_token?: string;
    workspace_id?: string;
    workspace_name?: string;
    workspace_icon?: string;
    bot_id?: string;
    duplicated_template_id?: string;
    owner?: unknown;
    error?: string;
    message?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(data.message || data.error || "Notion OAuth token exchange failed.");
  }

  return data;
}
