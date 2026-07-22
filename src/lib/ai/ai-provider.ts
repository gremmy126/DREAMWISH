export type AIMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

// 호출별 오버라이드 — 긴 결과물(AI Agent 웹사이트 생성 등)은 기본 60초
// 타임아웃과 기본 출력 한도로는 부족해 명시적으로 늘릴 수 있어야 한다.
// `model`은 크레딧 티어별 모델을 정확히 지정하기 위한 호출별 오버라이드다.
export type AIChatOptions = {
  timeoutMs?: number;
  maxTokens?: number;
  temperature?: number;
  model?: string;
};

export type AIUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

// 계량 결제는 문자열만으로는 부족하다: 공급자 네이티브 usage를 함께 반환해
// 실제 소비 토큰으로 정산한다. usage가 없거나 잘못되면 0이 아니라 정산 실패다.
export type AICompletion = {
  content: string;
  provider: string;
  model: string;
  usage: AIUsage;
};

export interface AIProvider {
  name: string;
  model: string;
  streamChat(messages: AIMessage[]): AsyncIterable<string>;
  chat(messages: AIMessage[], options?: AIChatOptions): Promise<string>;
  /** Non-streaming call that also returns authoritative provider token usage. */
  chatWithUsage?(messages: AIMessage[], options?: AIChatOptions): Promise<AICompletion>;
}

/**
 * Validates a provider's native token counts. Returns null when usage is
 * missing or malformed so the metering layer can fail closed (a metering
 * failure) instead of charging zero.
 */
export function normalizeUsage(input: unknown, output: unknown): AIUsage | null {
  const inputTokens = Number(input);
  const outputTokens = Number(output);
  if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens)) return null;
  if (inputTokens < 0 || outputTokens < 0) return null;
  return {
    inputTokens: Math.round(inputTokens),
    outputTokens: Math.round(outputTokens),
    totalTokens: Math.round(inputTokens) + Math.round(outputTokens)
  };
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
  | "openrouter";

export function getConfiguredProviderName(): AIProviderName {
  const value = (process.env.AI_PROVIDER || "").toLowerCase();

  if (
    value === "claude" ||
    value === "groq" ||
    value === "gemini" ||
    value === "openrouter"
  ) {
    return value;
  }

  throw new Error("No connected AI provider is configured.");
}
