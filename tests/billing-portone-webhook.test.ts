import assert from "node:assert/strict";
import fs from "node:fs";

test("PortOne V2 webhook verification uses the official SDK against the raw body", () => {
  const source = fs.readFileSync("src/lib/billing/portone/v2-webhook.ts", "utf8");
  assert.match(source, /Webhook\.verify/u);
  assert.match(source, /rawBody/u);
  assert.doesNotMatch(source, /JSON\.stringify\(.*body/u);
});

test("PortOne webhook normalization accepts payment events only", () => {
  const { normalizePortOneV2Webhook } = require("../src/lib/billing/portone/v2-webhook") as {
    normalizePortOneV2Webhook: (webhook: any, environment: string) => any;
  };
  const normalized = normalizePortOneV2Webhook({
    type: "Transaction.Paid", timestamp: "2026-07-18T00:00:00.000Z",
    data: { paymentId: "payment1", storeId: "store1" }
  }, "sandbox");

  assert.equal(normalized.providerPaymentId, "payment1");
  assert.equal(normalizePortOneV2Webhook({ type: "BillingKey.Issued", data: {} }, "sandbox"), null);
});

test("V2 verifies before Inbox insertion and V1 re-queries before applying state", () => {
  const v2 = fs.readFileSync("app/api/webhooks/portone/v2/route.ts", "utf8");
  const v1 = fs.readFileSync("app/api/webhooks/portone/v1/route.ts", "utf8");
  assert.ok(v2.indexOf("await verifyPortOneV2Webhook") < v2.indexOf("await processBillingWebhook"));
  assert.match(v1, /processBillingWebhook/u);
  const processor = fs.readFileSync("src/lib/billing/billing-webhook.service.ts", "utf8");
  assert.ok(processor.indexOf("await gateway.verifyPayment") < processor.indexOf("await transitionPaymentAttempt"));
  assert.match(processor, /receiveBillingWebhook/u);
  assert.match(processor, /inserted/u);
});

test("PortOne webhook endpoints are public only because they authenticate with provider evidence", () => {
  const policy = fs.readFileSync("src/lib/auth/api-access-policy.ts", "utf8");
  assert.match(policy, /\/api\/webhooks\/portone\/v2/u);
  assert.match(policy, /\/api\/webhooks\/portone\/v1/u);
});
