import { NextResponse } from "next/server";
import { OwnerContextError, requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  DEFAULT_DOMESTIC_MONTHLY_AMOUNT_KRW,
  getDomesticMonthlyAmountKrw
} from "@/src/lib/billing/billing-config";
import { assertCouponCode } from "@/src/lib/coupons/coupon-code";
import { redeemCouponByCode, voidPreparedDiscount } from "@/src/lib/coupons/coupon.repository";
import { calculateDomesticCouponAmount } from "@/src/lib/coupons/coupon.service";
import { assertSameOriginMutation, CsrfValidationError } from "@/src/lib/security/csrf";

// 로그인한 사용자가 결제 화면에서 직접 쿠폰 코드를 적용(예약)하는 엔드포인트.
// 할인 쿠폰은 예약(reserved) 상태로 잡아두고, 실제 결제 시 서버가
// getPreparedDiscount / getPreparedDomesticDiscount 로 다시 읽어 금액을
// 재계산한다(클라이언트가 보낸 금액은 신뢰하지 않는다). 이용권 쿠폰은
// 즉시 적용되어 이용 기간이 부여된다.

function monthlyBaseAmountKrw() {
  try {
    return getDomesticMonthlyAmountKrw();
  } catch {
    return DEFAULT_DOMESTIC_MONTHLY_AMOUNT_KRW;
  }
}

// assertRedeemable / assertCouponCode 의 내부 메시지를 사용자 친화적인
// 한국어로 바꾼다(내부 오류 문구를 그대로 노출하지 않기 위함).
function friendlyCouponMessage(message: string): string {
  if (/must contain|3-64/iu.test(message)) return "쿠폰 코드 형식을 확인해 주세요.";
  if (/invalid or inactive/iu.test(message)) return "사용할 수 없거나 비활성화된 쿠폰입니다.";
  if (/not currently redeemable/iu.test(message)) return "지금은 사용할 수 없는 쿠폰입니다. 사용 기간을 확인해 주세요.";
  if (/redemption limit/iu.test(message)) return "쿠폰 사용 한도가 모두 소진되었습니다.";
  if (/already used/iu.test(message)) return "이미 이 계정에서 사용한 쿠폰입니다.";
  return "쿠폰을 적용하지 못했습니다. 코드를 다시 확인해 주세요.";
}

function couponApplyErrorResponse(error: unknown): NextResponse {
  if (error instanceof OwnerContextError) {
    return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  }
  if (error instanceof CsrfValidationError) {
    return NextResponse.json({ ok: false, error: "요청 출처를 확인할 수 없습니다." }, { status: 403 });
  }
  const message = error instanceof Error ? error.message : "";
  return NextResponse.json({ ok: false, error: friendlyCouponMessage(message) }, { status: 400 });
}

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const owner = await requireOwnerContext(request);
    const body = (await request.json().catch(() => ({}))) as { code?: unknown };
    const code = assertCouponCode(typeof body.code === "string" ? body.code : "");

    const { coupon } = await redeemCouponByCode({ code, userId: owner.uid });

    if (coupon.type === "access_duration") {
      return NextResponse.json({
        ok: true,
        kind: "access" as const,
        coupon: { type: coupon.type, accessDays: coupon.accessDays, codeHint: coupon.codeHint },
        message: "이용권이 적용되었습니다. 새로고침하면 바로 이용할 수 있습니다."
      });
    }

    const baseAmount = monthlyBaseAmountKrw();
    const discountedAmount = calculateDomesticCouponAmount(baseAmount, coupon);
    return NextResponse.json({
      ok: true,
      kind: "discount" as const,
      coupon: {
        type: coupon.type,
        value: coupon.value,
        currency: coupon.currency,
        duration: coupon.duration,
        codeHint: coupon.codeHint
      },
      preview: {
        baseAmount,
        discountedAmount,
        discountAmount: Math.max(0, baseAmount - discountedAmount),
        currency: "KRW" as const
      },
      message: "할인 쿠폰이 적용되었습니다. 결제 시 금액에 반영됩니다."
    });
  } catch (error) {
    return couponApplyErrorResponse(error);
  }
}

// 적용해 둔 할인 예약을 해제한다(결제 전 사용자가 쿠폰을 빼는 경우).
export async function DELETE(request: Request) {
  try {
    assertSameOriginMutation(request);
    const owner = await requireOwnerContext(request);
    await voidPreparedDiscount(owner.uid);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return couponApplyErrorResponse(error);
  }
}
