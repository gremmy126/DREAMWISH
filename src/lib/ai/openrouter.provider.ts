import { OpenAICompatibleProvider } from "./openai-compatible.provider";

export class OpenRouterProvider extends OpenAICompatibleProvider {
  constructor() {
    super({
      name: "openrouter",
      model: process.env.OPENROUTER_MODEL || "meta-llama/llama-3.1-8b-instruct:free",
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: "https://openrouter.ai/api/v1",
      missingKeyMessage: "OpenRouter API Key가 없습니다. OPENROUTER_API_KEY를 설정해주세요.",
      headers: {
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
        "X-Title": "DREAMWISH"
      }
    });
  }
}
