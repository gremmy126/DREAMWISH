import { getProviderRuntimeConfig } from "./config";
import { OpenAICompatibleProvider } from "./openai-compatible.provider";

export class GroqProvider extends OpenAICompatibleProvider {
  constructor() {
    const config = getProviderRuntimeConfig("groq");
    super({
      name: "groq",
      model: config.model,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || "https://api.groq.com/openai/v1",
      missingKeyMessage: "Groq API key is missing. Set GROQ_API_KEY.",
      maxOutputTokensCap: 4_000,
      maxTokensField: "max_completion_tokens",
      // Free-tier TPM is 8K for GPT-OSS 20B and 6K for the legacy Llama
      // default. Reserve headroom and include input in the request budget.
      totalTokenRequestBudget:
        config.model === "llama-3.1-8b-instant" ? 5_500 : 7_500
    });
  }
}
