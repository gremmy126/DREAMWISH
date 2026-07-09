import { AIProviderError, type AIMessage, type AIProvider } from "./ai-provider";

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

  async chat(messages: AIMessage[]): Promise<string> {
    const json = (await this.request(messages, false)) as ChatCompletionResponse;
    return json.choices?.[0]?.message?.content?.trim() || "";
  }

  async *streamChat(messages: AIMessage[]): AsyncIterable<string> {
    const response = (await this.request(messages, true)) as Response;
    const reader = response.body?.getReader();

    if (!reader) {
      throw new AIProviderError(`${this.name} streaming 응답을 읽을 수 없습니다.`);
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

  private async request(messages: AIMessage[], stream: boolean) {
    if (!this.apiKey) {
      throw new AIProviderError(this.missingKeyMessage);
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        ...this.headers
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.2,
        stream
      })
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new AIProviderError(
        `${this.name} 호출 실패: ${response.status}${detail ? ` ${detail.slice(0, 240)}` : ""}`
      );
    }

    return stream ? response : response.json();
  }
}
