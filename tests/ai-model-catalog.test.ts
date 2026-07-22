import assert from "node:assert/strict";
import {
  AI_MODEL_TIER_IDS,
  CREDITS_PER_PRODUCT,
  OPENROUTER_PREMIUM_FLOOR_KRW,
  getAllAIModelTiers,
  getConfiguredAIModelTiers,
  getAIModelTier,
  isAIModelTierId,
  resolveTierPriceKrw
} from "../src/lib/ai/ai-model-catalog";

function withEnv(values: Record<string, string | undefined>, run: () => void) {
  const original = { ...process.env };
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    run();
  } finally {
    process.env = original;
  }
}

test("catalog exposes exactly the ten approved tiers", () => {
  assert.equal(AI_MODEL_TIER_IDS.length, 10);
  assert.equal(getAllAIModelTiers().length, 10);
  assert.equal(CREDITS_PER_PRODUCT, 1_000_000);
});

test("nine tiers have their exact fixed prices", () => {
  const prices: Record<string, number> = {
    "gemini-flash": 4_900,
    "gemini-pro": 14_900,
    "groq-fast": 4_900,
    "groq-advanced": 9_900,
    "claude-haiku": 7_900,
    "claude-sonnet": 19_900,
    "claude-opus": 39_900,
    "openrouter-economy": 6_900,
    "openrouter-standard": 14_900
  };
  for (const [tier, price] of Object.entries(prices)) {
    assert.equal(resolveTierPriceKrw(tier as never), price, tier);
  }
});

test("OpenRouter Premium is quoted at or above the KRW 39,900 floor", () => {
  withEnv({ OPENROUTER_PREMIUM_PRICE_KRW: undefined }, () => {
    assert.equal(resolveTierPriceKrw("openrouter-premium"), OPENROUTER_PREMIUM_FLOOR_KRW);
  });
  withEnv({ OPENROUTER_PREMIUM_PRICE_KRW: "20000" }, () => {
    // A configured value below the floor is clamped up, never quoted below.
    assert.equal(resolveTierPriceKrw("openrouter-premium"), OPENROUTER_PREMIUM_FLOOR_KRW);
  });
  withEnv({ OPENROUTER_PREMIUM_PRICE_KRW: "59000" }, () => {
    assert.equal(resolveTierPriceKrw("openrouter-premium"), 59_000);
  });
});

test("a tier is configured only when both its API key and model id resolve", () => {
  withEnv(
    {
      GEMINI_API_KEY: undefined,
      GOOGLE_API_KEY: undefined,
      GEMINI_FLASH_MODEL: undefined,
      GEMINI_PRO_MODEL: undefined
    },
    () => {
      assert.equal(getAIModelTier("gemini-flash").configured, false); // no key
    }
  );
  withEnv(
    { GEMINI_API_KEY: "key", GEMINI_FLASH_MODEL: undefined, GEMINI_PRO_MODEL: undefined },
    () => {
      // Flash has a proven default model, so a key alone configures it.
      assert.equal(getAIModelTier("gemini-flash").configured, true);
      // Pro has no default model, so it stays hidden until one is set.
      assert.equal(getAIModelTier("gemini-pro").configured, false);
    }
  );
  withEnv({ GEMINI_API_KEY: "key", GEMINI_PRO_MODEL: "gemini-2.5-pro" }, () => {
    assert.equal(getAIModelTier("gemini-pro").configured, true);
    assert.equal(getAIModelTier("gemini-pro").modelId, "gemini-2.5-pro");
  });
});

test("only configured tiers are listed and no secrets leak into the tier DTO", () => {
  withEnv(
    {
      ANTHROPIC_API_KEY: undefined,
      CLAUDE_API_KEY: undefined,
      GEMINI_API_KEY: "key",
      GOOGLE_API_KEY: undefined,
      GROQ_API_KEY: undefined,
      OPENROUTER_API_KEY: undefined
    },
    () => {
      const configured = getConfiguredAIModelTiers();
      assert.ok(configured.every((tier) => tier.configured));
      assert.ok(configured.some((tier) => tier.id === "gemini-flash"));
      assert.ok(!configured.some((tier) => tier.provider === "claude"));
      for (const tier of configured) {
        assert.equal("apiKey" in tier, false);
        assert.equal("apiKeyEnvKeys" in tier, false);
      }
    }
  );
});

test("tier id guard rejects unknown ids", () => {
  assert.equal(isAIModelTierId("claude-sonnet"), true);
  assert.equal(isAIModelTierId("gpt-5"), false);
  assert.equal(isAIModelTierId(42), false);
});
