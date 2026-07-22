import assert from "node:assert/strict";
import fs from "node:fs";
import {
  MAX_PROVIDER_PAYMENT_ID_LENGTH,
  compactProviderPaymentId,
  createProviderPaymentId,
  isValidProviderPaymentId
} from "../src/lib/billing/payment-id";

// 한국결제네트웍스(KPN)는 가맹점 주문번호(MxIssueNO)를 32바이트로 제한한다.
// 초과 시 9104로 결제가 실패했다.
test("generated payment IDs never exceed the 32-byte PG limit", () => {
  assert.equal(MAX_PROVIDER_PAYMENT_ID_LENGTH, 32);
  for (const prefix of ["dwtest", "dwsub", "dwsubtst", "dwbmtest", "verylongprefixover8"]) {
    for (let i = 0; i < 50; i += 1) {
      const id = createProviderPaymentId(prefix);
      assert.ok(Buffer.byteLength(id, "utf8") <= 32, `${id} exceeds 32 bytes`);
      assert.match(id, /^[A-Za-z0-9]+$/u);
      assert.ok(isValidProviderPaymentId(id));
    }
  }
});

test("generated payment IDs are unique enough for concurrent charges", () => {
  const ids = new Set(Array.from({ length: 500 }, () => createProviderPaymentId("dwsub")));
  assert.equal(ids.size, 500);
});

test("compactProviderPaymentId trims oversized legacy IDs to the limit", () => {
  const long = `dw${"a".repeat(60)}`;
  assert.equal(compactProviderPaymentId(long).length, 32);
  assert.equal(compactProviderPaymentId("dw-123_456").length, 8); // 비영숫자 제거
  assert.ok(isValidProviderPaymentId(compactProviderPaymentId(long)));
});

test("the old over-32-byte payment IDs are gone from the domestic billing routes", () => {
  const checkout = fs.readFileSync("app/api/billing/domestic/checkout/route.ts", "utf8");
  const method = fs.readFileSync("app/api/billing/domestic/billing-method/route.ts", "utf8");
  const subscription = fs.readFileSync("app/api/billing/domestic/subscription/route.ts", "utf8");
  const worker = fs.readFileSync("src/lib/billing/billing-worker.ts", "utf8");

  for (const source of [checkout, method, subscription]) {
    assert.match(source, /createProviderPaymentId/u);
  }
  // 옛 길이 초과 패턴이 남아 있지 않아야 한다.
  assert.doesNotMatch(checkout, /`dwtest\$\{nonce\}`/u);
  assert.doesNotMatch(method, /dwsubtest\$\{randomBytes/u);
  assert.doesNotMatch(subscription, /dwsub\$\{randomBytes/u);
  assert.match(worker, /compactProviderPaymentId/u);
  assert.doesNotMatch(worker, /slice\(0,\s*40\)/u);
});

test("the KPN adapter rejects payment IDs longer than the 32-byte limit before calling the PG", () => {
  const adapter = fs.readFileSync("src/lib/billing/portone/kpn-v2.adapter.ts", "utf8");
  assert.match(adapter, /MAX_PROVIDER_PAYMENT_ID_LENGTH/u);
  assert.match(adapter, /Buffer\.byteLength/u);
});
