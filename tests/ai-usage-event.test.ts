import assert from "node:assert/strict";
import {
  applyUsageSettlement,
  emptyUsageDocument
} from "../src/lib/billing/ai-usage-event.repository";

function settle(doc = emptyUsageDocument(), overrides: Record<string, unknown> = {}) {
  return applyUsageSettlement(doc, {
    requestId: "req-1",
    surface: "chat",
    tierId: "claude-sonnet",
    provider: "claude",
    modelId: "claude-sonnet-5",
    inputTokens: 100,
    outputTokens: 40,
    settledCredits: 140,
    now: "2026-07-23T00:00:00.000Z",
    ...overrides
  });
}

test("settling usage builds the per-tier aggregate from token counts", () => {
  const { doc, duplicate } = settle();
  assert.equal(duplicate, false);
  const aggregate = doc.aggregates["claude-sonnet"];
  assert.deepEqual(aggregate, {
    tierId: "claude-sonnet",
    calls: 1,
    inputTokens: 100,
    outputTokens: 40,
    totalTokens: 140,
    settledCredits: 140,
    lastUsedAt: "2026-07-23T00:00:00.000Z"
  });
});

test("a repeated request id is an idempotent no-op", () => {
  const first = settle();
  const second = applyUsageSettlement(first.doc, {
    requestId: "req-1",
    surface: "chat",
    tierId: "claude-sonnet",
    provider: "claude",
    modelId: "claude-sonnet-5",
    inputTokens: 999,
    outputTokens: 999,
    settledCredits: 1_998,
    now: "2026-07-23T01:00:00.000Z"
  });
  assert.equal(second.duplicate, true);
  assert.equal(second.doc.aggregates["claude-sonnet"]?.calls, 1);
  assert.equal(second.doc.aggregates["claude-sonnet"]?.totalTokens, 140);
});

test("usage aggregates stay separate per tier and accumulate across calls", () => {
  let doc = settle().doc;
  doc = applyUsageSettlement(doc, {
    requestId: "req-2",
    surface: "agent",
    tierId: "claude-sonnet",
    provider: "claude",
    modelId: "claude-sonnet-5",
    inputTokens: 10,
    outputTokens: 5,
    settledCredits: 15,
    now: "2026-07-23T02:00:00.000Z"
  }).doc;
  doc = applyUsageSettlement(doc, {
    requestId: "req-3",
    surface: "chat",
    tierId: "gemini-flash",
    provider: "gemini",
    modelId: "gemini-2.0-flash",
    inputTokens: 7,
    outputTokens: 3,
    settledCredits: 10,
    now: "2026-07-23T03:00:00.000Z"
  }).doc;
  assert.equal(doc.aggregates["claude-sonnet"]?.calls, 2);
  assert.equal(doc.aggregates["claude-sonnet"]?.totalTokens, 155);
  assert.equal(doc.aggregates["gemini-flash"]?.calls, 1);
  assert.equal(doc.aggregates["gemini-flash"]?.totalTokens, 10);
});
