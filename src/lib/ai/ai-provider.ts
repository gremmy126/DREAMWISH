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

/**
 * 요청된 출력 토큰 수를 공급자별 모델 한도로 잘라낸다. 한도를 넘는 값을
 * 그대로 보내면 대부분의 API가 400으로 요청 전체를 거부하므로(생성 실패의
 * 주요 원인), 상한을 넘으면 조용히 한도로 낮춰 호출이 항상 성립하게 한다.
 */
export function clampOutputTokens(
  requested: number | undefined,
  cap: number
): number | undefined {
  if (typeof requested !== "number" || !Number.isFinite(requested) || requested <= 0) {
    return undefined;
  }
  return Math.min(Math.floor(requested), cap);
}

export type AIProviderName =
  | "claude"
  | "groq"
  | "gemini"
  | "openrouter"
  | "cloudflare";

export function getConfiguredProviderName(): AIProviderName {
  const value = (process.env.AI_PROVIDER || "").toLowerCase();

  if (
    value === "claude" ||
    value === "groq" ||
    value === "gemini" ||
    value === "openrouter" ||
    value === "cloudflare"
  ) {
    return value;
  }

  throw new Error("No connected AI provider is configured.");
}
