import assert from "node:assert/strict";
import fs from "node:fs";

test("KCP V1 hosted billing-key issuance uses channelKey and customer_uid without deprecated pg", () => {
  const { buildKcpBillingKeyRequest } = require("../src/lib/billing/portone/kcp-v1.adapter") as {
    buildKcpBillingKeyRequest: (input: any) => Record<string, unknown>;
  };
  const request = buildKcpBillingKeyRequest({
    channelKey: "channel-key-test", customerUid: "customerowner1method1",
    merchantUid: "merchant1", buyerEmail: "owner@example.com", redirectUrl: "https://example.com/billing"
  });
  assert.equal(request.channelKey, "channel-key-test");
  assert.equal(request.pay_method, "card");
  assert.equal(request.amount, 0);
  assert.equal(request.customer_uid, "customerowner1method1");
  assert.equal("pg" in request, false);
});

test("KCP V1 server calls use short-lived token auth and re-query every payment", () => {
  const adapter = fs.readFileSync("src/lib/billing/portone/kcp-v1.adapter.ts", "utf8");
  const auth = fs.readFileSync("src/lib/billing/portone/v1-access-token.ts", "utf8");
  assert.match(auth, /\/users\/getToken/u);
  assert.match(auth, /expired_at/u);
  assert.match(adapter, /\/subscribe\/payments\/again/u);
  assert.match(adapter, /\/payments\//u);
  assert.doesNotMatch(adapter, /imp_secret\s*:/u);
});

test("KCP is selected only for explicitly KCP-owned subscriptions", () => {
  const worker = fs.readFileSync("src/lib/billing/billing-worker.ts", "utf8");
  assert.doesNotMatch(worker, /catch[\s\S]{0,500}PortOneKcpV1Adapter/u);
});

test("KCP can be the explicit live provider for a new customer subscription", () => {
  const configRoute = fs.readFileSync("app/api/billing/domestic/config/route.ts", "utf8");
  const methodRoute = fs.readFileSync("app/api/billing/domestic/billing-method/route.ts", "utf8");
  const subscriptionRoute = fs.readFileSync("app/api/billing/domestic/subscription/route.ts", "utf8");
  const dialog = fs.readFileSync("components/billing/DomesticCheckoutDialog.tsx", "utf8");

  assert.match(configRoute, /provider:\s*customerProvider/u);
  assert.match(configRoute, /flow:\s*customerProvider === "portone_kcp_v1" \? "v1" : "v2"/u);
  assert.match(methodRoute, /getDomesticPrimaryProvider/u);
  assert.match(methodRoute, /PortOneKcpV1Adapter/u);
  assert.match(subscriptionRoute, /method\.provider === "portone_kcp_v1"/u);
  assert.match(dialog, /PortOneV1BillingCheckout/u);
});
