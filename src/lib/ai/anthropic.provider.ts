import type { AIChatOptions, AIMessage, AIProvider } from "./ai-provider";
import { getProviderRuntimeConfig } from "./config";
import { AIProviderError, classifyProviderHttpError } from "./errors";

// Claude (Anthropic Messages API). OpenAI 호환 형식이 아니라 별도 구현이
// 필요하다: system 메시지는 top-level `system` 필드로, 인증은 x-api-key
// 헤더로, max_tokens는 필수 필드로 전달한다.

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 4096;

type AnthropicResponse = {
  content?: Array<{ type: string; text?: string }>;
};

type AnthropicStreamEvent = {
  type?: string;
  delta?: { type?: string; text?: string };
};

export class AnthropicProvider implements AIProvider {
  name = "claude";
  model: string;
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    const config = getProviderRuntimeConfig("claude");
    this.model = config.model;
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || "https://api.anthropic.com/v1").replace(/\/$/u, "");
  }

  async chat(messages: AIMessage[], options?: AIChatOptions): Promise<string> {
    const json = (await this.request(messages, false, options)) as AnthropicResponse;
    const answer = (json.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("")
      .trim();
    if (!answer) {
      throw new AIProviderError({
        code: "MODEL_RESPONSE_EMPTY",
        message: "Claude returned an empty response."
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
        message: "Claude streaming response could not be read."
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
          if (!data) continue;
          let parsed: AnthropicStreamEvent;
          try {
            parsed = JSON.parse(data) as AnthropicStreamEvent;
          } catch {
            continue;
          }
          if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
            const token = parsed.delta.text;
            if (token) yield token;
          }
        }
      }
    }
  }

  private async request(messages: AIMessage[], stream: boolean, options?: AIChatOptions) {
    if (!this.apiKey) {
      throw new AIProviderError({
        code: "PROVIDER_NOT_CONFIGURED",
        message: "Claude API key is not configured. Set ANTHROPIC_API_KEY."
      });
    }

    // Messages API는 system 역할을 messages 배열에 넣을 수 없다.
    const system = messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");
    const turns = messages
      .filter((message) => message.role !== "system")
      .map((message) => ({ role: message.role, content: message.content }));
    if (turns.length === 0) {
      turns.push({ role: "user", content: system || "안녕하세요" });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options?.timeoutMs ?? 60_000);
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/messages`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": ANTHROPIC_VERSION
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: options?.maxTokens ?? DEFAULT_MAX_TOKENS,
          ...(system ? { system } : {}),
          messages: turns,
          temperature: options?.temperature ?? 0.2,
          stream
        })
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new AIProviderError({
          code: "PROVIDER_TIMEOUT",
          message: "Claude response timed out.",
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
        message: `Claude request failed: ${response.status}${detail ? ` ${detail.slice(0, 180)}` : ""}`
      });
    }

    return stream ? response : response.json();
  }
}
