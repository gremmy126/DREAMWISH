import { AIProviderError, type AIMessage, type AIProvider } from "./ai-provider";

export class OllamaProvider implements AIProvider {
  name = "ollama";
  model = process.env.OLLAMA_MODEL || "llama3.1";
  private baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";

  async chat(messages: AIMessage[]): Promise<string> {
    const response = await this.request(messages, false);
    return response.message?.content?.trim() || "";
  }

  async *streamChat(messages: AIMessage[]): AsyncIterable<string> {
    const response = await this.request(messages, true);
    const reader = response.body?.getReader();

    if (!reader) {
      throw new AIProviderError("Ollama streaming 응답을 읽을 수 없습니다.");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        const parsed = JSON.parse(line);
        const token = parsed.message?.content;
        if (token) yield token;
      }
    }
  }

  private async request(messages: AIMessage[], stream: false): Promise<any>;
  private async request(messages: AIMessage[], stream: true): Promise<Response>;
  private async request(messages: AIMessage[], stream: boolean) {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream
      })
    }).catch(() => {
      throw new AIProviderError("Ollama 서버에 연결할 수 없습니다. Ollama가 실행 중인지 확인해주세요.");
    });

    if (!response.ok) {
      throw new AIProviderError(`Ollama 호출 실패: ${response.status}`);
    }

    return stream ? response : response.json();
  }
}
