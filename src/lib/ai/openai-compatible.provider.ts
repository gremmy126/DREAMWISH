import {
  clampOutputTokens,
  normalizeUsage,
  type AIChatOptions,
  type AICompletion,
  type AIMessage,
  type AIProvider
} from "./ai-provider";
import { AIProviderError, classifyProviderHttpError } from "./errors";

type ChatCompletionChunk = {
  choices?: Array<{ delta?: { content?: string } }>;
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

type ProviderHeaders = Record<string, string>;

export type OpenAICompatibleOptions = {
  name: string;
  model: string;
  apiKey?: string;
  baseUrl: string;
  missingKeyMessage: string;
  headers?: ProviderHeaders;
  /** 모델이 허용하는 최대 출력 토큰 — 요청값이 넘으면 이 값으로 잘라낸다. */
  maxOutputTokensCap?: number;
  maxTokensField?: "max_tokens" | "max_completion_tokens";
  /** 입력과 요청 출력의 보수적 합계 상한. 공급자 TPM보다 낮게 설정한다. */
  totalTokenRequestBudget?: number;
};

export class OpenAICompatibleProvider implements AIProvider {
  name: string;
  model: string;
  private apiKey?: string;
  private baseUrl: string;
  private missingKeyMessage: string;
  private headers: ProviderHeaders;
  private maxOutputTokensCap: number;
  private maxTokensField: "max_tokens" | "max_completion_tokens";
  private totalTokenRequestBudget?: number;

  constructor(options: OpenAICompatibleOptions) {
    this.name = options.name;
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl.replace(/\/$/u, "");
    this.missingKeyMessage = options.missingKeyMessage;
    this.headers = options.headers || {};
    this.maxOutputTokensCap = options.maxOutputTokensCap ?? 8_000;
    this.maxTokensField = options.maxTokensField ?? "max_tokens";
    this.totalTokenRequestBudget = options.totalTokenRequestBudget;
  }

  async chat(messages: AIMessage[], options?: AIChatOptions): Promise<string> {
    const json = (await this.request(messages, false, options)) as ChatCompletionResponse;
    return this.extractText(json);
  }

  async chatWithUsage(messages: AIMessage[], options?: AIChatOptions): Promise<AICompletion> {
    const json = (await this.request(messages, false, options)) as ChatCompletionResponse;
    const content = this.extractText(json);
    const usage = normalizeUsage(json.usage?.prompt_tokens, json.usage?.completion_tokens);
    if (!usage) {
      throw new AIProviderError({
        code: "MODEL_USAGE_UNAVAILABLE",
        message: `${this.name} did not return usage information.`
      });
    }
    return { content, provider: this.name, model: options?.model || this.model, usage };
  }

  private extractText(json: ChatCompletionResponse): string {
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

    const maxTokens = this.resolveMaxTokens(messages, options?.maxTokens);

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
          model: options?.model || this.model,
          messages,
          temperature: options?.temperature ?? 0.2,
          ...(maxTokens ? { [this.maxTokensField]: maxTokens } : {}),
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

  private resolveMaxTokens(messages: AIMessage[], requested?: number) {
    const clamped = clampOutputTokens(requested, this.maxOutputTokensCap);
    if (!this.totalTokenRequestBudget) return clamped;

    const requestedOrCap = clamped ?? this.maxOutputTokensCap;
    const conservativeInputTokens = messages.reduce(
      (total, message) => total + new TextEncoder().encode(message.content).length + 8,
      0
    );
    const available =
      this.totalTokenRequestBudget - conservativeInputTokens - 256;

    if (available < 256) {
      throw new AIProviderError({
        code: "PROVIDER_RATE_LIMIT",
        message: `${this.name} prompt exceeds the safe per-request token budget.`,
        retryable: true,
        status: 429
      });
    }

    return Math.min(requestedOrCap, Math.floor(available));
  }
}
