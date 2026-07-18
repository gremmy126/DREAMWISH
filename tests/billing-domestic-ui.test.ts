import assert from "node:assert/strict";
import fs from "node:fs";

test("domestic checkout dialog labels test payments and provides accessible dismissal", () => {
  const dialog = fs.readFileSync("components/billing/DomesticCheckoutDialog.tsx", "utf8");
  assert.match(dialog, /테스트 결제/u);
  assert.match(dialog, /실제 청구 및 구독 활성화 없음/u);
  assert.match(dialog, /Escape/u);
  assert.match(dialog, /min-h-\[44px\]/u);
  assert.match(dialog, /aria-modal/u);
});

test("PortOne browser checkout uses the official SDK and verifies only server attempt identifiers", () => {
  const checkout = fs.readFileSync("components/billing/PortOneV2Checkout.tsx", "utf8");
  assert.match(checkout, /@portone\/browser-sdk/u);
  assert.match(checkout, /requestPayment/u);
  assert.match(checkout, /attemptId/u);
  assert.doesNotMatch(checkout, /cardNumber|cvc|expiry|birth|passwordTwoDigits/u);
});

test("customer subscription settings keep Polar portal but cancel domestic subscriptions locally", () => {
  const source = fs.readFileSync("components/billing/SubscriptionSettingsCard.tsx", "utf8");
  assert.match(source, /entitlement\.provider/u);
  assert.match(source, /\/api\/billing\/domestic\/cancel/u);
  assert.match(source, /provider === "polar"/u);
});

test("admin billing panel exposes safe readiness and both domestic recurring test paths", () => {
  const source = fs.readFileSync("components/Admin/AdminBillingPanel.tsx", "utf8");
  assert.match(source, /missingVariables/u);
  assert.match(source, /KPN/u);
  assert.match(source, /NHN KCP/u);
  assert.match(source, /PortOneV1BillingCheckout/u);
  assert.doesNotMatch(source, /process\.env/u);
});

test("admin provider selection route never returns environment values", () => {
  const source = fs.readFileSync("app/api/admin/billing/providers/route.ts", "utf8");
  assert.match(source, /requireAdminContext/u);
  assert.match(source, /missingVariables/u);
  assert.doesNotMatch(source, /config\.values/u);
});

test("administrator billing supports idempotent live refunds with exact confirmation", () => {
  const route = fs.readFileSync("app/api/admin/billing/refunds/route.ts", "utf8");
  const panel = fs.readFileSync("components/Admin/AdminBillingPanel.tsx", "utf8");
  const schema = fs.readFileSync("src/lib/billing/billing-schema.ts", "utf8");

  assert.match(route, /requireAdminContext/u);
  assert.match(route, /assertSameOriginMutation/u);
  assert.match(route, /REFUND /u);
  assert.match(route, /beginBillingRefund/u);
  assert.match(panel, /환불/u);
  assert.match(panel, /providerPaymentId/u);
  assert.match(schema, /billing_refund_requests/u);
});

test("system diagnostics include safe domestic billing and billing worker health", () => {
  const route = fs.readFileSync("app/api/admin/system/status/route.ts", "utf8");
  assert.match(route, /getBillingWorkerHealth/u);
  assert.match(route, /Domestic Billing/u);
  assert.match(route, /Billing Worker/u);
  assert.doesNotMatch(route, /values:\s*config\.values/u);
});
