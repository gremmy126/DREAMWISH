import assert from "node:assert/strict";
import fs from "node:fs";
import {
  getPublicAIProviderCatalog,
  getProviderAttemptOrder,
  parseExternalProvider
} from "../src/lib/ai/config";
import { parseProviderName, SUPPORTED_PROVIDER_NAMES } from "../src/lib/ai/provider-options";
import { getAllAIModelTiers } from "../src/lib/ai/ai-model-catalog";

// Cloudflare is removed only as an AI model provider. The CDN, HTTP 524
// guidance, and deployment references must remain — those are checked below.

test("the cloudflare AI provider file is deleted", () => {
  assert.equal(fs.existsSync("src/lib/ai/cloudflare.provider.ts"), false);
});

test("no AI provider surface references cloudflare", () => {
  const files = [
    "src/lib/ai/config.ts",
    "src/lib/ai/ai-provider.ts",
    "src/lib/ai/ai.service.ts",
    "src/lib/ai/provider-options.ts",
    "src/lib/ai/ai-model-catalog.ts",
    "src/lib/integrations/connection-status.ts",
    "src/lib/privacy/privacy.config.ts",
    "components/Settings/SettingsView.tsx"
  ];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /cloudflare/iu, `${file} still references cloudflare`);
  }
});

test("cloudflare cannot be selected, parsed, ordered, or exposed by AI catalogs", () => {
  assert.equal([...SUPPORTED_PROVIDER_NAMES].includes("cloudflare" as never), false);
  assert.equal(parseProviderName("cloudflare"), undefined);
  assert.equal(parseExternalProvider("cloudflare"), undefined);
  assert.equal(getPublicAIProviderCatalog().some((item) => item.provider === "cloudflare" as never), false);
  assert.equal(getAllAIModelTiers().some((tier) => tier.provider === "cloudflare" as never), false);
});

test("a stored cloudflare selection falls back to a configured provider", () => {
  const original = { ...process.env };
  process.env = {
    ...original,
    AI_PROVIDER: "cloudflare",
    GEMINI_API_KEY: "gemini-key",
    CLOUDFLARE_API_TOKEN: "leftover"
  };
  try {
    assert.deepEqual(getProviderAttemptOrder(), ["gemini"]);
    assert.deepEqual(getProviderAttemptOrder("cloudflare" as never), ["gemini"]);
  } finally {
    process.env = original;
  }
});

test("the AI env example no longer advertises cloudflare AI keys", () => {
  const env = fs.readFileSync(".env.example", "utf8");
  assert.doesNotMatch(env, /CLOUDFLARE_ACCOUNT_ID|CLOUDFLARE_API_TOKEN|CLOUDFLARE_AI_MODEL/u);
});

test("non-AI cloudflare references (CDN, HTTP 524) stay intact", () => {
  // The agent-build timeout guidance references Cloudflare's 524 status; it is
  // deployment/CDN guidance, not an AI provider, and must not be removed.
  const timeoutTest = fs.readFileSync("tests/agent-build-timeout-budget.test.ts", "utf8");
  assert.match(timeoutTest, /524|cloudflare/iu);
});
