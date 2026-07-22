import { getProviderRuntimeConfig } from "./config";
import { OpenAICompatibleProvider } from "./openai-compatible.provider";

export class CloudflareProvider extends OpenAICompatibleProvider {
  constructor() {
    const config = getProviderRuntimeConfig("cloudflare");
    super({
      name: "cloudflare",
      model: config.model,
      apiKey: config.apiKey,
      baseUrl:
        config.baseUrl ||
        "https://api.cloudflare.com/client/v4/accounts/missing-account-id/ai/v1",
      missingKeyMessage:
        "Cloudflare AI settings are missing. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.",
      maxOutputTokensCap: 2_048
    });
  }
}
