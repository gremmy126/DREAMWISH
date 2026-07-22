import { getProviderRuntimeConfig } from "./config";
import { OpenAICompatibleProvider } from "./openai-compatible.provider";

export class HuggingFaceProvider extends OpenAICompatibleProvider {
  constructor() {
    const config = getProviderRuntimeConfig("huggingface");
    super({
      name: "huggingface",
      model: config.model,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || "https://router.huggingface.co/v1",
      missingKeyMessage: "Hugging Face token is missing. Set HF_TOKEN.",
      maxOutputTokensCap: 4_000
    });
  }
}
