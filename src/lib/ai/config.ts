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

const PROVIDER_ORDER: ExternalAIProviderName[] = [
  "gemini",
  "openrouter",
  "groq",
  "huggingface",
  "cloudflare"
];

const PROVIDER_LABELS: Record<ExternalAIProviderName, string> = {
  gemini: "Gemini",
  openrouter: "OpenRouter",
  groq: "Groq",
  huggingface: "Hugging Face",
  cloudflare: "Cloudflare AI"
};

export function getPublicAIProviderCatalog() {
  return PROVIDER_ORDER.map((provider) => {
    const config = getProviderRuntimeConfig(provider);
    return {
      provider,
      label: PROVIDER_LABELS[provider],
      model: config.model,
      configured: Boolean(config.apiKey && config.model)
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
  requested?: ExternalAIProviderName
): ExternalAIProviderName[] {
  const configured = getConfiguredAIProviders().map((config) => config.provider);
  if (!requested || !configured.includes(requested)) return configured;
  return [requested, ...configured.filter((provider) => provider !== requested)];
}

export function getDefaultAIProviderName(): ExternalAIProviderName {
  const explicit = parseExternalProvider(process.env.AI_PROVIDER);
  if (explicit) {
    const config = getProviderRuntimeConfig(explicit);
    if (!config.apiKey) {
      throw new AIProviderError({
        code: "PROVIDER_NOT_CONFIGURED",
        message: `${explicit} is selected but its API key is not configured.`
      });
    }
    return explicit;
  }

  const first = getConfiguredAIProviders()[0]?.provider;
  if (!first) {
    throw new AIProviderError({
      code: "PROVIDER_NOT_CONFIGURED",
      message:
        "No connected AI provider is configured. Connect Gemini, OpenRouter, Groq, HuggingFace, or Cloudflare in Settings > Integrations."
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
      modelConfigured: Boolean(config.model)
    };
  });
}

export function getProviderRuntimeConfig(provider: ExternalAIProviderName): AIProviderRuntimeConfig {
  if (provider === "gemini") {
    return {
      provider,
      apiKey: env("GEMINI_API_KEY") || env("GOOGLE_API_KEY"),
      model: env("GEMINI_MODEL") || env("GOOGLE_MODEL") || "gemini-2.0-flash",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta"
    };
  }

  if (provider === "openrouter") {
    return {
      provider,
      apiKey: env("OPENROUTER_API_KEY"),
      model: env("OPENROUTER_MODEL") || "meta-llama/llama-3.1-8b-instruct:free",
      baseUrl: env("OPENROUTER_BASE_URL") || "https://openrouter.ai/api/v1",
      headers: {
        "HTTP-Referer": getPublicReferer(),
        "X-Title": "DREAMWISH"
      }
    };
  }

  if (provider === "groq") {
    return {
      provider,
      apiKey: env("GROQ_API_KEY"),
      model: env("GROQ_MODEL") || "llama-3.1-8b-instant",
      baseUrl: "https://api.groq.com/openai/v1"
    };
  }

  if (provider === "huggingface") {
    return {
      provider,
      apiKey: env("HF_TOKEN") || env("HUGGINGFACE_API_KEY"),
      model: env("HF_MODEL") || "google/gemma-2-2b-it:hf-inference",
      baseUrl: "https://router.huggingface.co/v1"
    };
  }

  return {
    provider,
    apiKey: env("CLOUDFLARE_API_TOKEN") || env("CLOUDFLARE_API_KEY"),
    model: env("CLOUDFLARE_AI_MODEL") || "@cf/meta/llama-3.1-8b-instruct",
    baseUrl: env("CLOUDFLARE_ACCOUNT_ID")
      ? `https://api.cloudflare.com/client/v4/accounts/${env("CLOUDFLARE_ACCOUNT_ID")}/ai/v1`
      : undefined
  };
}

export function parseExternalProvider(value: unknown): ExternalAIProviderName | undefined {
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
