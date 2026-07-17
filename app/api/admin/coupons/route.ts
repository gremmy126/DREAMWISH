import { NextResponse } from "next/server";
import { requireAdminContext } from "@/src/lib/admin/admin-guard";
import { appendAdminAuditEvent } from "@/src/lib/admin/account-admin.repository";
import { generateCouponCode, assertCouponCode } from "@/src/lib/coupons/coupon-code";
import { createCoupon, listCoupons } from "@/src/lib/coupons/coupon.repository";
import type { CouponCreateInput, CouponDuration, CouponType } from "@/src/lib/coupons/coupon.types";
import { getPolarClient, getPolarProductId } from "@/src/lib/billing/polar";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

const TYPES = new Set<CouponType>(["access_duration", "percentage_discount", "fixed_discount"]);
const DURATIONS = new Set<CouponDuration>(["once", "months", "forever"]);

export async function GET(request: Request) {
  await requireAdminContext(request);
  return NextResponse.json({ ok: true, coupons: await listCoupons() });
}

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const owner = await requireAdminContext(request);
    const body = (await request.json().catch(() => ({}))) as Partial<CouponCreateInput>;
    if (!TYPES.has(body.type as CouponType) || !DURATIONS.has(body.duration as CouponDuration)) {
      return NextResponse.json({ ok: false, error: "쿠폰 종류와 적용 기간을 확인해 주세요." }, { status: 400 });
    }
    const type = body.type as CouponType;
    const plaintextCode = assertCouponCode(body.code || generateCouponCode(type === "access_duration" ? "PASS" : "SALE"));
    let polarDiscountId: string | null = null;
    if (type !== "access_duration") {
      if (!/^[A-Z0-9]{3,64}$/u.test(plaintextCode)) {
        return NextResponse.json({ ok: false, error: "할인 쿠폰 코드는 영문 대문자와 숫자만 사용할 수 있습니다." }, { status: 400 });
      }
      const duration = body.duration === "months" ? "repeating" : body.duration;
      const common = {
        name: String(body.name || "DREAMWISH 할인"),
        code: plaintextCode,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.expiresAt ? new Date(body.expiresAt) : null,
        maxRedemptions: Number(body.maxRedemptions || 1),
        products: [getPolarProductId()],
        duration,
        durationInMonths: body.duration === "months" ? Number(body.durationMonths || 1) : undefined,
        metadata: { source: "dreamwish_admin", created_by: owner.uid }
      };
      const polarInput = type === "percentage_discount"
        ? { ...common, type: "percentage", basisPoints: Math.round(Number(body.value || 0) * 100) }
        : { ...common, type: "fixed", amounts: { [String(body.currency || "krw").toLowerCase()]: Math.round(Number(body.value || 0)) } };
      const polarDiscount = await getPolarClient().discounts.create(polarInput as never);
      polarDiscountId = polarDiscount.id;
    }
    const coupon = await createCoupon({
      name: String(body.name || "").trim(),
      code: plaintextCode,
      type,
      value: body.value == null ? null : Number(body.value),
      accessDays: body.accessDays == null ? null : Number(body.accessDays),
      currency: body.currency || "KRW",
      duration: body.duration as CouponDuration,
      durationMonths: body.durationMonths == null ? null : Number(body.durationMonths),
      maxRedemptions: Number(body.maxRedemptions || 1),
      perUserLimit: Number(body.perUserLimit || 1),
      startsAt: String(body.startsAt || new Date().toISOString()),
      expiresAt: String(body.expiresAt || new Date(Date.now() + 30 * 86_400_000).toISOString()),
      polarDiscountId,
      createdBy: owner.uid
    });
    await appendAdminAuditEvent({ actorAccountId: owner.uid, action: "coupon.create", safeMetadata: { couponId: coupon.id, type: coupon.type, codeHint: coupon.codeHint } });
    return NextResponse.json({ ok: true, coupon, plaintextCode }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "쿠폰을 생성하지 못했습니다." }, { status: 400 });
  }
}

