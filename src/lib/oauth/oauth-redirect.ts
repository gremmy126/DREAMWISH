import type { OAuthProviderId } from "./oauth.types";

const PROVIDER_REDIRECT_ENV: Record<OAuthProviderId, string[]> = {
  google: ["GOOGLE_REDIRECT_URI"],
  slack: ["SLACK_REDIRECT_URI"],
  github: ["GITHUB_REDIRECT_URI"],
  notion: ["NOTION_REDIRECT_URI"],
  firebase: ["FIREBASE_REDIRECT_URI"]
};

export function getOAuthRedirectUri(provider: OAuthProviderId, requestUrl: string) {
  const configured = firstEnv(PROVIDER_REDIRECT_ENV[provider]);
  if (configured) return configured;

  const baseUrl = getPublicAppUrl(requestUrl);
  return `${baseUrl}/api/oauth/${provider}/callback`;
}

export function getPublicAppUrl(requestUrl: string) {
  const configured = firstEnv([
    "NEXT_PUBLIC_APP_URL",
    "APP_URL",
    "PUBLIC_APP_URL",
    "NEXT_PUBLIC_SITE_URL",
    "SITE_URL"
  ]);
  if (configured) return stripTrailingSlash(configured);

  const url = new URL(requestUrl);
  return url.origin;
}

function firstEnv(keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return stripTrailingSlash(value);
  }
  return "";
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/u, "");
}
