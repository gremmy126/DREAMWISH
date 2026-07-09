import { AIProviderError, type AIMessage, type AIProvider } from "./ai-provider";

export class LMStudioProvider implements AIProvider {
  name = "lmstudio";
  model = process.env.LMSTUDIO_MODEL || "local-model";
  private baseUrl = process.env.LMSTUDIO_BASE_URL || "http://localhost:1234/v1";

  async chat(messages: AIMessage[]): Promise<string> {
    const json = await this.request(messages, false);
    return json.choices?.[0]?.message?.content?.trim() || "";
  }

  async *streamChat(messages: AIMessage[]): AsyncIterable<string> {
    const response = await this.request(messages, true);
    const reader = response.body?.getReader();

    if (!reader) {
      throw new AIProviderError("LM Studio streaming 응답을 읽을 수 없습니다.");
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

          const parsed = JSON.parse(data);
          const token = parsed.choices?.[0]?.delta?.content;
          if (token) yield token;
        }
      }
    }
  }

  private async request(messages: AIMessage[], stream: false): Promise<any>;
  private async request(messages: AIMessage[], stream: true): Promise<Response>;
  private async request(messages: AIMessage[], stream: boolean) {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.2,
        stream
      })
    }).catch(() => {
      throw new AIProviderError("LM Studio 서버에 연결할 수 없습니다. 로컬 서버가 실행 중인지 확인해주세요.");
    });

    if (!response.ok) {
      throw new AIProviderError(`LM Studio 호출 실패: ${response.status}`);
    }

    return stream ? response : response.json();
  }
}
