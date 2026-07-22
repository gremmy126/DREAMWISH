import assert from "node:assert/strict";
import type { AIMessage, AIProvider, AIProviderName } from "../src/lib/ai/ai-provider";
import { getProviderAttemptOrder } from "../src/lib/ai/config";
import {
  chatWithProviderFailover,
  streamWithProviderFailover
} from "../src/lib/ai/ai.service";
import { getPrivacyMode } from "../src/lib/privacy/privacy.config";

const messages: AIMessage[] = [{ role: "user", content: "hello" }];

test("configured non-OpenAI credentials enable external AI unless explicitly denied", () => {
  withEnv(
    {
      PRIVACY_LOCAL_ONLY: undefined,
      ALLOW_EXTERNAL_AI: undefined,
      PRIVACY_ALLOW_EXTERNAL_AI: undefined,
      GEMINI_API_KEY: "configured"
    },
    () => assert.equal(getPrivacyMode().allowExternalAI, true)
  );

  withEnv(
    { PRIVACY_LOCAL_ONLY: "false", ALLOW_EXTERNAL_AI: "FALSE", GEMINI_API_KEY: "configured" },
    () => assert.equal(getPrivacyMode().allowExternalAI, false)
  );
});

test("provider attempt order starts with the selected configured provider then uses the remaining configured providers", () => {
  withEnv(
    {
      GEMINI_API_KEY: "gemini",
      OPENROUTER_API_KEY: "openrouter",
      GROQ_API_KEY: "groq",
      CLOUDFLARE_API_TOKEN: undefined,
      CLOUDFLARE_API_KEY: undefined
    },
    () => assert.deepEqual(getProviderAttemptOrder("openrouter"), ["openrouter", "gemini", "groq"])
  );
});

test("chat falls back to the next configured provider after a provider failure", async () => {
  const calls: string[] = [];
  const answer = await chatWithProviderFailover(messages, ["gemini", "openrouter"], (name) => {
    calls.push(name);
    return fakeProvider(name, name === "gemini" ? new Error("unavailable") : "fallback answer");
  });
  assert.equal(answer, "fallback answer");
  assert.deepEqual(calls, ["gemini", "openrouter"]);
});

test("stream falls back only before the first token is emitted", async () => {
  const output: string[] = [];
  for await (const token of streamWithProviderFailover(
    messages,
    ["gemini", "cloudflare"],
    (name) => fakeProvider(name, name === "gemini" ? new Error("no response") : "fallback answer")
  )) {
    output.push(token);
  }
  assert.equal(output.join(""), "fallback answer");
});

function fakeProvider(name: AIProviderName, outcome: string | Error): AIProvider {
  return {
    name,
    model: "test",
    async chat() {
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
    async *streamChat() {
      if (outcome instanceof Error) throw outcome;
      yield outcome;
    }
  };
}

function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const original = { ...process.env };
  process.env = { ...original };
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    process.env = original;
  }
}
