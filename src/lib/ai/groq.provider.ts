import { OpenAICompatibleProvider } from "./openai-compatible.provider";

export class GroqProvider extends OpenAICompatibleProvider {
  constructor() {
    super({
      name: "groq",
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
      apiKey: process.env.GROQ_API_KEY,
      baseUrl: "https://api.groq.com/openai/v1",
      missingKeyMessage: "Groq API Key가 없습니다. GROQ_API_KEY를 설정해주세요."
    });
  }
}
