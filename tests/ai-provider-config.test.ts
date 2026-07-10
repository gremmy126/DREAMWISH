import assert from "node:assert/strict";
import {
  getConfiguredAIProviders,
  getDefaultAIProviderName,
  getProviderRuntimeConfig
} from "../src/lib/ai/config";
import { buildContextAwareChatMessages } from "../src/lib/ai/prompts";

test("AI config selects the first configured external provider without falling back to mock", () => {
  withEnv(
    {
      AI_PROVIDER: undefined,
      OPENAI_API_KEY: undefined,
      ANTHROPIC_API_KEY: undefined,
      GEMINI_API_KEY: "gemini-key",
      GOOGLE_API_KEY: undefined,
      OPENROUTER_API_KEY: "openrouter-key",
      GROQ_API_KEY: undefined
    },
    () => {
      assert.equal(getDefaultAIProviderName(), "gemini");
      assert.deepEqual(
        getConfiguredAIProviders().map((provider) => provider.provider),
        ["gemini", "openrouter"]
      );
    }
  );
});

test("AI config returns a clear provider-not-configured error when no external provider is connected", () => {
  withEnv(
    {
      AI_PROVIDER: undefined,
      OPENAI_API_KEY: undefined,
      ANTHROPIC_API_KEY: undefined,
      GEMINI_API_KEY: undefined,
      GOOGLE_API_KEY: undefined,
      OPENROUTER_API_KEY: undefined,
      GROQ_API_KEY: undefined,
      HF_TOKEN: undefined,
      HUGGINGFACE_API_KEY: undefined,
      CLOUDFLARE_ACCOUNT_ID: undefined,
      CLOUDFLARE_API_TOKEN: undefined
    },
    () => {
      assert.throws(
        () => getDefaultAIProviderName(),
        /No connected AI provider/u
      );
    }
  );
});

test("OpenRouter runtime config never uses localhost referer in production", () => {
  withEnv(
    {
      OPENROUTER_API_KEY: "openrouter-key",
      APP_URL: "https://dreamwish.co.kr",
      NEXT_PUBLIC_SITE_URL: undefined
    },
    () => {
      const config = getProviderRuntimeConfig("openrouter");
      assert.equal(config.baseUrl, "https://openrouter.ai/api/v1");
      assert.equal(config.headers?.["HTTP-Referer"], "https://dreamwish.co.kr");
    }
  );
});

test("context-aware chat messages use general mode when no local documents are available", () => {
  const withContext = buildContextAwareChatMessages({
    question: "내 프로젝트 요약해줘",
    contextText: "[Context 1]\nProject notes",
    contextAvailable: true
  });
  const withoutContext = buildContextAwareChatMessages({
    question: "내 프로젝트 요약해줘",
    contextText: "",
    contextAvailable: false
  });

  assert.match(withContext[0].content, /local documents/i);
  assert.match(withoutContext[0].content, /No local documents were found/i);
  assert.equal(withoutContext.at(-1)?.role, "user");
  assert.equal(withoutContext.at(-1)?.content, "내 프로젝트 요약해줘");
});

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
