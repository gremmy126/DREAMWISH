import assert from "node:assert/strict";
import type { AIChatOptions, AIMessage } from "../src/lib/ai/ai-provider";
import { normalizeUsage } from "../src/lib/ai/ai-provider";
import {
  AICreditMeteringError,
  estimateInputTokens,
  estimateReservation,
  runMeteredCompletion
} from "../src/lib/billing/ai-credit-metering";
import { AICreditError } from "../src/lib/billing/ai-credit-ledger";

const CONFIGURED_TIER = {
  id: "claude-sonnet" as const,
  provider: "claude" as const,
  modelId: "claude-sonnet-5",
  label: "Claude Sonnet급",
  useCase: "코딩",
  priceKrwPerMillion: 19_900,
  configured: true
};

function balance(available: number) {
  return { available, reserved: 0, consumed: 0 };
}

type Call = { name: string; args: Record<string, unknown> };

function harness(overrides: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const deps = {
    resolveTier: () => CONFIGURED_TIER,
    createProvider: () => ({
      name: "claude",
      model: "claude-sonnet-5",
      chatWithUsage: async (_messages: AIMessage[], options?: AIChatOptions) => {
        calls.push({ name: "provider", args: { model: options?.model } });
        return {
          content: "hello",
          provider: "claude",
          model: options?.model || "claude-sonnet-5",
          usage: { inputTokens: 100, outputTokens: 40, totalTokens: 140 }
        };
      }
    }),
    reserve: async (_owner: string, input: Record<string, unknown>) => {
      calls.push({ name: "reserve", args: input });
      return { balance: balance(860), duplicate: false };
    },
    settle: async (_owner: string, input: Record<string, unknown>) => {
      calls.push({ name: "settle", args: input });
      return { balance: { available: 860, reserved: 0, consumed: 140 }, duplicate: false };
    },
    release: async (_owner: string, input: Record<string, unknown>) => {
      calls.push({ name: "release", args: input });
      return { balance: balance(1_000), duplicate: false };
    },
    recordUsage: async () => ({ duplicate: false }),
    ...overrides
  };
  return { calls, deps };
}

test("normalizeUsage validates and totals, or fails closed on bad input", () => {
  assert.deepEqual(normalizeUsage(100, 40), { inputTokens: 100, outputTokens: 40, totalTokens: 140 });
  assert.equal(normalizeUsage(undefined, 40), null);
  assert.equal(normalizeUsage(10, -1), null);
  assert.equal(normalizeUsage(Number.NaN, 5), null);
});

test("reservation estimate is conservative and never below the floor", () => {
  const messages = [{ role: "user" as const, content: "x".repeat(300) }];
  assert.ok(estimateInputTokens(messages) >= 100);
  assert.ok(estimateReservation(messages, 500) > estimateInputTokens(messages));
  assert.ok(estimateReservation([{ role: "user", content: "" }], 0) >= 16);
});

test("a metered call reserves, calls the tier model, and settles authoritative usage", async () => {
  const { calls, deps } = harness();
  const result = await runMeteredCompletion(
    { ownerId: "o1", tierId: "claude-sonnet", surface: "agent", messages: [{ role: "user", content: "hi" }], maxOutputTokens: 500 },
    deps
  );
  assert.equal(result.content, "hello");
  assert.equal(result.settledCredits, 140);
  const names = calls.map((call) => call.name);
  assert.deepEqual(names, ["reserve", "provider", "settle"]);
  assert.equal((calls.find((c) => c.name === "provider")!.args as { model: string }).model, "claude-sonnet-5");
  assert.equal((calls.find((c) => c.name === "settle")!.args as { usage: number }).usage, 140);
  assert.ok(!names.includes("release"));
});

test("an unconfigured tier is rejected before any reservation", async () => {
  const { calls, deps } = harness({ resolveTier: () => ({ ...CONFIGURED_TIER, configured: false }) });
  await assert.rejects(
    runMeteredCompletion({ ownerId: "o1", tierId: "claude-sonnet", surface: "agent", messages: [] }, deps),
    (error: unknown) => error instanceof AICreditMeteringError && error.code === "AI_TIER_NOT_CONFIGURED"
  );
  assert.equal(calls.length, 0);
});

test("a provider failure releases the whole reservation and never settles", async () => {
  const { calls, deps } = harness({
    createProvider: () => ({
      name: "claude",
      model: "claude-sonnet-5",
      chatWithUsage: async () => {
        throw new Error("provider down");
      }
    })
  });
  await assert.rejects(
    runMeteredCompletion({ ownerId: "o1", tierId: "claude-sonnet", surface: "agent", messages: [{ role: "user", content: "hi" }] }, deps),
    (error: unknown) => error instanceof AICreditMeteringError && error.code === "AI_PROVIDER_FAILED"
  );
  const names = calls.map((call) => call.name);
  assert.ok(names.includes("reserve"));
  assert.ok(names.includes("release"));
  assert.ok(!names.includes("settle"));
});

test("insufficient balance propagates and never reaches the provider", async () => {
  const { calls, deps } = harness({
    reserve: async () => {
      throw new AICreditError("AI_CREDIT_INSUFFICIENT", "부족");
    }
  });
  await assert.rejects(
    runMeteredCompletion({ ownerId: "o1", tierId: "claude-sonnet", surface: "agent", messages: [{ role: "user", content: "hi" }] }, deps),
    (error: unknown) => error instanceof AICreditError && error.code === "AI_CREDIT_INSUFFICIENT"
  );
  assert.ok(!calls.some((call) => call.name === "provider"));
  assert.ok(!calls.some((call) => call.name === "release"));
});
