export type AIMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface AIProvider {
  name: string;
  model: string;
  streamChat(messages: AIMessage[]): AsyncIterable<string>;
  chat(messages: AIMessage[]): Promise<string>;
}

export type AIProviderName =
  | "groq"
  | "gemini"
  | "openrouter"
  | "huggingface"
  | "cloudflare"
  | "ollama"
  | "lmstudio"
  | "mock";

export class AIProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIProviderError";
  }
}

export function getConfiguredProviderName(): AIProviderName {
  const value = (process.env.AI_PROVIDER || "mock").toLowerCase();

  if (
    value === "groq" ||
    value === "gemini" ||
    value === "openrouter" ||
    value === "huggingface" ||
    value === "cloudflare" ||
    value === "ollama" ||
    value === "lmstudio" ||
    value === "mock"
  ) {
    return value;
  }

  return "mock";
}
