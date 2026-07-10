import type { AIProviderName } from "@/src/lib/ai/ai-provider";
import { getAIProviderHealth } from "@/src/lib/ai/config";
import { SUPPORTED_PROVIDER_NAMES } from "@/src/lib/ai/provider-options";
import type {
  ConnectableOAuthProviderId,
  OAuthServiceId
} from "@/src/lib/oauth/oauth.types";
import { getOAuthConnectionStatus } from "@/src/lib/oauth/token.service";
import type { IntegrationStatus } from "./types";

export type ConnectorAuthState = {
  connectorId: string;
  status: Extract<IntegrationStatus, "connected" | "not_connected" | "mock_mode">;
  configured: boolean;
  accountLabel: string | null;
  detail: string;
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
  connectorId: string
): Promise<ConnectorAuthState> {
  if (connectorId === "drive") {
    return oauthStateForConnector(
      connectorId,
      "google",
      "drive",
      ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
      ["GOOGLE_ACCESS_TOKEN", "GOOGLE_OAUTH_TOKEN"],
      "Google Drive"
    );
  }

  if (connectorId === "gmail") {
    return oauthStateForConnector(
      connectorId,
      "google",
      "gmail",
      ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
      ["GOOGLE_ACCESS_TOKEN", "GOOGLE_OAUTH_TOKEN", "GMAIL_ACCESS_TOKEN"],
      "Gmail"
    );
  }

  if (connectorId === "calendar" || connectorId === "google") {
    return oauthStateForConnector(
      connectorId,
      "google",
      "calendar",
      ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
      ["GOOGLE_ACCESS_TOKEN", "GOOGLE_OAUTH_TOKEN"],
      "Google Calendar"
    );
  }

  if (connectorId === "slack") {
    const oauth = await getOAuthConnectionStatus("slack");
    const configured =
      oauth.connected ||
      hasAnyEnv(["SLACK_BOT_TOKEN", "SLACK_ACCESS_TOKEN"]) ||
      hasAllEnv(["SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET"]);
    return {
      connectorId,
      status: oauth.connected ? "connected" : "not_connected",
      configured,
      accountLabel: oauth.accountEmail || null,
      detail: configured
        ? oauth.connected
          ? "Slack account is connected."
          : "Slack OAuth app is configured and ready to connect."
        : "Slack OAuth/API configuration is missing."
    };
  }

  if (connectorId === "github") {
    return oauthStateForConnector(
      connectorId,
      "github",
      "github",
      ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
      ["GITHUB_TOKEN", "GITHUB_OAUTH_TOKEN"],
      "GitHub"
    );
  }

  if (connectorId === "notion") {
    return oauthStateForConnector(
      connectorId,
      "notion",
      "notion",
      ["NOTION_CLIENT_ID", "NOTION_CLIENT_SECRET"],
      ["NOTION_ACCESS_TOKEN", "NOTION_TOKEN"],
      "Notion"
    );
  }

  if (connectorId === "discord") {
    return oauthStateForConnector(
      connectorId,
      "discord",
      "discord",
      ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET"],
      ["DISCORD_ACCESS_TOKEN"],
      "Discord"
    );
  }

  if (connectorId === "firebase") {
    const firebase = getFirebaseConnectionState();
    const configured = firebase.clientConfigured || firebase.adminConfigured || firebase.projectIdConfigured;
    return {
      connectorId,
      status: configured ? "connected" : "not_connected",
      configured,
      accountLabel: configured ? "Firebase project configured" : null,
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
    detail: "This connector is running in local mock mode."
  };
}

export async function getAllConnectorAuthStates(connectorIds: string[]) {
  const states = await Promise.all(connectorIds.map((id) => getConnectorAuthState(id)));
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
  connectorId: string,
  provider: ConnectableOAuthProviderId,
  service: OAuthServiceId,
  clientEnvKeys: string[],
  tokenEnvKeys: string[],
  label: string
): Promise<ConnectorAuthState> {
  const oauth = await getOAuthConnectionStatus(provider, service);
  const configured = oauth.connected || hasAnyEnv(tokenEnvKeys) || hasAllEnv(clientEnvKeys);
  return {
    connectorId,
    status: oauth.connected ? "connected" : "not_connected",
    configured,
    accountLabel: oauth.accountEmail || null,
    detail: configured
      ? oauth.connected
        ? `${label} account is connected.`
        : `${label} OAuth app is configured and ready to connect.`
      : `${label} account/API configuration is missing.`
  };
}

function hasAnyEnv(keys: string[]) {
  return keys.some((key) => Boolean(process.env[key]?.trim()));
}

function hasAllEnv(keys: string[]) {
  return keys.every((key) => Boolean(process.env[key]?.trim()));
}
