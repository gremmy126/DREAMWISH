import type {
  ConnectableOAuthProviderId,
  GoogleOAuthService,
  OAuthProviderId,
  OAuthServiceId,
  OAuthTokenScope
} from "./oauth.types";

export type OAuthProviderConfig = {
  id: ConnectableOAuthProviderId;
  authorizationUrl: string;
  tokenUrl: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  redirectUriEnv: string;
  redirectPath: string;
  defaultScopes: OAuthTokenScope[];
  supportsPkce: boolean;
  supportsRefreshToken: boolean;
};

export const GOOGLE_IDENTITY_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile"
] as const;

export const GOOGLE_SERVICE_SCOPES: Record<GoogleOAuthService, OAuthTokenScope[]> = {
  drive: ["https://www.googleapis.com/auth/drive.file"],
  gmail: [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.compose"
  ],
  calendar: [
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events"
  ]
};

export const OAUTH_PROVIDER_REGISTRY: Record<ConnectableOAuthProviderId, OAuthProviderConfig> = {
  google: {
    id: "google",
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    redirectUriEnv: "GOOGLE_REDIRECT_URI",
    redirectPath: "/api/integrations/google/callback",
    defaultScopes: [...GOOGLE_IDENTITY_SCOPES],
    supportsPkce: true,
    supportsRefreshToken: true
  },
  slack: {
    id: "slack",
    authorizationUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    clientIdEnv: "SLACK_CLIENT_ID",
    clientSecretEnv: "SLACK_CLIENT_SECRET",
    redirectUriEnv: "SLACK_REDIRECT_URI",
    redirectPath: "/api/integrations/slack/callback",
    defaultScopes: [
      "channels:history",
      "channels:read",
      "groups:history",
      "groups:read",
      "im:history",
      "im:read",
      "mpim:history",
      "mpim:read",
      "chat:write",
      "users:read",
      "team:read"
    ],
    supportsPkce: false,
    supportsRefreshToken: false
  },
  github: {
    id: "github",
    authorizationUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    clientIdEnv: "GITHUB_CLIENT_ID",
    clientSecretEnv: "GITHUB_CLIENT_SECRET",
    redirectUriEnv: "GITHUB_REDIRECT_URI",
    redirectPath: "/api/integrations/github/callback",
    defaultScopes: ["read:user", "user:email"],
    supportsPkce: false,
    supportsRefreshToken: false
  },
  notion: {
    id: "notion",
    authorizationUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    clientIdEnv: "NOTION_CLIENT_ID",
    clientSecretEnv: "NOTION_CLIENT_SECRET",
    redirectUriEnv: "NOTION_REDIRECT_URI",
    redirectPath: "/api/integrations/notion/callback",
    defaultScopes: [],
    supportsPkce: false,
    supportsRefreshToken: false
  },
  discord: {
    id: "discord",
    authorizationUrl: "https://discord.com/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    clientIdEnv: "DISCORD_CLIENT_ID",
    clientSecretEnv: "DISCORD_CLIENT_SECRET",
    redirectUriEnv: "DISCORD_REDIRECT_URI",
    redirectPath: "/api/integrations/discord/callback",
    defaultScopes: ["identify", "email"],
    supportsPkce: true,
    supportsRefreshToken: true
  }
};

export function getOAuthProviderConfig(provider: ConnectableOAuthProviderId) {
  return OAUTH_PROVIDER_REGISTRY[provider];
}

export function getOAuthClientId(provider: ConnectableOAuthProviderId) {
  return process.env[getOAuthProviderConfig(provider).clientIdEnv]?.trim() || "";
}

export function getOAuthClientSecret(provider: ConnectableOAuthProviderId) {
  return process.env[getOAuthProviderConfig(provider).clientSecretEnv]?.trim() || "";
}

export function assertOAuthProvider(provider: string): OAuthProviderId {
  if (
    provider === "google" ||
    provider === "slack" ||
    provider === "github" ||
    provider === "notion" ||
    provider === "discord" ||
    provider === "firebase"
  ) {
    return provider;
  }
  throw new Error(`Unsupported OAuth provider: ${provider}`);
}

export function assertConnectableOAuthProvider(provider: string): ConnectableOAuthProviderId {
  const validated = assertOAuthProvider(provider);
  if (validated === "firebase") {
    throw new Error("Firebase uses project configuration instead of OAuth authorization.");
  }
  return validated;
}

export function assertGoogleOAuthService(service: string | null | undefined): GoogleOAuthService {
  if (service === "drive" || service === "gmail" || service === "calendar") return service;
  throw new Error(`Unsupported Google OAuth service: ${service || "missing"}`);
}

export function resolveOAuthService(
  provider: ConnectableOAuthProviderId,
  service?: string | null
): OAuthServiceId {
  if (provider === "google") return assertGoogleOAuthService(service || "drive");
  return provider;
}

export function getDefaultOAuthScopes(
  provider: ConnectableOAuthProviderId,
  service?: OAuthServiceId | null
) {
  if (provider === "google") {
    const googleService = assertGoogleOAuthService(service || "drive");
    return [...GOOGLE_IDENTITY_SCOPES, ...GOOGLE_SERVICE_SCOPES[googleService]];
  }
  return [...getOAuthProviderConfig(provider).defaultScopes];
}

export function validateOAuthProviderConfigured(provider: ConnectableOAuthProviderId) {
  const config = getOAuthProviderConfig(provider);
  const missing = [config.clientIdEnv, config.clientSecretEnv].filter(
    (key) => !process.env[key]?.trim()
  );
  if (missing.length > 0) {
    throw new Error(`${provider} OAuth is not configured. Missing: ${missing.join(", ")}`);
  }
}
