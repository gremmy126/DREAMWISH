import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const COUPON_SECRET = "coupon-test-secret-that-is-at-least-32-bytes";

test("the checkout coupon apply endpoint is authenticated, CSRF-guarded, and status-mapped", () => {
  const route = fs.readFileSync("app/api/coupons/apply/route.ts", "utf8");
  assert.match(route, /requireOwnerContext/u);
  assert.match(route, /assertSameOriginMutation/u);
  assert.match(route, /redeemCouponByCode/u);
  assert.match(route, /voidPreparedDiscount/u);
  // 인증 401, CSRF 403, 그 외 400.
  assert.match(route, /status:\s*401/u);
  assert.match(route, /status:\s*403/u);
  assert.match(route, /status:\s*400/u);
  // 금액은 서버에서 재계산(클라이언트 금액 신뢰 금지).
  assert.match(route, /calculateDomesticCouponAmount/u);
  assert.match(route, /export async function DELETE/u);
});

test("the payment method chooser renders the coupon field", () => {
  const upgrade = fs.readFileSync("components/billing/UpgradeButton.tsx", "utf8");
  const field = fs.readFileSync("components/billing/CouponField.tsx", "utf8");
  assert.match(upgrade, /import \{ CouponField \}/u);
  assert.match(upgrade, /<CouponField/u);
  assert.match(field, /\/api\/coupons\/apply/u);
  assert.match(field, /method:\s*"DELETE"/u);
});

test("applying a discount coupon reserves it so checkout can recompute the amount", async () => {
  await withCouponStore(async ({ repository }) => {
    const now = Date.now();
    await repository.createCoupon({
      name: "정률 20%",
      code: "CHECKOUT20",
      type: "percentage_discount",
      value: 20,
      currency: "KRW",
      duration: "once",
      maxRedemptions: 100,
      perUserLimit: 1,
      startsAt: new Date(now - 60_000).toISOString(),
      expiresAt: new Date(now + 86_400_000).toISOString(),
      createdBy: "admin-1"
    });

    // 결제 화면에서 적용 = 예약(reserved) 생성.
    const applied = await repository.redeemCouponByCode({ code: "checkout20", userId: "user-42" });
    assert.equal(applied.coupon.type, "percentage_discount");
    assert.equal(applied.redemption.status, "reserved");

    // 결제 라우트가 읽는 준비된 도메스틱 할인이 존재해야 한다.
    const prepared = await repository.getPreparedDomesticDiscount("user-42");
    assert.ok(prepared, "reserved discount should be visible to the domestic checkout");
    assert.equal(prepared?.coupon.value, 20);

    // 해제하면 준비된 할인이 사라진다.
    await repository.voidPreparedDiscount("user-42");
    assert.equal(await repository.getPreparedDomesticDiscount("user-42"), null);
  });
});

test("the discount preview matches the server-side domestic recalculation", async () => {
  await withCouponStore(async ({ service }) => {
    // percentage 20% of 4900 → 3920
    assert.equal(
      service.calculateDomesticCouponAmount(4_900, { type: "percentage_discount", value: 20, currency: "KRW" }),
      3_920
    );
    // fixed 2000 off 4900 → 2900
    assert.equal(
      service.calculateDomesticCouponAmount(4_900, { type: "fixed_discount", value: 2_000, currency: "KRW" }),
      2_900
    );
  });
});

async function withCouponStore(
  run: (modules: {
    repository: typeof import("../src/lib/coupons/coupon.repository");
    service: typeof import("../src/lib/coupons/coupon.service");
  }) => Promise<void>
) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dreamwish-coupon-checkout-"));
  const original = { ...process.env };
  process.env = { ...original, DATA_DIR: dataDir, COUPON_HASH_SECRET: COUPON_SECRET };
  delete process.env.DATABASE_URL;
  try {
    const repository = require("../src/lib/coupons/coupon.repository") as
      typeof import("../src/lib/coupons/coupon.repository");
    const service = require("../src/lib/coupons/coupon.service") as
      typeof import("../src/lib/coupons/coupon.service");
    await run({ repository, service });
  } finally {
    process.env = original;
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}
