import { assertProviderAllowed } from "@/src/lib/privacy/privacy.config";
import {
  getConfiguredProviderName,
  type AIMessage,
  type AIProvider,
  type AIProviderName
} from "./ai-provider";
import { CloudflareProvider } from "./cloudflare.provider";
import { GeminiProvider } from "./gemini.provider";
import { GroqProvider } from "./groq.provider";
import { HuggingFaceProvider } from "./huggingface.provider";
import { LMStudioProvider } from "./lmstudio.provider";
import { MockProvider } from "./mock.provider";
import { OllamaProvider } from "./ollama.provider";
import { OpenRouterProvider } from "./openrouter.provider";

export function createAIProvider(providerNameOverride?: AIProviderName): AIProvider {
  const providerName = providerNameOverride || getConfiguredProviderName();
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
    case "ollama":
      return new OllamaProvider();
    case "lmstudio":
      return new LMStudioProvider();
    default:
      return new MockProvider();
  }
}

export async function chatWithAI(messages: AIMessage[], providerName?: AIProviderName) {
  return createAIProvider(providerName).chat(messages);
}

export function streamChatWithAI(messages: AIMessage[], providerName?: AIProviderName) {
  return createAIProvider(providerName).streamChat(messages);
}
