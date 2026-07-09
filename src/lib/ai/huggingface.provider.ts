import { OpenAICompatibleProvider } from "./openai-compatible.provider";

export class HuggingFaceProvider extends OpenAICompatibleProvider {
  constructor() {
    super({
      name: "huggingface",
      model: process.env.HF_MODEL || "google/gemma-2-2b-it:hf-inference",
      apiKey: process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY,
      baseUrl: "https://router.huggingface.co/v1",
      missingKeyMessage: "Hugging Face 토큰이 없습니다. HF_TOKEN을 설정해주세요."
    });
  }
}
