import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AdminAccessError, classifyAdminAuthError } from "../src/lib/admin/admin-guard";
import { OwnerContextError } from "../src/lib/auth/owner-context";
import { CsrfValidationError } from "../src/lib/security/csrf";
import { CouponConflictError, CouponValidationError } from "../src/lib/coupons/coupon-errors";

const COUPON_SECRET = "coupon-test-secret-that-is-at-least-32-bytes";

test("admin auth errors map to precise status codes, not a blanket 400/403", () => {
  assert.deepEqual(classifyAdminAuthError(new OwnerContextError()), {
    status: 401,
    code: "AUTH_REQUIRED",
    message: "로그인이 필요합니다."
  });
  assert.equal(classifyAdminAuthError(new AdminAccessError())?.status, 403);
  assert.equal(classifyAdminAuthError(new CsrfValidationError())?.status, 403);
  // 값 검증 실패는 인증 오류가 아니므로 여기서 걸러지지 않는다(→ 400/409로).
  assert.equal(classifyAdminAuthError(new CouponValidationError("bad")), null);
  assert.equal(classifyAdminAuthError(new Error("boom")), null);
});

test("coupon domain errors expose their own status code", () => {
  assert.equal(new CouponValidationError("x").status, 400);
  assert.equal(new CouponConflictError().status, 409);
  assert.equal(new CouponValidationError("x").code, "COUPON_VALIDATION_FAILED");
  assert.equal(new CouponConflictError().code, "COUPON_CODE_DUPLICATE");
});

test("percentage coupon validation fails with 400, never 403", async () => {
  await withCouponStore(async (repository) => {
    await assert.rejects(
      () =>
        repository.createCoupon({
          name: "정률 할인",
          code: "PCT150",
          type: "percentage_discount",
          value: 150, // 100% 초과 → 검증 실패
          currency: "KRW",
          duration: "once",
          maxRedemptions: 10,
          perUserLimit: 1,
          startsAt: new Date(Date.now() - 60_000).toISOString(),
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          createdBy: "admin-1"
        }),
      (error: unknown) => error instanceof CouponValidationError && error.status === 400
    );
  });
});

test("a duplicate coupon code is a 409 conflict, not a generic failure", async () => {
  await withCouponStore(async (repository) => {
    const base = {
      name: "정액 할인",
      type: "fixed_discount" as const,
      value: 5_000,
      currency: "KRW",
      duration: "once" as const,
      maxRedemptions: 10,
      perUserLimit: 1,
      startsAt: new Date(Date.now() - 60_000).toISOString(),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      createdBy: "admin-1"
    };
    await repository.createCoupon({ ...base, code: "SAVE5000" });
    await assert.rejects(
      () => repository.createCoupon({ ...base, code: "save5000" }),
      (error: unknown) => error instanceof CouponConflictError && error.status === 409
    );
  });
});

test("the coupon routes wire status codes, soft delete, and best-effort Polar", () => {
  const collection = fs.readFileSync("app/api/admin/coupons/route.ts", "utf8");
  const item = fs.readFileSync("app/api/admin/coupons/[couponId]/route.ts", "utf8");

  // 인증/권한 오류는 도메인 처리 전에 분류되어 401/403으로 나간다.
  assert.match(collection, /classifyAdminAuthError/u);
  assert.match(collection, /status:\s*500/u);
  // Polar 실패를 흡수(best-effort)해 로컬 쿠폰은 발급된다.
  assert.match(collection, /createPolarDiscount/u);
  assert.match(collection, /polarWarnings/u);
  // 삭제는 소프트 삭제(비활성화)로 처리, 인증/권한은 try 안에서 매핑.
  assert.match(item, /export async function DELETE/u);
  assert.match(item, /softDeleted/u);
  assert.match(item, /classifyAdminAuthError/u);
  assert.match(item, /COUPON_NOT_FOUND/u);
});

async function withCouponStore(
  run: (repository: typeof import("../src/lib/coupons/coupon.repository")) => Promise<void>
) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dreamwish-coupon-status-"));
  const original = { ...process.env };
  process.env = { ...original, DATA_DIR: dataDir, DATABASE_URL: undefined, COUPON_HASH_SECRET: COUPON_SECRET };
  delete process.env.DATABASE_URL;
  try {
    const repository = require("../src/lib/coupons/coupon.repository") as
      typeof import("../src/lib/coupons/coupon.repository");
    await run(repository);
  } finally {
    process.env = original;
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}
