import type { AIChatOptions, AIMessage, AIProvider } from "./ai-provider";
import { getProviderRuntimeConfig } from "./config";
import { AIProviderError, classifyProviderHttpError } from "./errors";

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

export class GeminiProvider implements AIProvider {
  name = "gemini";
  model = getProviderRuntimeConfig("gemini").model;

  private get config() {
    return getProviderRuntimeConfig("gemini");
  }

  async chat(messages: AIMessage[], options?: AIChatOptions): Promise<string> {
    const config = this.config;
    if (!config.apiKey) {
      throw new AIProviderError({
        code: "PROVIDER_NOT_CONFIGURED",
        message: "Gemini API key is missing. Set GEMINI_API_KEY or GOOGLE_API_KEY."
      });
    }

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
        `${config.baseUrl}/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`,
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
              ...(options?.maxTokens ? { maxOutputTokens: options.maxTokens } : {})
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

    const data = (await response.json()) as GeminiGenerateContentResponse;
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

  async *streamChat(messages: AIMessage[]): AsyncIterable<string> {
    const answer = await this.chat(messages);
    for (const part of answer.match(/[\s\S]{1,32}/g) || [answer]) {
      yield part;
    }
  }
}
