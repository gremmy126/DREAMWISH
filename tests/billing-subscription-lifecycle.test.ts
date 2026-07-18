import assert from "node:assert/strict";
import fs from "node:fs";

test("domestic payment attempts use an explicit fail-closed transition table", () => {
  const { canTransitionPaymentAttempt } = require("../src/lib/billing/payment-attempt.repository") as {
    canTransitionPaymentAttempt: (from: string, to: string, environment: string) => boolean;
  };

  assert.equal(canTransitionPaymentAttempt("created", "pending_provider", "live"), true);
  assert.equal(canTransitionPaymentAttempt("verification_pending", "succeeded", "live"), true);
  assert.equal(canTransitionPaymentAttempt("verification_pending", "test_succeeded", "sandbox"), true);
  assert.equal(canTransitionPaymentAttempt("verification_pending", "succeeded", "sandbox"), false);
  assert.equal(canTransitionPaymentAttempt("succeeded", "failed", "live"), false);
});

test("billing persistence schema enforces idempotency and lease-safe queue claims", () => {
  const schema = fs.readFileSync("src/lib/billing/billing-schema.ts", "utf8");
  const queue = fs.readFileSync("src/lib/billing/billing-charge-queue.repository.ts", "utf8");

  assert.match(schema, /provider, environment, idempotency_key/u);
  assert.match(schema, /billing_webhook_inbox_event_idx/u);
  assert.match(schema, /billing_charge_jobs_due_idx/u);
  assert.match(queue, /FOR UPDATE SKIP LOCKED/u);
  assert.match(queue, /fencing_token/u);
});

test("billing method storage encrypts provider references and exposes only safe metadata", () => {
  const source = fs.readFileSync("src/lib/billing/billing-method.repository.ts", "utf8");
  assert.match(source, /encryptToken/u);
  assert.match(source, /decryptToken/u);
  assert.doesNotMatch(source, /card_number|cvc|passwordTwoDigits/u);
});

test("domestic billing never automatically changes a subscription provider", () => {
  const source = fs.readFileSync("src/lib/billing/billing-worker.ts", "utf8");
  assert.doesNotMatch(source, /fallbackProvider|allowAutomaticCrossProviderRetry/u);
  assert.match(source, /subscription\.provider === "portone_kcp_v1"/u);
});

test("sandbox recurring confirmation revokes the test method without creating a subscription", () => {
  const source = fs.readFileSync("app/api/billing/domestic/billing-method/route.ts", "utf8");
  const sandbox = source.slice(source.indexOf("config.mode === \"sandbox\""));
  assert.match(sandbox, /revokeBillingMethod/u);
  assert.match(sandbox, /revokeBillingReference/u);
  assert.doesNotMatch((sandbox.split("return NextResponse.json")[0] || ""), /createDomesticSubscription/u);
});

test("billing worker has a dedicated Railway process and one-shot mode", () => {
  const railway = fs.readFileSync("railway.billing-worker.toml", "utf8");
  const script = fs.readFileSync("scripts/run-billing-worker.mjs", "utf8");
  assert.match(railway, /billing:worker/u);
  assert.match(script, /--once/u);
  assert.match(script, /SIGTERM/u);
  assert.doesNotMatch(railway, /healthcheckPath/u);
  assert.match(script, /listActiveSubscriptionProviders/u);
  assert.doesNotMatch(script, /\["DATABASE_URL", "PORTONE_V2_STORE_ID", "PORTONE_V2_API_SECRET"\]/u);
});

test("subscription pricing consumes finite coupon months without making a one-time coupon permanent", () => {
  const { buildDomesticSubscriptionPricing } = require("../src/lib/coupons/coupon.service") as {
    buildDomesticSubscriptionPricing: (base: number, coupon: any) => any;
  };
  const once = buildDomesticSubscriptionPricing(10_000, {
    type: "percentage_discount", value: 20, currency: "KRW", duration: "once", durationMonths: null
  });
  const threeMonths = buildDomesticSubscriptionPricing(10_000, {
    type: "fixed_discount", value: 1_000, currency: "KRW", duration: "months", durationMonths: 3
  });
  const forever = buildDomesticSubscriptionPricing(10_000, {
    type: "percentage_discount", value: 10, currency: "KRW", duration: "forever", durationMonths: null
  });

  assert.deepEqual(once, { initialAmount: 8_000, renewalAmount: 10_000, remainingDiscountCycles: 0, discountForever: false });
  assert.deepEqual(threeMonths, { initialAmount: 9_000, renewalAmount: 9_000, remainingDiscountCycles: 2, discountForever: false });
  assert.deepEqual(forever, { initialAmount: 9_000, renewalAmount: 9_000, remainingDiscountCycles: 0, discountForever: true });
});

test("domestic cancellation preserves paid access and cancels only future jobs", () => {
  const route = fs.readFileSync("app/api/billing/domestic/cancel/route.ts", "utf8");
  assert.match(route, /scheduleSubscriptionCancellation/u);
  assert.match(route, /cancelPendingBillingJobs/u);
  assert.match(route, /applyDomesticCancellation/u);
  assert.doesNotMatch(route, /status:\s*"revoked"/u);
});
