import { NextResponse } from "next/server";
import { requireAdminContext } from "@/src/lib/admin/admin-guard";
import { appendAdminAuditEvent } from "@/src/lib/admin/account-admin.repository";
import { setCouponActive } from "@/src/lib/coupons/coupon.repository";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

export async function PATCH(request: Request, context: { params: Promise<{ couponId: string }> }) {
  assertSameOriginMutation(request);
  const owner = await requireAdminContext(request);
  const { couponId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { active?: boolean };
  if (typeof body.active !== "boolean") return NextResponse.json({ ok: false, error: "활성 상태가 필요합니다." }, { status: 400 });
  const coupon = await setCouponActive(couponId, body.active);
  await appendAdminAuditEvent({ actorAccountId: owner.uid, action: body.active ? "coupon.activate" : "coupon.disable", safeMetadata: { couponId, codeHint: coupon.codeHint } });
  return NextResponse.json({ ok: true, coupon });
}

