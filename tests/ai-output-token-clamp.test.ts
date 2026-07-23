import assert from "node:assert/strict";
import { clampOutputTokens } from "../src/lib/ai/ai-provider";
import { GroqProvider } from "../src/lib/ai/groq.provider";

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

test("Groq Agent Build uses the current model and completion-token field", async () => {
  const originalKey = process.env.GROQ_API_KEY;
  const originalModel = process.env.GROQ_MODEL;
  const originalFetch = globalThis.fetch;
  let requestBody: { model?: string; max_tokens?: number; max_completion_tokens?: number } = {};
  process.env.GROQ_API_KEY = "test-key";
  delete process.env.GROQ_MODEL;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body || "{}")) as typeof requestBody;
    return new Response(
      JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    const answer = await new GroqProvider().chat(
      [{ role: "user", content: "Build a landing page" }],
      { maxTokens: 16_000 }
    );
    assert.equal(answer, "ok");
    assert.equal(requestBody.model, "openai/gpt-oss-20b");
    assert.equal(requestBody.max_tokens, undefined);
    assert.equal(requestBody.max_completion_tokens, 4_000);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.GROQ_MODEL;
    else process.env.GROQ_MODEL = originalModel;
  }
});

test("Groq reserves room for Agent Build input within its conservative TPM budget", async () => {
  const originalKey = process.env.GROQ_API_KEY;
  const originalModel = process.env.GROQ_MODEL;
  const originalFetch = globalThis.fetch;
  const content = "x".repeat(6_000);
  let requestedCompletionTokens = 0;
  process.env.GROQ_API_KEY = "test-key";
  delete process.env.GROQ_MODEL;
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body || "{}")) as {
      max_completion_tokens?: number;
    };
    requestedCompletionTokens = body.max_completion_tokens || 0;
    return new Response(
      JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    await new GroqProvider().chat([{ role: "user", content }], { maxTokens: 16_000 });
    const conservativeInputTokens = new TextEncoder().encode(content).length + 8;
    assert.ok(requestedCompletionTokens > 0);
    assert.ok(requestedCompletionTokens < 4_000);
    assert.ok(conservativeInputTokens + requestedCompletionTokens + 256 <= 7_500);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.GROQ_MODEL;
    else process.env.GROQ_MODEL = originalModel;
  }
});

test("Groq skips requests whose input leaves no safe completion budget", async () => {
  const originalKey = process.env.GROQ_API_KEY;
  const originalModel = process.env.GROQ_MODEL;
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  process.env.GROQ_API_KEY = "test-key";
  delete process.env.GROQ_MODEL;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return new Response(
      JSON.stringify({ choices: [{ message: { content: "unexpected" } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  try {
    await assert.rejects(
      () =>
        new GroqProvider().chat(
          [{ role: "user", content: "x".repeat(8_000) }],
          { maxTokens: 16_000 }
        ),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "PROVIDER_RATE_LIMIT"
    );
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.GROQ_MODEL;
    else process.env.GROQ_MODEL = originalModel;
  }
});
