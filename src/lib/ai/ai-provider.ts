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
