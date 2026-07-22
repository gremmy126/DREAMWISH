import assert from "node:assert/strict";
import fs from "node:fs";
import { evaluateAiCreditRefund } from "../src/lib/billing/ai-credit-refund";

function purchase(overrides: Record<string, unknown> = {}) {
  return {
    status: "credited" as const,
    environment: "live" as const,
    providerPaymentId: "pay_123",
    creditsGranted: 1_000_000,
    ...overrides
  };
}

function bal(available: number, reserved = 0, consumed = 0) {
  return { available, reserved, consumed };
}

test("a fully unspent live purchase is eligible for an automatic full refund", () => {
  const result = evaluateAiCreditRefund(purchase(), bal(1_000_000));
  assert.deepEqual(result, { eligible: true, requiresReview: false, reason: "" });
});

test("any consumed or missing credits force administrator review, not an auto refund", () => {
  const consumed = evaluateAiCreditRefund(purchase(), bal(999_000, 0, 1_000));
  assert.equal(consumed.eligible, false);
  assert.equal(consumed.requiresReview, true);

  const partial = evaluateAiCreditRefund(purchase(), bal(500_000));
  assert.equal(partial.eligible, false);
  assert.equal(partial.requiresReview, true);

  const reserved = evaluateAiCreditRefund(purchase(), bal(999_000, 1_000, 0));
  assert.equal(reserved.eligible, false);
  assert.equal(reserved.requiresReview, true);
});

test("non-credited, sandbox, and already-refunded purchases are not auto-refundable without review", () => {
  for (const p of [
    purchase({ status: "pending" }),
    purchase({ environment: "sandbox" }),
    purchase({ providerPaymentId: null }),
    purchase({ status: "refunded" })
  ]) {
    const result = evaluateAiCreditRefund(p, bal(1_000_000));
    assert.equal(result.eligible, false);
    assert.equal(result.requiresReview, false);
  }
});

test("the refund route reverses credits only after the provider refund and stays idempotent", () => {
  const source = fs.readFileSync("app/api/billing/domestic/ai-credits/refund/route.ts", "utf8");
  // Gated on the eligibility rule.
  assert.match(source, /evaluateAiCreditRefund/u);
  // Money-first: the credit reversal must come after completeBillingRefund.
  const providerIndex = source.indexOf("completeBillingRefund");
  const holdIndex = source.indexOf("reverseCreditsAndFinalize");
  assert.ok(providerIndex > -1 && holdIndex > providerIndex, "credits must be reversed after the provider refund");
  // Idempotent credit reversal + provider-failure rollback.
  assert.match(source, /idempotencyKey:\s*`refund:\$\{purchaseId\}`/u);
  assert.match(source, /failBillingRefund/u);
  assert.match(source, /restorePurchaseFromRefund/u);
});
