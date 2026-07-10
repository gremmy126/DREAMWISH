import { getProviderRuntimeConfig } from "./config";
import { OpenAICompatibleProvider } from "./openai-compatible.provider";

export class OpenRouterProvider extends OpenAICompatibleProvider {
  constructor() {
    const config = getProviderRuntimeConfig("openrouter");
    super({
      name: "openrouter",
      model: config.model,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || "https://openrouter.ai/api/v1",
      missingKeyMessage: "OpenRouter API key is missing. Set OPENROUTER_API_KEY.",
      headers: config.headers
    });
  }
}
