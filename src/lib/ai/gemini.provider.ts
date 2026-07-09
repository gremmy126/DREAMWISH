import { AIProviderError, type AIMessage, type AIProvider } from "./ai-provider";

type GeminiInteractionResponse = {
  output_text?: string;
  steps?: Array<{
    output?: Array<{ text?: string }>;
  }>;
};

export class GeminiProvider implements AIProvider {
  name = "gemini";
  model = process.env.GEMINI_MODEL || "gemini-3.5-flash";

  private get apiKey() {
    return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  }

  async chat(messages: AIMessage[]): Promise<string> {
    if (!this.apiKey) {
      throw new AIProviderError("Gemini API Key가 없습니다. GEMINI_API_KEY를 설정해주세요.");
    }

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": this.apiKey
      },
      body: JSON.stringify({
        model: this.model,
        system_instruction: messages
          .filter((message) => message.role === "system")
          .map((message) => message.content)
          .join("\n\n"),
        input: messages
          .filter((message) => message.role !== "system")
          .map((message) => `${message.role}: ${message.content}`)
          .join("\n\n"),
        generation_config: {
          thinking_level: "low"
        }
      })
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new AIProviderError(
        `Gemini 호출 실패: ${response.status}${detail ? ` ${detail.slice(0, 240)}` : ""}`
      );
    }

    const data = (await response.json()) as GeminiInteractionResponse;
    return data.output_text || extractTextFromSteps(data) || "";
  }

  async *streamChat(messages: AIMessage[]): AsyncIterable<string> {
    const answer = await this.chat(messages);
    const parts = answer.match(/[\s\S]{1,28}/g) || [answer];

    for (const part of parts) {
      yield part;
    }
  }
}

function extractTextFromSteps(data: GeminiInteractionResponse) {
  return data.steps
    ?.flatMap((step) => step.output || [])
    .map((output) => output.text || "")
    .join("")
    .trim();
}
