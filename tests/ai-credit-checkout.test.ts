import assert from "node:assert/strict";
import fs from "node:fs";

const checkout = fs.readFileSync("app/api/billing/domestic/ai-credits/checkout/route.ts", "utf8");
const verify = fs.readFileSync("app/api/billing/domestic/ai-credits/verify/route.ts", "utf8");

test("checkout computes the amount server-side and never trusts a client price", () => {
  // Server owns the price and total; the client only sends tierId + quantity.
  assert.match(checkout, /resolveTierPriceKrw/u);
  assert.match(checkout, /computePurchaseAmounts/u);
  assert.doesNotMatch(checkout, /body\.(amount|price|total|unitPrice|provider|modelId)/u);
});

test("checkout rejects an unconfigured tier and requires the KPN general channel", () => {
  assert.match(checkout, /AI_TIER_NOT_CONFIGURED/u);
  assert.match(checkout, /requireBillingCapability\(config,\s*"kpnGeneral"\)/u);
  assert.match(checkout, /assertSameOriginMutation/u);
});

test("verify credits the ledger exactly once via a purchase-scoped idempotency key", () => {
  assert.match(verify, /verifyDomesticPayment/u);
  assert.match(verify, /idempotencyKey:\s*`purchase:\$\{purchase\.id\}`/u);
  // An already-credited purchase short-circuits without re-crediting.
  assert.match(verify, /purchase\.status === "credited"/u);
});

test("sandbox verification never mints live credits", () => {
  // The creditPurchase call must be guarded by a live-environment check.
  assert.match(verify, /purchase\.environment !== "live"/u);
  const creditCallIndex = verify.indexOf("await creditPurchase");
  const sandboxGuardIndex = verify.indexOf('if (purchase.environment !== "live")');
  assert.ok(
    creditCallIndex > -1 && sandboxGuardIndex > -1 && sandboxGuardIndex < creditCallIndex,
    "the sandbox guard must return before the ledger credit call"
  );
});
