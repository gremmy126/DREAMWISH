import type { AIProviderName } from "./ai-provider";
import { AIProviderError } from "./errors";

export type ExternalAIProviderName = AIProviderName;

export type AIProviderRuntimeConfig = {
  provider: ExternalAIProviderName;
  apiKey: string;
  model: string;
  baseUrl?: string;
  headers?: Record<string, string>;
};

export type AIProviderHealth = {
  provider: ExternalAIProviderName;
  configured: boolean;
  modelConfigured: boolean;
};

// Claude가 연결되어 있으면 기본 공급자로 우선 사용한다.
const PROVIDER_ORDER: ExternalAIProviderName[] = [
  "claude",
  "gemini",
  "openrouter",
  "groq",
];

const PROVIDER_LABELS: Record<ExternalAIProviderName, string> = {
  claude: "Claude",
  gemini: "Gemini",
  openrouter: "OpenRouter",
  groq: "Groq",
};

export function getPublicAIProviderCatalog() {
  return PROVIDER_ORDER.map((provider) => {
    const config = getProviderRuntimeConfig(provider);
    return {
      provider,
      label: PROVIDER_LABELS[provider],
      model: config.model,
      configured: Boolean(config.apiKey && config.model),
    };
  });
}

export function getConfiguredAIProviders(): AIProviderRuntimeConfig[] {
  return PROVIDER_ORDER.flatMap((provider) => {
    const config = getProviderRuntimeConfig(provider);
    return config.apiKey ? [config] : [];
  });
}

export function getProviderAttemptOrder(
  requested?: ExternalAIProviderName,
): ExternalAIProviderName[] {
  const configured = getConfiguredAIProviders().map(
    (config) => config.provider,
  );
  if (!requested || !configured.includes(requested)) return configured;
  return [
    requested,
    ...configured.filter((provider) => provider !== requested),
  ];
}

export function getDefaultAIProviderName(): ExternalAIProviderName {
  const explicit = parseExternalProvider(process.env.AI_PROVIDER);
  if (explicit) {
    const config = getProviderRuntimeConfig(explicit);
    if (!config.apiKey) {
      throw new AIProviderError({
        code: "PROVIDER_NOT_CONFIGURED",
        message: `${explicit} is selected but its API key is not configured.`,
      });
    }
    return explicit;
  }

  const first = getConfiguredAIProviders()[0]?.provider;
  if (!first) {
    throw new AIProviderError({
      code: "PROVIDER_NOT_CONFIGURED",
      message:
        "No connected AI provider is configured. Connect Claude, Gemini, OpenRouter, or Groq in Settings > Integrations.",
    });
  }
  return first;
}

export function getAIProviderHealth(): AIProviderHealth[] {
  return PROVIDER_ORDER.map((provider) => {
    const config = getProviderRuntimeConfig(provider);
    return {
      provider,
      configured: Boolean(config.apiKey),
      modelConfigured: Boolean(config.model),
    };
  });
}

export function getProviderRuntimeConfig(
  provider: ExternalAIProviderName,
): AIProviderRuntimeConfig {
  if (provider === "claude") {
    return {
      provider,
      apiKey: env("ANTHROPIC_API_KEY") || env("CLAUDE_API_KEY"),
      model: env("ANTHROPIC_MODEL") || env("CLAUDE_MODEL") || "claude-sonnet-5",
      baseUrl: env("ANTHROPIC_BASE_URL") || "https://api.anthropic.com/v1",
    };
  }

  if (provider === "gemini") {
    return {
      provider,
      apiKey: env("GEMINI_API_KEY") || env("GOOGLE_API_KEY"),
      model: normalizeGeminiModel(
        env("GEMINI_MODEL") || env("GOOGLE_MODEL") || "gemini-3.5-flash",
      ),
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    };
  }

  if (provider === "openrouter") {
    return {
      provider,
      apiKey: env("OPENROUTER_API_KEY"),
      model: env("OPENROUTER_MODEL") || "openrouter/free",
      baseUrl: env("OPENROUTER_BASE_URL") || "https://openrouter.ai/api/v1",
      headers: {
        "HTTP-Referer": getPublicReferer(),
        "X-Title": "DREAMWISH",
      },
    };
  }

  if (provider === "groq") {
    return {
      provider,
      apiKey: env("GROQ_API_KEY"),
      model: env("GROQ_MODEL") || "openai/gpt-oss-20b",
      baseUrl: "https://api.groq.com/openai/v1",
    };
  }

  if (provider === "huggingface") {
    return {
      provider,
      apiKey: env("HF_TOKEN") || env("HUGGINGFACE_API_KEY"),
      model: env("HF_MODEL") || "google/gemma-2-2b-it:hf-inference",
      baseUrl: "https://router.huggingface.co/v1",
    };
  }

  return {
    provider,
    apiKey: env("CLOUDFLARE_API_TOKEN") || env("CLOUDFLARE_API_KEY"),
    model: env("CLOUDFLARE_AI_MODEL") || "@cf/qwen/qwen3-30b-a3b-fp8",
    baseUrl: env("CLOUDFLARE_ACCOUNT_ID")
      ? `https://api.cloudflare.com/client/v4/accounts/${env("CLOUDFLARE_ACCOUNT_ID")}/ai/v1`
      : undefined,
  };
}

function normalizeGeminiModel(value: string) {
  const model = value.trim().replace(/^models\//iu, "");
  const aliases: Record<string, string> = {
    "gemini 3.1 pro": "gemini-3.1-pro-preview",
    "gemini 3.5 flash": "gemini-3.5-flash",
    "gemini 3.1 flash-lite": "gemini-3.1-flash-lite",
    "gemini 3 flash": "gemini-3-flash-preview",
  };
  return aliases[model.toLowerCase()] || model;
}

export function parseExternalProvider(
  value: unknown,
): ExternalAIProviderName | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.toLowerCase();
  return PROVIDER_ORDER.find((provider) => provider === normalized);
}

function env(key: string) {
  return process.env[key]?.trim() || "";
}

function getPublicReferer() {
  const value =
    env("APP_URL") ||
    env("NEXT_PUBLIC_APP_URL") ||
    env("PUBLIC_APP_URL") ||
    env("NEXT_PUBLIC_SITE_URL") ||
    "https://dreamwish.co.kr";

  try {
    const url = new URL(value);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return "https://dreamwish.co.kr";
    }
    return url.origin;
  } catch {
    return "https://dreamwish.co.kr";
  }
}
