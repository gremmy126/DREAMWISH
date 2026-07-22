import assert from "node:assert/strict";
import fs from "node:fs";
import {
  AICreditPurchaseError,
  canTransitionPurchase,
  computePurchaseAmounts
} from "../src/lib/billing/ai-credit-purchase.repository";

test("purchase amounts derive credits and total from the server-owned unit price", () => {
  assert.deepEqual(computePurchaseAmounts(1, 19_900), { credits: 1_000_000, total: 19_900 });
  assert.deepEqual(computePurchaseAmounts(3, 4_900), { credits: 3_000_000, total: 14_700 });
  assert.deepEqual(computePurchaseAmounts(100, 39_900), { credits: 100_000_000, total: 3_990_000 });
});

test("purchase quantity must be an integer within 1..100", () => {
  for (const bad of [0, 101, -1, 1.5, Number.NaN]) {
    assert.throws(
      () => computePurchaseAmounts(bad, 4_900),
      (error: unknown) =>
        error instanceof AICreditPurchaseError && error.code === "AI_CREDIT_QUANTITY_INVALID",
      `quantity ${bad} should be rejected`
    );
  }
});

test("a non-positive or unsafe unit price is rejected", () => {
  assert.throws(
    () => computePurchaseAmounts(1, 0),
    (error: unknown) => error instanceof AICreditPurchaseError && error.code === "AI_CREDIT_PRICE_INVALID"
  );
  // A price that individually is a safe integer but overflows once multiplied
  // by the quantity must be rejected rather than silently losing precision.
  assert.throws(
    () => computePurchaseAmounts(2, Number.MAX_SAFE_INTEGER),
    (error: unknown) => error instanceof AICreditPurchaseError && error.code === "AI_CREDIT_AMOUNT_UNSAFE"
  );
});

test("purchase status transitions only follow the pending -> paid -> credited path", () => {
  assert.equal(canTransitionPurchase("pending", "paid"), true);
  assert.equal(canTransitionPurchase("paid", "credited"), true);
  assert.equal(canTransitionPurchase("pending", "credited"), false);
  assert.equal(canTransitionPurchase("credited", "paid"), false);
  assert.equal(canTransitionPurchase("refunded", "credited"), false);
});

test("purchases persist through the owner-scoped document store, never deleted", () => {
  const source = fs.readFileSync("src/lib/billing/ai-credit-purchase.repository.ts", "utf8");
  assert.match(source, /mutateOwnerDocument/u);
  assert.match(source, /ai\.credit\.purchases\.v1/u);
  assert.doesNotMatch(source, /DELETE FROM|TRUNCATE/u);
});
