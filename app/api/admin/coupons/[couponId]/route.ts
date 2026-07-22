import { NextResponse } from "next/server";
import { classifyAdminAuthError, requireAdminContext } from "@/src/lib/admin/admin-guard";
import { appendAdminAuditEvent } from "@/src/lib/admin/account-admin.repository";
import { setCouponActive } from "@/src/lib/coupons/coupon.repository";
import { CouponValidationError } from "@/src/lib/coupons/coupon-errors";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

// 인증·권한·CSRF는 401/403, 값 검증 실패는 400, 대상 없음은 404, 그 밖은 500.
function couponItemErrorResponse(error: unknown): NextResponse {
  const authInfo = classifyAdminAuthError(error);
  if (authInfo) {
    return NextResponse.json({ ok: false, code: authInfo.code, error: authInfo.message }, { status: authInfo.status });
  }
  if (error instanceof CouponValidationError) {
    return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: error.status });
  }
  if (error instanceof Error && /not found/iu.test(error.message)) {
    return NextResponse.json({ ok: false, code: "COUPON_NOT_FOUND", error: "쿠폰을 찾을 수 없습니다." }, { status: 404 });
  }
  console.error("[admin/coupons/:id] unexpected error:", error instanceof Error ? error.message : error);
  return NextResponse.json(
    { ok: false, code: "COUPON_INTERNAL_ERROR", error: "쿠폰 처리 중 서버 오류가 발생했습니다." },
    { status: 500 }
  );
}

export async function PATCH(request: Request, context: { params: Promise<{ couponId: string }> }) {
  try {
    assertSameOriginMutation(request);
    const owner = await requireAdminContext(request);
    const { couponId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { active?: boolean };
    if (typeof body.active !== "boolean") {
      throw new CouponValidationError("활성 상태(active)가 필요합니다.");
    }
    const coupon = await setCouponActive(couponId, body.active);
    await appendAdminAuditEvent({
      actorAccountId: owner.uid,
      action: body.active ? "coupon.activate" : "coupon.disable",
      safeMetadata: { couponId, codeHint: coupon.codeHint }
    });
    return NextResponse.json({ ok: true, coupon });
  } catch (error) {
    return couponItemErrorResponse(error);
  }
}

// 쿠폰 삭제는 소프트 삭제(비활성화)로 처리한다. 이미 주문에 사용된 쿠폰의
// 사용 기록·감사 로그를 보존하기 위해 물리 삭제하지 않는다.
export async function DELETE(request: Request, context: { params: Promise<{ couponId: string }> }) {
  try {
    assertSameOriginMutation(request);
    const owner = await requireAdminContext(request);
    const { couponId } = await context.params;
    const coupon = await setCouponActive(couponId, false);
    await appendAdminAuditEvent({
      actorAccountId: owner.uid,
      action: "coupon.disable",
      safeMetadata: { couponId, codeHint: coupon.codeHint, softDeleted: true }
    });
    return NextResponse.json({ ok: true, coupon, softDeleted: true });
  } catch (error) {
    return couponItemErrorResponse(error);
  }
}
