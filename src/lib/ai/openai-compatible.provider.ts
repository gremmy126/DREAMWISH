import type { AIChatOptions, AIMessage, AIProvider } from "./ai-provider";
import { AIProviderError, classifyProviderHttpError } from "./errors";

type ChatCompletionChunk = {
  choices?: Array<{ delta?: { content?: string } }>;
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

type ProviderHeaders = Record<string, string>;

export type OpenAICompatibleOptions = {
  name: string;
  model: string;
  apiKey?: string;
  baseUrl: string;
  missingKeyMessage: string;
  headers?: ProviderHeaders;
};

export class OpenAICompatibleProvider implements AIProvider {
  name: string;
  model: string;
  private apiKey?: string;
  private baseUrl: string;
  private missingKeyMessage: string;
  private headers: ProviderHeaders;

  constructor(options: OpenAICompatibleOptions) {
    this.name = options.name;
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl.replace(/\/$/u, "");
    this.missingKeyMessage = options.missingKeyMessage;
    this.headers = options.headers || {};
  }

  async chat(messages: AIMessage[], options?: AIChatOptions): Promise<string> {
    const json = (await this.request(messages, false, options)) as ChatCompletionResponse;
    const answer = json.choices?.[0]?.message?.content?.trim() || "";
    if (!answer) {
      throw new AIProviderError({
        code: "MODEL_RESPONSE_EMPTY",
        message: `${this.name} returned an empty response.`
      });
    }
    return answer;
  }

  async *streamChat(messages: AIMessage[]): AsyncIterable<string> {
    const response = (await this.request(messages, true)) as Response;
    const reader = response.body?.getReader();

    if (!reader) {
      throw new AIProviderError({
        code: "MODEL_RESPONSE_EMPTY",
        message: `${this.name} streaming response could not be read.`
      });
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const event of events) {
        for (const line of event.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;

          const parsed = JSON.parse(data) as ChatCompletionChunk;
          const token = parsed.choices?.[0]?.delta?.content;
          if (token) yield token;
        }
      }
    }
  }

  private async request(messages: AIMessage[], stream: boolean, options?: AIChatOptions) {
    if (!this.apiKey) {
      throw new AIProviderError({
        code: "PROVIDER_NOT_CONFIGURED",
        message: this.missingKeyMessage
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? 60000);
    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          ...this.headers
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: options?.temperature ?? 0.2,
          ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
          stream
        })
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new AIProviderError({
          code: "PROVIDER_TIMEOUT",
          message: `${this.name} response timed out.`,
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
        message: `${this.name} request failed: ${response.status}${detail ? ` ${detail.slice(0, 180)}` : ""}`
      });
    }

    return stream ? response : response.json();
  }
}
