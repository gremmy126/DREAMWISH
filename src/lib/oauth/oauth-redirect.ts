import {
  assertConnectableOAuthProvider,
  getOAuthProviderConfig
} from "./oauth-provider-registry";
import type { ConnectableOAuthProviderId } from "./oauth.types";
import { SITE_URL as CANONICAL_SITE_URL } from "../site/metadata";

export function getOAuthRedirectUri(provider: ConnectableOAuthProviderId, requestUrl: string) {
  const config = getOAuthProviderConfig(assertConnectableOAuthProvider(provider));
  const baseUrl = getPublicAppUrl(requestUrl);
  return new URL(config.redirectPath, baseUrl).toString();
}

export type OAuthRedirectDiagnostic = {
  matches: boolean;
  expected: string;
  configured: string | null;
};

export function buildPublicReturnUrl(requestUrl: string, params: Record<string, string>) {
  const url = new URL("/", getPublicAppUrl(requestUrl));
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

export function getOAuthRedirectDiagnostic(
  provider: ConnectableOAuthProviderId,
  requestUrl: string
): OAuthRedirectDiagnostic {
  const config = getOAuthProviderConfig(assertConnectableOAuthProvider(provider));
  const expected = getOAuthRedirectUri(provider, requestUrl);
  const configuredValue = firstEnv([config.redirectUriEnv]);
  const configured = configuredValue ? sanitizeConfiguredRedirect(configuredValue) : null;

  return {
    matches: configured === null || configured === expected,
    expected,
    configured
  };
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

  if (isHostedDeployment()) {
    return validateAppUrl(CANONICAL_SITE_URL, "SITE_URL");
  }

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

function sanitizeConfiguredRedirect(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return stripTrailingSlash(`${url.origin}${url.pathname}`);
  } catch {
    return null;
  }
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
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname === "::" ||
    hostname === "[::]" ||
    hostname.endsWith(".localhost")
  );
}
