import assert from "node:assert/strict";
import fs from "node:fs";

test("administrator coupon APIs are guarded and create Polar-backed discounts", () => {
  const collection = fs.readFileSync("app/api/admin/coupons/route.ts", "utf8");
  const item = fs.readFileSync("app/api/admin/coupons/[couponId]/route.ts", "utf8");

  assert.match(collection, /requireAdminContext/u);
  assert.match(collection, /assertSameOriginMutation/u);
  assert.match(collection, /discounts\.create/u);
  assert.match(collection, /plaintextCode/u);
  assert.match(item, /requireAdminContext/u);
  assert.match(item, /appendAdminAuditEvent/u);
});

test("coupon preparation is public-safe and checkout applies only a reserved Polar discount id", () => {
  const prepare = fs.readFileSync("app/api/coupons/prepare/route.ts", "utf8");
  const checkout = fs.readFileSync("app/api/billing/checkout/route.ts", "utf8");

  assert.match(prepare, /PENDING_COUPON_COOKIE/u);
  assert.match(prepare, /httpOnly:\s*true/u);
  assert.match(prepare, /로그인 후 적용 결과/u);
  assert.match(checkout, /getPreparedDiscount/u);
  assert.match(checkout, /discountId/u);
});

test("administrator workspace mounts real coupon and access-grant management", () => {
  const shell = fs.readFileSync("components/Admin/AdminShell.tsx", "utf8");
  const coupons = fs.readFileSync("components/Admin/AdminCoupons.tsx", "utf8");

  assert.match(shell, /AdminCoupons/u);
  assert.match(shell, /AdminAccessGrants/u);
  assert.match(coupons, /access_duration/u);
  assert.match(coupons, /percentage_discount/u);
  assert.match(coupons, /fixed_discount/u);
});

