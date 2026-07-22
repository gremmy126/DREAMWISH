import assert from "node:assert/strict";
import { clampOutputTokens } from "../src/lib/ai/ai-provider";

// AI Agent 빌드는 maxTokens 16000을 요청한다. 작은 모델(Gemini Flash 8192,
// llama-3.1-8b 8192 등)은 한도를 넘는 값을 400으로 거부하므로, 공급자별
// 상한으로 잘라내야 모든 등록 모델이 Agent 생성에 사용될 수 있다.
test("output token requests are clamped to each model's limit", () => {
  assert.equal(clampOutputTokens(16_000, 8_192), 8_192); // gemini
  assert.equal(clampOutputTokens(16_000, 8_000), 8_000); // groq/openrouter
  assert.equal(clampOutputTokens(16_000, 2_048), 2_048); // cloudflare
  assert.equal(clampOutputTokens(16_000, 32_000), 16_000); // claude — 요청값 유지
  assert.equal(clampOutputTokens(2_000, 8_192), 2_000); // 한도 이하는 그대로
});

test("invalid or missing requests fall back to the provider default", () => {
  assert.equal(clampOutputTokens(undefined, 8_192), undefined);
  assert.equal(clampOutputTokens(0, 8_192), undefined);
  assert.equal(clampOutputTokens(-5, 8_192), undefined);
  assert.equal(clampOutputTokens(Number.NaN, 8_192), undefined);
  assert.equal(clampOutputTokens(4096.7, 8_192), 4096);
});
