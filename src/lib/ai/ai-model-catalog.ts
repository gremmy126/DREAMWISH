import type { AIProviderName } from "./ai-provider";

// Server-owned AI model tier catalog. The public API must never equate a
// provider with a model: the client only ever sends a tier ID (for a purchase
// quantity or an inference request). Tier IDs, model IDs, prices, provider
// mapping, and availability are decided here on the server. The client can
// never supply an amount, provider URL, arbitrary model ID, or price.
//
// One purchased product grants 1,000,000 credits for a single tier, and one
// input or output token settles one credit. Credits never move between tiers.

export const AI_MODEL_TIER_IDS = [
  "gemini-flash",
  "gemini-pro",
  "groq-fast",
  "groq-advanced",
  "claude-haiku",
  "claude-sonnet",
  "claude-opus",
  "openrouter-economy",
  "openrouter-standard",
  "openrouter-premium"
] as const;

export type AIModelTierId = (typeof AI_MODEL_TIER_IDS)[number];

export const CREDITS_PER_PRODUCT = 1_000_000;
export const OPENROUTER_PREMIUM_FLOOR_KRW = 39_900;

export type AIModelTier = {
  id: AIModelTierId;
  provider: AIProviderName;
  modelId: string;
  label: string;
  useCase: string;
  priceKrwPerMillion: number;
  configured: boolean;
};

type TierDefinition = {
  id: AIModelTierId;
  provider: AIProviderName;
  label: string;
  useCase: string;
  /** Fixed KRW price per 1,000,000 credits, or null for a server-quoted price. */
  fixedPriceKrw: number | null;
  modelEnvKey: string;
  apiKeyEnvKeys: string[];
  /** Only set when the default model is already proven routable in production. */
  defaultModelId?: string;
};

// Prices come straight from the approved product table. Nine tiers are fixed;
// OpenRouter Premium is server-quoted at or above the KRW 39,900 floor.
const TIER_DEFINITIONS: TierDefinition[] = [
  {
    id: "gemini-flash",
    provider: "gemini",
    label: "Gemini Flash · 저가형",
    useCase: "일반 대화·요약·번역",
    fixedPriceKrw: 4_900,
    modelEnvKey: "GEMINI_FLASH_MODEL",
    apiKeyEnvKeys: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    defaultModelId: "gemini-2.0-flash"
  },
  {
    id: "gemini-pro",
    provider: "gemini",
    label: "Gemini Pro · 고급형",
    useCase: "추론·코딩·장문 문서",
    fixedPriceKrw: 14_900,
    modelEnvKey: "GEMINI_PRO_MODEL",
    apiKeyEnvKeys: ["GEMINI_API_KEY", "GOOGLE_API_KEY"]
  },
  {
    id: "groq-fast",
    provider: "groq",
    label: "Groq Fast",
    useCase: "빠른 대화·간단한 에이전트 작업",
    fixedPriceKrw: 4_900,
    modelEnvKey: "GROQ_FAST_MODEL",
    apiKeyEnvKeys: ["GROQ_API_KEY"],
    defaultModelId: "llama-3.1-8b-instant"
  },
  {
    id: "groq-advanced",
    provider: "groq",
    label: "Groq Advanced",
    useCase: "코딩·추론·고급 오픈 모델",
    fixedPriceKrw: 9_900,
    modelEnvKey: "GROQ_ADVANCED_MODEL",
    apiKeyEnvKeys: ["GROQ_API_KEY"]
  },
  {
    id: "claude-haiku",
    provider: "claude",
    label: "Claude Haiku급",
    useCase: "빠른 문서·업무 처리",
    fixedPriceKrw: 7_900,
    modelEnvKey: "ANTHROPIC_HAIKU_MODEL",
    apiKeyEnvKeys: ["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"]
  },
  {
    id: "claude-sonnet",
    provider: "claude",
    label: "Claude Sonnet급",
    useCase: "코딩·AI 에이전트·분석",
    fixedPriceKrw: 19_900,
    modelEnvKey: "ANTHROPIC_SONNET_MODEL",
    apiKeyEnvKeys: ["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"],
    defaultModelId: "claude-sonnet-5"
  },
  {
    id: "claude-opus",
    provider: "claude",
    label: "Claude Opus급",
    useCase: "최고급 추론·복잡한 개발",
    fixedPriceKrw: 39_900,
    modelEnvKey: "ANTHROPIC_OPUS_MODEL",
    apiKeyEnvKeys: ["ANTHROPIC_API_KEY", "CLAUDE_API_KEY"]
  },
  {
    id: "openrouter-economy",
    provider: "openrouter",
    label: "OpenRouter Economy",
    useCase: "저비용 오픈 모델",
    fixedPriceKrw: 6_900,
    modelEnvKey: "OPENROUTER_ECONOMY_MODEL",
    apiKeyEnvKeys: ["OPENROUTER_API_KEY"],
    defaultModelId: "meta-llama/llama-3.1-8b-instruct:free"
  },
  {
    id: "openrouter-standard",
    provider: "openrouter",
    label: "OpenRouter Standard",
    useCase: "범용 고성능 모델",
    fixedPriceKrw: 14_900,
    modelEnvKey: "OPENROUTER_STANDARD_MODEL",
    apiKeyEnvKeys: ["OPENROUTER_API_KEY"]
  },
  {
    id: "openrouter-premium",
    provider: "openrouter",
    label: "OpenRouter Premium",
    useCase: "프리미엄 모델(설정된 모델로 견적)",
    fixedPriceKrw: null,
    modelEnvKey: "OPENROUTER_PREMIUM_MODEL",
    apiKeyEnvKeys: ["OPENROUTER_API_KEY"]
  }
];

const TIER_BY_ID = new Map<AIModelTierId, TierDefinition>(
  TIER_DEFINITIONS.map((tier) => [tier.id, tier])
);

export function isAIModelTierId(value: unknown): value is AIModelTierId {
  return typeof value === "string" && TIER_BY_ID.has(value as AIModelTierId);
}

function env(key: string): string {
  return process.env[key]?.trim() || "";
}

function resolveModelId(tier: TierDefinition): string {
  return env(tier.modelEnvKey) || tier.defaultModelId || "";
}

function hasApiKey(tier: TierDefinition): boolean {
  return tier.apiKeyEnvKeys.some((key) => Boolean(env(key)));
}

/**
 * Server-quoted price. OpenRouter Premium reads OPENROUTER_PREMIUM_PRICE_KRW
 * and is clamped up to the approved KRW 39,900 floor; it can never quote below.
 * Fixed tiers ignore any env override so advertised prices stay authoritative.
 */
export function resolveTierPriceKrw(tierId: AIModelTierId): number {
  const tier = TIER_BY_ID.get(tierId);
  if (!tier) throw new Error(`Unknown AI model tier: ${tierId}`);
  if (tier.fixedPriceKrw !== null) return tier.fixedPriceKrw;
  const configured = Number.parseInt(env("OPENROUTER_PREMIUM_PRICE_KRW"), 10);
  const quoted = Number.isSafeInteger(configured) ? configured : OPENROUTER_PREMIUM_FLOOR_KRW;
  return Math.max(OPENROUTER_PREMIUM_FLOOR_KRW, quoted);
}

function toModelTier(tier: TierDefinition): AIModelTier {
  const modelId = resolveModelId(tier);
  return {
    id: tier.id,
    provider: tier.provider,
    modelId,
    label: tier.label,
    useCase: tier.useCase,
    priceKrwPerMillion: resolveTierPriceKrw(tier.id),
    // A tier is only usable when both its API key and a routable model id exist.
    configured: hasApiKey(tier) && Boolean(modelId)
  };
}

/** Full server-side view of one tier, including its resolved model id. */
export function getAIModelTier(tierId: AIModelTierId): AIModelTier {
  const tier = TIER_BY_ID.get(tierId);
  if (!tier) throw new Error(`Unknown AI model tier: ${tierId}`);
  return toModelTier(tier);
}

/** Every tier in catalog order, regardless of configuration (server use). */
export function getAllAIModelTiers(): AIModelTier[] {
  return TIER_DEFINITIONS.map(toModelTier);
}

/** Only configured tiers — what the store and model picker may display. */
export function getConfiguredAIModelTiers(): AIModelTier[] {
  return getAllAIModelTiers().filter((tier) => tier.configured);
}

export function isTierConfigured(tierId: AIModelTierId): boolean {
  return getAIModelTier(tierId).configured;
}
