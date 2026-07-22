import assert from "node:assert/strict";
import {
  getConfiguredAIProviders,
  getDefaultAIProviderName,
  getPublicAIProviderCatalog,
  getProviderRuntimeConfig
} from "../src/lib/ai/config";
import { parseProviderName } from "../src/lib/ai/provider-options";
import { isExternalProvider } from "../src/lib/privacy/privacy.config";

test("Claude is a first-class provider and becomes the default when configured", () => {
  withEnv(
    {
      AI_PROVIDER: undefined,
      ANTHROPIC_API_KEY: "sk-ant-test",
      ANTHROPIC_MODEL: undefined,
      ANTHROPIC_BASE_URL: undefined,
      CLAUDE_API_KEY: undefined,
      CLAUDE_MODEL: undefined,
      GEMINI_API_KEY: "gemini-key",
      OPENROUTER_API_KEY: undefined,
      GROQ_API_KEY: undefined,
      HF_TOKEN: undefined,
      HUGGINGFACE_API_KEY: undefined,
      CLOUDFLARE_API_TOKEN: undefined
    },
    () => {
      assert.equal(getDefaultAIProviderName(), "claude");
      assert.deepEqual(
        getConfiguredAIProviders().map((provider) => provider.provider),
        ["claude", "gemini"]
      );
      const config = getProviderRuntimeConfig("claude");
      assert.equal(config.model, "claude-sonnet-5");
      assert.equal(config.baseUrl, "https://api.anthropic.com/v1");

      const item = getPublicAIProviderCatalog().find((entry) => entry.provider === "claude");
      assert.deepEqual(item, {
        provider: "claude",
        label: "Claude",
        model: "claude-sonnet-5",
        configured: true
      });
      assert.equal("apiKey" in (item || {}), false);
    }
  );
});

test("Claude passes request validation and privacy gating like other external providers", () => {
  assert.equal(parseProviderName("claude"), "claude");
  assert.equal(parseProviderName("CLAUDE"), "claude");
  assert.ok(isExternalProvider("claude"));
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
