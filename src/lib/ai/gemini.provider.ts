import {
  clampOutputTokens,
  normalizeUsage,
  type AIChatOptions,
  type AICompletion,
  type AIMessage,
  type AIProvider
} from "./ai-provider";
import { getProviderRuntimeConfig } from "./config";
import { AIProviderError, classifyProviderHttpError } from "./errors";

// Gemini 2.x Flash 계열의 최대 출력 토큰. 이보다 큰 maxOutputTokens를 보내면
// 400 INVALID_ARGUMENT로 요청 자체가 거부된다.
const GEMINI_MAX_OUTPUT_TOKENS = 8_192;

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
};

export class GeminiProvider implements AIProvider {
  name = "gemini";
  model = getProviderRuntimeConfig("gemini").model;

  private get config() {
    return getProviderRuntimeConfig("gemini");
  }

  async chat(messages: AIMessage[], options?: AIChatOptions): Promise<string> {
    const data = await this.generate(messages, options);
    return this.extractText(data);
  }

  async chatWithUsage(messages: AIMessage[], options?: AIChatOptions): Promise<AICompletion> {
    const data = await this.generate(messages, options);
    const content = this.extractText(data);
    const usage = normalizeUsage(
      data.usageMetadata?.promptTokenCount,
      data.usageMetadata?.candidatesTokenCount
    );
    if (!usage) {
      throw new AIProviderError({
        code: "MODEL_USAGE_UNAVAILABLE",
        message: "Gemini did not return usage information."
      });
    }
    return {
      content,
      provider: this.name,
      model: options?.model || this.config.model,
      usage
    };
  }

  private extractText(data: GeminiGenerateContentResponse): string {
    const answer = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim();
    if (!answer) {
      throw new AIProviderError({
        code: "MODEL_RESPONSE_EMPTY",
        message: "Gemini returned an empty response."
      });
    }
    return answer;
  }

  private async generate(
    messages: AIMessage[],
    options?: AIChatOptions
  ): Promise<GeminiGenerateContentResponse> {
    const config = this.config;
    if (!config.apiKey) {
      throw new AIProviderError({
        code: "PROVIDER_NOT_CONFIGURED",
        message: "Gemini API key is missing. Set GEMINI_API_KEY or GOOGLE_API_KEY."
      });
    }
    const model = options?.model || config.model;

    const systemInstruction = messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");
    const contents = messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }]
      }));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? 60000);
    let response: Response;

    try {
      response = await fetch(
        `${config.baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`,
        {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: systemInstruction
              ? { parts: [{ text: systemInstruction }] }
              : undefined,
            contents,
            generationConfig: {
              temperature: options?.temperature ?? 0.2,
              ...(() => {
                const maxTokens = clampOutputTokens(options?.maxTokens, GEMINI_MAX_OUTPUT_TOKENS);
                return maxTokens ? { maxOutputTokens: maxTokens } : {};
              })()
            }
          })
        }
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new AIProviderError({
          code: "PROVIDER_TIMEOUT",
          message: "Gemini response timed out.",
          retryable: true
        });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const classified = classifyProviderHttpError(response.status);
      throw new AIProviderError({
        code: classified.code,
        retryable: classified.retryable,
        status: response.status,
        message: `Gemini request failed: ${response.status}${detail ? ` ${detail.slice(0, 180)}` : ""}`
      });
    }

    return (await response.json()) as GeminiGenerateContentResponse;
  }

  async *streamChat(messages: AIMessage[]): AsyncIterable<string> {
    const answer = await this.chat(messages);
    for (const part of answer.match(/[\s\S]{1,32}/g) || [answer]) {
      yield part;
    }
  }
}
