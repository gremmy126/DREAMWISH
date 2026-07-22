import { assertProviderAllowed } from "../privacy/privacy.config";
import {
  type AIChatOptions,
  type AIMessage,
  type AIProvider,
  type AIProviderName
} from "./ai-provider";
import { CloudflareProvider } from "./cloudflare.provider";
import { getProviderAttemptOrder } from "./config";
import { AIProviderError } from "./errors";
import { GeminiProvider } from "./gemini.provider";
import { GroqProvider } from "./groq.provider";
import { HuggingFaceProvider } from "./huggingface.provider";
import { OpenRouterProvider } from "./openrouter.provider";

export function createAIProvider(providerNameOverride?: AIProviderName): AIProvider {
  const providerName = providerNameOverride || getProviderAttemptOrder()[0];
  if (!providerName) {
    throw new AIProviderError({
      code: "PROVIDER_NOT_CONFIGURED",
      message: "No connected AI provider is configured."
    });
  }
  assertProviderAllowed(providerName);

  switch (providerName) {
    case "groq":
      return new GroqProvider();
    case "gemini":
      return new GeminiProvider();
    case "openrouter":
      return new OpenRouterProvider();
    case "huggingface":
      return new HuggingFaceProvider();
    case "cloudflare":
      return new CloudflareProvider();
  }
}

export async function chatWithAI(
  messages: AIMessage[],
  providerName?: AIProviderName,
  options?: AIChatOptions
) {
  return chatWithProviderFailover(
    messages,
    getProviderAttemptOrder(providerName),
    createAIProvider,
    options
  );
}

export function streamChatWithAI(messages: AIMessage[], providerName?: AIProviderName) {
  return streamWithProviderFailover(
    messages,
    getProviderAttemptOrder(providerName),
    createAIProvider
  );
}

type ProviderFactory = (provider: AIProviderName) => AIProvider;

export async function chatWithProviderFailover(
  messages: AIMessage[],
  providers: AIProviderName[],
  factory: ProviderFactory,
  options?: AIChatOptions
) {
  let lastError: unknown;
  for (const providerName of providers) {
    try {
      return await factory(providerName).chat(messages, options);
    } catch (error) {
      lastError = error;
    }
  }
  throw createFailoverError(providers, lastError);
}

export async function* streamWithProviderFailover(
  messages: AIMessage[],
  providers: AIProviderName[],
  factory: ProviderFactory
): AsyncIterable<string> {
  let lastError: unknown;
  for (const providerName of providers) {
    let emitted = false;
    try {
      for await (const token of factory(providerName).streamChat(messages)) {
        if (!token) continue;
        emitted = true;
        yield token;
      }
      if (emitted) return;
      lastError = new AIProviderError({
        code: "MODEL_RESPONSE_EMPTY",
        message: `${providerName} returned an empty response.`
      });
    } catch (error) {
      if (emitted) throw error;
      lastError = error;
    }
  }
  throw createFailoverError(providers, lastError);
}

function createFailoverError(providers: AIProviderName[], lastError: unknown) {
  if (providers.length === 0) {
    return new AIProviderError({
      code: "PROVIDER_NOT_CONFIGURED",
      message: "No connected AI provider is configured."
    });
  }
  return new AIProviderError({
    code: lastError instanceof AIProviderError ? lastError.code : "INTERNAL_ERROR",
    retryable: lastError instanceof AIProviderError ? lastError.retryable : true,
    status: lastError instanceof AIProviderError ? lastError.status : undefined,
    message: `All configured AI providers failed (${providers.join(", ")}).`
  });
}
