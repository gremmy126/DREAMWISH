export type AIMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

// 호출별 오버라이드 — 긴 결과물(AI Agent 웹사이트 생성 등)은 기본 60초
// 타임아웃과 기본 출력 한도로는 부족해 명시적으로 늘릴 수 있어야 한다.
export type AIChatOptions = {
  timeoutMs?: number;
  maxTokens?: number;
  temperature?: number;
};

export interface AIProvider {
  name: string;
  model: string;
  streamChat(messages: AIMessage[]): AsyncIterable<string>;
  chat(messages: AIMessage[], options?: AIChatOptions): Promise<string>;
}

export type AIProviderName =
  | "groq"
  | "gemini"
  | "openrouter"
  | "huggingface"
  | "cloudflare";

export function getConfiguredProviderName(): AIProviderName {
  const value = (process.env.AI_PROVIDER || "").toLowerCase();

  if (
    value === "groq" ||
    value === "gemini" ||
    value === "openrouter" ||
    value === "huggingface" ||
    value === "cloudflare"
  ) {
    return value;
  }

  throw new Error("No connected AI provider is configured.");
}
