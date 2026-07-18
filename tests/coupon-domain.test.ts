import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const COUPON_SECRET = "coupon-test-secret-that-is-at-least-32-bytes";

test("coupon codes normalize and hash without retaining plaintext", () => {
  const { normalizeCouponCode, hashCouponCode } = require("../src/lib/coupons/coupon-code") as
    typeof import("../src/lib/coupons/coupon-code");

  assert.equal(normalizeCouponCode(" welcome-30 "), "WELCOME-30");
  const hashed = hashCouponCode("WELCOME-30", COUPON_SECRET);
  assert.notEqual(hashed, "WELCOME-30");
  assert.equal(hashed.length, 64);
  assert.equal(hashCouponCode(" welcome-30 ", COUPON_SECRET), hashed);
});

test("access-duration coupons redeem once into a durable active grant", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dreamwish-coupon-"));
  try {
    await withEnv({ DATA_DIR: dataDir, DATABASE_URL: undefined, COUPON_HASH_SECRET: COUPON_SECRET }, async () => {
      const repository = require("../src/lib/coupons/coupon.repository") as
        typeof import("../src/lib/coupons/coupon.repository");
      const coupon = await repository.createCoupon({
        name: "30일 이용권",
        code: "WELCOME30",
        type: "access_duration",
        accessDays: 30,
        maxRedemptions: 10,
        perUserLimit: 1,
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        duration: "once",
        createdBy: "admin-1"
      });

      assert.equal(coupon.codeHint, "WEL…E30");
      assert.equal("code" in coupon, false);
      const redemption = await repository.redeemCouponByCode({
        code: "welcome30",
        userId: "user-1"
      });
      assert.equal(redemption.coupon.type, "access_duration");
      assert.equal(redemption.accessGrant?.userId, "user-1");
      assert.equal((await repository.getActiveAccessGrant("user-1"))?.status, "active");
      await assert.rejects(
        () => repository.redeemCouponByCode({ code: "WELCOME30", userId: "user-1" }),
        /already used/u
      );
    });
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("effective entitlement accepts administrators, billing, or active grants", () => {
  const { isAccessGrantActive, resolveEffectiveEntitlement } = require("../src/lib/billing/effective-entitlement") as
    typeof import("../src/lib/billing/effective-entitlement");
  const now = new Date("2026-07-17T00:00:00.000Z");
  const activeGrant = {
    id: "grant-1",
    userId: "user-1",
    source: "coupon" as const,
    couponId: "coupon-1",
    startsAt: "2026-07-16T00:00:00.000Z",
    endsAt: "2026-07-18T00:00:00.000Z",
    status: "active" as const,
    createdAt: "2026-07-16T00:00:00.000Z",
    revokedAt: null
  };

  assert.equal(isAccessGrantActive(activeGrant, now), true);
  assert.equal(resolveEffectiveEntitlement({ role: "user", billingActive: false, grant: activeGrant, now }), true);
  assert.equal(resolveEffectiveEntitlement({ role: "admin", billingActive: false, grant: null, now }), true);
  assert.equal(resolveEffectiveEntitlement({ role: "user", billingActive: true, grant: null, now }), true);
  assert.equal(resolveEffectiveEntitlement({ role: "user", billingActive: false, grant: { ...activeGrant, endsAt: "2026-07-16T00:00:00.000Z" }, now }), false);
});

test("domestic coupon amounts are server-calculated and never reduce a charge below one won", () => {
  const { calculateDomesticCouponAmount } = require("../src/lib/coupons/coupon.service") as {
    calculateDomesticCouponAmount: (base: number, coupon: { type: string; value: number | null; currency: string | null } | null) => number;
  };
  assert.equal(calculateDomesticCouponAmount(10_000, { type: "percentage_discount", value: 25, currency: null }), 7_500);
  assert.equal(calculateDomesticCouponAmount(10_000, { type: "fixed_discount", value: 3_000, currency: "KRW" }), 7_000);
  assert.equal(calculateDomesticCouponAmount(1_000, { type: "fixed_discount", value: 5_000, currency: "KRW" }), 1);
  assert.equal(calculateDomesticCouponAmount(10_000, { type: "fixed_discount", value: 3_000, currency: "USD" }), 10_000);
});

async function withEnv(values: Record<string, string | undefined>, run: () => void | Promise<void>) {
  const original = { ...process.env };
  process.env = { ...original };
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try { await run(); } finally { process.env = original; }
}
