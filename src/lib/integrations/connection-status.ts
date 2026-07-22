import type { AIProviderName } from "@/src/lib/ai/ai-provider";
import { getAIProviderHealth } from "@/src/lib/ai/config";
import { SUPPORTED_PROVIDER_NAMES } from "@/src/lib/ai/provider-options";
import type {
  ConnectableOAuthProviderId,
  OAuthConnectionState,
  OAuthServiceId
} from "@/src/lib/oauth/oauth.types";
import { getOAuthConnectionStatus } from "@/src/lib/oauth/token.service";
import { getOAuthRedirectDiagnostic } from "@/src/lib/oauth/oauth-redirect";
import type { IntegrationStatus } from "./types";

export type ConnectorAuthState = {
  connectorId: string;
  status: Extract<IntegrationStatus, "connected" | "not_connected" | "mock_mode">;
  configured: boolean;
  accountLabel: string | null;
  detail: string;
  connectionState: OAuthConnectionState | "mock_mode";
  canConnect: boolean;
  canReconnect: boolean;
  verifiedAt: string | null;
  expectedRedirectUri: string | null;
  redirectMatches: boolean | null;
};

export type AIProviderKeyState = {
  providers: Array<{
    provider: AIProviderName;
    connected: boolean;
    requiredKeys: string[];
  }>;
};

export type FirebaseConnectionState = {
  clientConfigured: boolean;
  adminConfigured: boolean;
  projectIdConfigured: boolean;
};

export async function getConnectorAuthState(
  ownerId: string,
  connectorId: string,
  requestUrl = "http://localhost:3100/api/integrations/status"
): Promise<ConnectorAuthState> {
  if (connectorId === "drive") {
    return oauthStateForConnector(
      ownerId,
      connectorId,
      "google",
      "drive",
      ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
      ["GOOGLE_ACCESS_TOKEN", "GOOGLE_OAUTH_TOKEN"],
      "Google Drive",
      requestUrl
    );
  }

  if (connectorId === "gmail") {
    return oauthStateForConnector(
      ownerId,
      connectorId,
      "google",
      "gmail",
      ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
      ["GOOGLE_ACCESS_TOKEN", "GOOGLE_OAUTH_TOKEN", "GMAIL_ACCESS_TOKEN"],
      "Gmail",
      requestUrl
    );
  }

  if (connectorId === "calendar" || connectorId === "google") {
    return oauthStateForConnector(
      ownerId,
      connectorId,
      "google",
      "calendar",
      ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
      ["GOOGLE_ACCESS_TOKEN", "GOOGLE_OAUTH_TOKEN"],
      "Google Calendar",
      requestUrl
    );
  }

  if (connectorId === "slack") {
    return oauthStateForConnector(
      ownerId,
      connectorId,
      "slack",
      "slack",
      ["SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET"],
      ["SLACK_BOT_TOKEN", "SLACK_ACCESS_TOKEN"],
      "Slack",
      requestUrl
    );
  }

  if (connectorId === "github") {
    return oauthStateForConnector(
      ownerId,
      connectorId,
      "github",
      "github",
      ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
      ["GITHUB_TOKEN", "GITHUB_OAUTH_TOKEN"],
      "GitHub",
      requestUrl
    );
  }

  if (connectorId === "notion") {
    return oauthStateForConnector(
      ownerId,
      connectorId,
      "notion",
      "notion",
      ["NOTION_CLIENT_ID", "NOTION_CLIENT_SECRET"],
      ["NOTION_ACCESS_TOKEN", "NOTION_TOKEN"],
      "Notion",
      requestUrl
    );
  }

  if (connectorId === "discord") {
    return oauthStateForConnector(
      ownerId,
      connectorId,
      "discord",
      "discord",
      ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET"],
      ["DISCORD_ACCESS_TOKEN"],
      "Discord",
      requestUrl
    );
  }

  if (connectorId === "firebase") {
    const firebase = getFirebaseConnectionState();
    const configured = firebase.clientConfigured || firebase.adminConfigured || firebase.projectIdConfigured;
    return {
      connectorId,
      status: "not_connected",
      configured,
      accountLabel: null,
      connectionState: configured ? "configuration_only" : "not_connected",
      canConnect: false,
      canReconnect: false,
      verifiedAt: null,
      expectedRedirectUri: null,
      redirectMatches: null,
      detail: configured
        ? "Firebase project configuration is present."
        : "Firebase configuration is missing."
    };
  }

  return {
    connectorId,
    status: "mock_mode",
    configured: false,
    accountLabel: `mock-${connectorId}@dreamwish.local`,
    connectionState: "mock_mode",
    canConnect: false,
    canReconnect: false,
    verifiedAt: null,
    expectedRedirectUri: null,
    redirectMatches: null,
    detail: "This connector is running in local mock mode."
  };
}

export async function getAllConnectorAuthStates(
  ownerId: string,
  connectorIds: string[],
  requestUrl?: string
) {
  const states = await Promise.all(
    connectorIds.map((id) => getConnectorAuthState(ownerId, id, requestUrl))
  );
  return Object.fromEntries(states.map((state) => [state.connectorId, state]));
}

export function getAIProviderKeyState(): AIProviderKeyState {
  const configured = getAIProviderHealth().map((provider) => ({
    provider: provider.provider,
    connected: provider.configured,
    requiredKeys: requiredKeysForProvider(provider.provider)
  }));

  return {
    providers: configured
  };
}

function requiredKeysForProvider(provider: AIProviderName) {
  const requirements: Record<AIProviderName, string[]> = {
    claude: ["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"],
    groq: ["GROQ_API_KEY"],
    gemini: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    openrouter: ["OPENROUTER_API_KEY"],
    huggingface: ["HF_TOKEN", "HUGGINGFACE_API_KEY"],
    cloudflare: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"]
  };
  return requirements[provider];
}

export function getFirebaseConnectionState(): FirebaseConnectionState {
  return {
    clientConfigured: hasAllEnv([
      "NEXT_PUBLIC_FIREBASE_API_KEY",
      "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
      "NEXT_PUBLIC_FIREBASE_APP_ID"
    ]),
    adminConfigured: hasAllEnv([
      "FIREBASE_PROJECT_ID",
      "FIREBASE_CLIENT_EMAIL",
      "FIREBASE_PRIVATE_KEY"
    ]),
    projectIdConfigured: hasAnyEnv(["FIREBASE_PROJECT_ID", "NEXT_PUBLIC_FIREBASE_PROJECT_ID"])
  };
}

async function oauthStateForConnector(
  ownerId: string,
  connectorId: string,
  provider: ConnectableOAuthProviderId,
  service: OAuthServiceId,
  clientEnvKeys: string[],
  tokenEnvKeys: string[],
  label: string,
  requestUrl: string
): Promise<ConnectorAuthState> {
  const oauth = await getOAuthConnectionStatus(ownerId, provider, service);
  const configured = oauth.configured || hasAnyEnv(tokenEnvKeys) || hasAllEnv(clientEnvKeys);
  const redirect = getOAuthRedirectDiagnostic(provider, requestUrl);
  return {
    connectorId,
    status: oauth.connected ? "connected" : "not_connected",
    configured,
    accountLabel: oauth.accountEmail || null,
    connectionState: oauth.connectionState,
    canConnect: hasAllEnv(clientEnvKeys),
    canReconnect: oauth.connectionState !== "not_connected",
    verifiedAt: oauth.verifiedAt,
    expectedRedirectUri: redirect.expected,
    redirectMatches: redirect.matches,
    detail: connectionDetail(label, oauth.connectionState, configured, redirect.matches)
  };
}

function connectionDetail(
  label: string,
  state: OAuthConnectionState,
  configured: boolean,
  redirectMatches: boolean
) {
  if (state === "connected") return `${label} account is verified and connected.`;
  if (state === "configured_unverified") return `${label} credentials exist but no account is verified. Reconnect the account.`;
  if (state === "expired") return `${label} authorization expired. Reconnect the account.`;
  if (state === "revoked") return `${label} authorization was revoked. Reconnect the account.`;
  if (state === "error") return `${label} account verification failed. Reconnect the account.`;
  if (!redirectMatches) return `${label} callback configuration differs from the expected URL.`;
  return configured
    ? `${label} OAuth app is configured and ready to connect.`
    : `${label} OAuth client configuration is missing.`;
}

function hasAnyEnv(keys: string[]) {
  return keys.some((key) => Boolean(process.env[key]?.trim()));
}

function hasAllEnv(keys: string[]) {
  return keys.every((key) => Boolean(process.env[key]?.trim()));
}
