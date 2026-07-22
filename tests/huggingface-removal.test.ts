import assert from "node:assert/strict";
import fs from "node:fs";
import {
  getPublicAIProviderCatalog,
  getProviderAttemptOrder,
  parseExternalProvider
} from "../src/lib/ai/config";
import { parseProviderName, SUPPORTED_PROVIDER_NAMES } from "../src/lib/ai/provider-options";

test("the huggingface provider file is deleted", () => {
  assert.equal(fs.existsSync("src/lib/ai/huggingface.provider.ts"), false);
});

test("huggingface is removed from every provider surface", () => {
  const files = [
    "src/lib/ai/config.ts",
    "src/lib/ai/ai-provider.ts",
    "src/lib/ai/ai.service.ts",
    "src/lib/ai/provider-options.ts",
    "src/lib/integrations/connection-status.ts",
    "src/lib/privacy/privacy.config.ts",
    "components/Settings/SettingsView.tsx"
  ];
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /huggingface/iu, `${file} still references huggingface`);
    assert.doesNotMatch(source, /HuggingFaceProvider/u, `${file} still constructs the HF provider`);
  }
});

test("the supported provider list keeps Claude and the other providers but drops huggingface", () => {
  assert.deepEqual(
    [...SUPPORTED_PROVIDER_NAMES],
    ["claude", "gemini", "openrouter", "groq"]
  );
  assert.equal(getPublicAIProviderCatalog().some((item) => item.provider === "huggingface" as never), false);
});

test("a stored huggingface selection falls back safely instead of crashing", () => {
  // 지원 종료 공급자를 요청해도 undefined로 폴백하고, 시도 순서는 등록된
  // 공급자만으로 구성된다(기존 Agent가 깨지지 않도록).
  assert.equal(parseProviderName("huggingface"), undefined);
  assert.equal(parseExternalProvider("huggingface"), undefined);
  const original = { ...process.env };
  process.env = { ...original, AI_PROVIDER: "huggingface", GEMINI_API_KEY: "gemini-key", HF_TOKEN: "leftover" };
  try {
    assert.deepEqual(getProviderAttemptOrder(), ["gemini"]);
    assert.deepEqual(getProviderAttemptOrder("huggingface" as never), ["gemini"]);
  } finally {
    process.env = original;
  }
});

test("env example and operator docs no longer advertise huggingface keys", () => {
  const env = fs.readFileSync(".env.example", "utf8");
  assert.doesNotMatch(env, /HUGGINGFACE|HF_TOKEN|HF_MODEL/u);
  assert.match(env, /ANTHROPIC_API_KEY/u);
});
