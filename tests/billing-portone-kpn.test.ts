import assert from "node:assert/strict";

test("KPN V2 verification rejects amount, currency, store, channel environment, and payment mismatches", () => {
  const { verifyKpnPaymentRecord } = require("../src/lib/billing/portone/kpn-v2.adapter") as {
    verifyKpnPaymentRecord: (payment: any, expected: any) => any;
  };
  const payment = {
    status: "PAID", id: "payment1", storeId: "store1", paidAt: "2026-07-18T00:00:00.000Z",
    amount: { total: 1000 }, currency: "KRW", channel: { type: "TEST" }
  };
  const expected = {
    paymentId: "payment1", storeId: "store1", amount: 1000, currency: "KRW", environment: "sandbox"
  };

  assert.equal(verifyKpnPaymentRecord(payment, expected).providerPaymentId, "payment1");
  for (const changed of [
    { amount: { total: 999 } }, { currency: "USD" }, { storeId: "other" },
    { channel: { type: "LIVE" } }, { id: "other" }, { status: "FAILED" }
  ]) {
    assert.throws(() => verifyKpnPaymentRecord({ ...payment, ...changed }, expected));
  }
});

test("KPN V2 billing charge is server-owned and contains no direct card credential fields", () => {
  const { buildKpnBillingChargeRequest } = require("../src/lib/billing/portone/kpn-v2.adapter") as {
    buildKpnBillingChargeRequest: (input: any) => Record<string, unknown>;
  };
  const request = buildKpnBillingChargeRequest({
    paymentId: "payment1", storeId: "store1", channelKey: "channel1", billingKey: "provider-reference",
    orderName: "DREAMWISH 월간 구독", amount: 4900, ownerId: "owner1"
  });
  const serialized = JSON.stringify(request);

  assert.equal(request.currency, "KRW");
  assert.equal((request.amount as { total: number }).total, 4900);
  assert.doesNotMatch(serialized, /cardNumber|expiry|birth|cvc|passwordTwoDigits/u);
});

