import type { AIProviderName } from "@/src/lib/ai/ai-provider";
import { SUPPORTED_PROVIDER_NAMES } from "@/src/lib/ai/provider-options";
import type { IntegrationStatus } from "./types";
import { getOAuthConnectionStatus } from "@/src/lib/oauth/token.service";

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
  if (connectorId === "gmail" || connectorId === "calendar" || connectorId === "google") {
    const oauth = await getOAuthConnectionStatus("google");
    const configured = oauth.connected || hasAllEnv(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]);
    return {
      connectorId,
      status: configured ? "connected" : "not_connected",
      configured,
      accountLabel: oauth.accountEmail || (configured ? "Google OAuth app configured" : null),
      detail: oauth.connected
        ? "Google OAuth token is active."
        : configured
          ? "Google OAuth client configuration is present. Account OAuth can be completed from Connect."
          : "Google OAuth client configuration is missing."
    };
  }

  if (connectorId === "slack") {
    const oauth = await getOAuthConnectionStatus("slack");
    const configured =
      oauth.connected ||
      hasAnyEnv(["SLACK_BOT_TOKEN"]) ||
      hasAllEnv(["SLACK_CLIENT_ID", "SLACK_CLIENT_SECRET"]);
    return {
      connectorId,
      status: configured ? "connected" : "not_connected",
      configured,
      accountLabel: oauth.accountEmail || (configured ? "Slack app configured" : null),
      detail: configured
        ? "Slack OAuth/API configuration is present."
        : "Slack OAuth/API configuration is missing."
    };
  }

  if (connectorId === "github") {
    const configured = hasAnyEnv(["GITHUB_TOKEN", "GITHUB_OAUTH_TOKEN"]);
    return {
      connectorId,
      status: configured ? "connected" : "mock_mode",
      configured,
      accountLabel: configured ? "GitHub token configured" : "GitHub mock connector",
      detail: configured
        ? "GitHub token configuration is present."
        : "GitHub is available in mock mode until a token is configured."
    };
  }

  if (connectorId === "firebase") {
    const firebase = getFirebaseConnectionState();
    const configured = firebase.clientConfigured || firebase.adminConfigured;
    return {
      connectorId,
      status: configured ? "connected" : "not_connected",
      configured,
      accountLabel: configured ? "Firebase project configured" : null,
      detail: configured
        ? "Firebase client/server configuration is present."
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
  const requirements: Record<AIProviderName, string[]> = {
    groq: ["GROQ_API_KEY"],
    gemini: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    openrouter: ["OPENROUTER_API_KEY"],
    huggingface: ["HF_TOKEN", "HUGGINGFACE_API_KEY"],
    cloudflare: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"],
    ollama: ["OLLAMA_BASE_URL"],
    lmstudio: ["LMSTUDIO_BASE_URL"],
    mock: []
  };

  return {
    providers: SUPPORTED_PROVIDER_NAMES.map((provider) => ({
      provider,
      connected:
        provider === "mock" ||
        provider === "ollama" ||
        provider === "lmstudio" ||
        hasProviderEnv(provider, requirements[provider]),
      requiredKeys: requirements[provider]
    }))
  };
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

function hasProviderEnv(provider: AIProviderName, keys: string[]) {
  if (provider === "cloudflare") {
    return hasAllEnv(["CLOUDFLARE_ACCOUNT_ID"]) && hasAnyEnv(["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_API_KEY"]);
  }
  return hasAnyEnv(keys);
}

function hasAnyEnv(keys: string[]) {
  return keys.some((key) => Boolean(process.env[key]?.trim()));
}

function hasAllEnv(keys: string[]) {
  return keys.every((key) => Boolean(process.env[key]?.trim()));
}
