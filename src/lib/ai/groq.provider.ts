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
      missingKeyMessage: "Groq API key is missing. Set GROQ_API_KEY."
    });
  }
}
