import {
  assertConnectableOAuthProvider,
  getOAuthProviderConfig
} from "./oauth-provider-registry";
import type { ConnectableOAuthProviderId } from "./oauth.types";

export function getOAuthRedirectUri(provider: ConnectableOAuthProviderId, requestUrl: string) {
  const config = getOAuthProviderConfig(assertConnectableOAuthProvider(provider));
  const configured = firstEnv([config.redirectUriEnv]);
  if (configured) return validateRedirectUri(provider, configured);

  const baseUrl = getPublicAppUrl(requestUrl);
  return new URL(config.redirectPath, baseUrl).toString();
}

export function getPublicAppUrl(requestUrl: string) {
  const configured = firstEnv([
    "APP_URL",
    "NEXT_PUBLIC_APP_URL",
    "PUBLIC_APP_URL",
    "NEXT_PUBLIC_SITE_URL",
    "SITE_URL"
  ]);
  if (configured) return validateAppUrl(configured, "APP_URL");

  const url = new URL(requestUrl);
  return validateAppUrl(url.origin, "request URL");
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

function validateRedirectUri(provider: ConnectableOAuthProviderId, value: string) {
  const config = getOAuthProviderConfig(provider);
  const url = new URL(value);
  validateAppUrl(url.origin, `${config.redirectUriEnv} origin`);
  if (url.pathname !== config.redirectPath) {
    throw new Error(`${config.redirectUriEnv} must use ${config.redirectPath}`);
  }
  return stripTrailingSlash(url.toString());
}

function validateAppUrl(value: string, label: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute http or https URL.`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${label} must be an absolute http or https URL.`);
  }

  if (isHostedDeployment() && isLocalhost(url.hostname)) {
    throw new Error(`${label} must be a public URL in hosted deployments.`);
  }

  return stripTrailingSlash(url.origin);
}

function isHostedDeployment() {
  return Boolean(
    process.env.RAILWAY_ENVIRONMENT?.trim() ||
      process.env.RAILWAY_PROJECT_ID?.trim() ||
      process.env.VERCEL?.trim() ||
      process.env.RENDER?.trim() ||
      process.env.FLY_APP_NAME?.trim()
  );
}

function isLocalhost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
}
