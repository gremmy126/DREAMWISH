import { NextResponse } from "next/server";
import {
  createPendingCouponCookie,
  PENDING_COUPON_COOKIE,
  PENDING_COUPON_MAX_AGE_SECONDS
} from "@/src/lib/coupons/coupon.service";
import { assertCouponCode } from "@/src/lib/coupons/coupon-code";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { code?: string };
    const code = assertCouponCode(body.code || "");
    const response = NextResponse.json({
      ok: true,
      message: "쿠폰을 보관했습니다. 로그인 후 적용 결과를 확인할 수 있습니다."
    });
    response.cookies.set({
      name: PENDING_COUPON_COOKIE,
      value: createPendingCouponCookie(code),
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: PENDING_COUPON_MAX_AGE_SECONDS
    });
    return response;
  } catch {
    return NextResponse.json(
      { ok: false, error: "쿠폰 코드 형식을 확인해 주세요." },
      { status: 400 }
    );
  }
}

