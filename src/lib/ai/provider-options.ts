import type { AIProviderName } from "./ai-provider";

export const SUPPORTED_FREE_PROVIDERS = [
  "gemini",
  "openrouter",
  "groq"
] as const satisfies AIProviderName[];

export const SUPPORTED_PROVIDER_NAMES = [
  "claude",
  ...SUPPORTED_FREE_PROVIDERS
] as const satisfies AIProviderName[];

export function parseProviderName(value: unknown): AIProviderName | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.toLowerCase();
  return SUPPORTED_PROVIDER_NAMES.find((provider) => provider === normalized);
}
