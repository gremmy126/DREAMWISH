import assert from "node:assert/strict";
import fs from "node:fs";
import {
  DEFAULT_DOMESTIC_MONTHLY_AMOUNT_KRW,
  getDomesticMonthlyAmountKrw
} from "../src/lib/billing/billing-config";

function withEnv(value: string | undefined, run: () => void) {
  const original = process.env.BILLING_DOMESTIC_MONTHLY_AMOUNT_KRW;
  try {
    if (value === undefined) delete process.env.BILLING_DOMESTIC_MONTHLY_AMOUNT_KRW;
    else process.env.BILLING_DOMESTIC_MONTHLY_AMOUNT_KRW = value;
    run();
  } finally {
    if (original === undefined) delete process.env.BILLING_DOMESTIC_MONTHLY_AMOUNT_KRW;
    else process.env.BILLING_DOMESTIC_MONTHLY_AMOUNT_KRW = original;
  }
}

test("the default monthly subscription price is KRW 5,000", () => {
  assert.equal(DEFAULT_DOMESTIC_MONTHLY_AMOUNT_KRW, 5_000);
  withEnv(undefined, () => {
    assert.equal(getDomesticMonthlyAmountKrw(), 5_000);
  });
});

test("BILLING_DOMESTIC_MONTHLY_AMOUNT_KRW overrides the default", () => {
  withEnv("9900", () => {
    assert.equal(getDomesticMonthlyAmountKrw(), 9_900);
  });
});

test("an invalid monthly amount is rejected rather than silently used", () => {
  withEnv("50", () => {
    assert.throws(() => getDomesticMonthlyAmountKrw(), /invalid/u);
  });
  withEnv("not-a-number", () => {
    assert.throws(() => getDomesticMonthlyAmountKrw(), /invalid/u);
  });
});

test("the subscription and billing-method routes resolve the price from the single source", () => {
  for (const file of [
    "app/api/billing/domestic/subscription/route.ts",
    "app/api/billing/domestic/billing-method/route.ts",
    "app/api/coupons/apply/route.ts"
  ]) {
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, /getDomesticMonthlyAmountKrw/u, `${file} should use the single price source`);
    // No route should hardcode the old KRW 15,000 default anymore.
    assert.doesNotMatch(source, /\b15000\b/u, `${file} still hardcodes 15000`);
  }
});
