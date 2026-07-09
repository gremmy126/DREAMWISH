import { OpenAICompatibleProvider } from "./openai-compatible.provider";

export class CloudflareProvider extends OpenAICompatibleProvider {
  constructor() {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

    super({
      name: "cloudflare",
      model: process.env.CLOUDFLARE_AI_MODEL || "@cf/meta/llama-3.1-8b-instruct",
      apiKey: process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_API_KEY,
      baseUrl: accountId
        ? `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1`
        : "https://api.cloudflare.com/client/v4/accounts/missing-account-id/ai/v1",
      missingKeyMessage:
        "Cloudflare AI 설정이 없습니다. CLOUDFLARE_ACCOUNT_ID와 CLOUDFLARE_API_TOKEN을 설정해주세요."
    });
  }
}
