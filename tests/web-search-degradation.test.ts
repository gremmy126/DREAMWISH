import assert from "node:assert/strict";
import fs from "node:fs";
import { searchWebSafely } from "../src/lib/web-search/web-search-outcome";

test("web search failures become a degraded outcome instead of throwing", async () => {
  const outcome = await searchWebSafely("latest AI news", async () => {
    throw new Error("upstream unavailable");
  });
  assert.deepEqual(outcome.results, []);
  assert.equal(outcome.degraded, true);
  assert.match(outcome.warning || "", /unavailable/i);
});

test("web search success preserves results without a warning", async () => {
  const results = [{ title: "Result", url: "https://example.com", snippet: "Evidence" }];
  const outcome = await searchWebSafely("query", async () => results);
  assert.deepEqual(outcome.results, results);
  assert.equal(outcome.degraded, false);
  assert.equal(outcome.warning, null);
});

test("both chat routes use degraded web search and still call an AI provider", () => {
  for (const file of ["app/api/ai/chat/route.ts", "app/api/ai/chat/stream/route.ts"]) {
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, /searchWebSafely/u);
    assert.match(source, /buildUnverifiedWebFallbackMessages/u);
  }
});
