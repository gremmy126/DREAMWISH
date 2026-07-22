import { NextResponse } from "next/server";
import { classifyAdminAuthError, requireAdminContext } from "@/src/lib/admin/admin-guard";
import { appendAdminAuditEvent } from "@/src/lib/admin/account-admin.repository";
import { generateCouponCode, assertCouponCode } from "@/src/lib/coupons/coupon-code";
import { createCoupon, listCoupons } from "@/src/lib/coupons/coupon.repository";
import { CouponConflictError, CouponValidationError } from "@/src/lib/coupons/coupon-errors";
import type { Coupon, CouponCreateInput, CouponDuration, CouponType } from "@/src/lib/coupons/coupon.types";
import { getPolarClient, getPolarProductId } from "@/src/lib/billing/polar";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

const TYPES = new Set<CouponType>(["access_duration", "percentage_discount", "fixed_discount"]);
const DURATIONS = new Set<CouponDuration>(["once", "months", "forever"]);

// 쿠폰 API 오류 → HTTP 상태 코드. 인증·권한·CSRF는 401/403, 코드 중복은 409,
// 값 검증 실패는 400, 그 밖의 예상치 못한 오류는 500으로 돌려준다. (값 검증
// 실패를 403으로 반환하지 않는 것이 핵심.)
function couponErrorResponse(error: unknown): NextResponse {
  const authInfo = classifyAdminAuthError(error);
  if (authInfo) {
    return NextResponse.json({ ok: false, code: authInfo.code, error: authInfo.message }, { status: authInfo.status });
  }
  if (error instanceof CouponConflictError) {
    return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: error.status });
  }
  if (error instanceof CouponValidationError) {
    return NextResponse.json({ ok: false, code: error.code, error: error.message }, { status: error.status });
  }
  console.error("[admin/coupons] unexpected error:", error instanceof Error ? error.message : error);
  return NextResponse.json(
    { ok: false, code: "COUPON_INTERNAL_ERROR", error: "쿠폰 처리 중 서버 오류가 발생했습니다." },
    { status: 500 }
  );
}

export async function GET(request: Request) {
  try {
    await requireAdminContext(request);
    return NextResponse.json({ ok: true, coupons: await listCoupons() });
  } catch (error) {
    return couponErrorResponse(error);
  }
}

export async function POST(request: Request) {
  // 인증·권한·CSRF는 도메인 처리와 분리해 정확한 상태 코드(401/403)를 준다.
  let ownerUid: string;
  try {
    assertSameOriginMutation(request);
    ownerUid = (await requireAdminContext(request)).uid;
  } catch (error) {
    return couponErrorResponse(error);
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Partial<CouponCreateInput> & {
      quantity?: number;
    };
    if (!TYPES.has(body.type as CouponType) || !DURATIONS.has(body.duration as CouponDuration)) {
      throw new CouponValidationError("쿠폰 종류와 적용 기간을 확인해 주세요.");
    }
    const type = body.type as CouponType;
    // 대량 발급 상한. 할인형은 장마다 Polar 할인을 만들어야 해 상대적으로 낮게 둔다.
    const maxQuantity = type === "access_duration" ? 2000 : 500;
    const quantity = Math.max(1, Math.min(maxQuantity, Math.trunc(Number(body.quantity) || 1)));
    if (quantity > 1 && body.code) {
      throw new CouponValidationError("여러 장을 발급할 때는 코드가 자동 생성됩니다. 코드 칸을 비워 주세요.");
    }

    const created: Array<{ coupon: Coupon; plaintextCode: string }> = [];
    // Polar 할인 동기화가 실패해도 국내(PortOne) 결제에는 그대로 적용되는
    // 로컬 쿠폰은 발급한다. 실패 사실은 경고로 함께 알린다.
    const polarWarnings: string[] = [];
    try {
      for (let index = 0; index < quantity; index += 1) {
        const plaintextCode = assertCouponCode(
          (quantity === 1 ? body.code : undefined) ||
            generateCouponCode(type === "access_duration" ? "PASS" : "SALE")
        );
        let polarDiscountId: string | null = null;
        if (type !== "access_duration") {
          if (!/^[A-Z0-9]{3,64}$/u.test(plaintextCode)) {
            throw new CouponValidationError("할인 쿠폰 코드는 영문 대문자와 숫자만 사용할 수 있습니다.");
          }
          polarDiscountId = await createPolarDiscount({ body, type, plaintextCode, ownerUid }).catch((polarError) => {
            polarWarnings.push(polarError instanceof Error ? polarError.message : "Polar 할인 동기화 실패");
            return null;
          });
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
          createdBy: ownerUid
        });
        created.push({ coupon, plaintextCode });
      }
    } catch (loopError) {
      // 아무 것도 발급되지 않았으면 올바른 상태 코드로 실패를 알린다.
      if (created.length === 0) throw loopError;
      // 일부만 발급된 경우: 성공한 코드는 돌려주고 원인도 함께 알린다(207).
      await appendAdminAuditEvent({
        actorAccountId: ownerUid,
        action: "coupon.create",
        safeMetadata: { count: created.length, type, partial: true }
      });
      return NextResponse.json(
        {
          ok: false,
          error: `${created.length}/${quantity}장만 발급되었습니다: ${loopError instanceof Error ? loopError.message : "알 수 없는 오류"}`,
          coupons: created.map((entry) => entry.coupon),
          plaintextCodes: created.map((entry) => entry.plaintextCode)
        },
        { status: 207 }
      );
    }

    await appendAdminAuditEvent({
      actorAccountId: ownerUid,
      action: "coupon.create",
      safeMetadata: {
        count: created.length,
        type,
        codeHint: created[0]?.coupon.codeHint || "",
        polarSynced: polarWarnings.length === 0
      }
    });

    const warning = polarWarnings.length
      ? `쿠폰은 발급했지만 Polar 글로벌 결제 연동에 실패했습니다(국내 결제에는 정상 적용). ${polarWarnings[0]}`
      : undefined;
    return NextResponse.json(
      {
        ok: true,
        coupon: created[0]?.coupon,
        plaintextCode: created[0]?.plaintextCode,
        coupons: created.map((entry) => entry.coupon),
        plaintextCodes: created.map((entry) => entry.plaintextCode),
        polarSynced: polarWarnings.length === 0,
        ...(warning ? { warning, error: warning } : {})
      },
      { status: 201 }
    );
  } catch (error) {
    return couponErrorResponse(error);
  }
}

// 선택한 할인 유형에 맞는 Polar 할인을 만든다. 실패는 호출부에서 베스트에포트로
// 흡수한다(코드 서명·토큰·서버 모드 불일치 등으로 Polar가 거부해도 로컬 쿠폰은
// 발급되도록).
async function createPolarDiscount(input: {
  body: Partial<CouponCreateInput> & { quantity?: number };
  type: CouponType;
  plaintextCode: string;
  ownerUid: string;
}): Promise<string> {
  const { body, type, plaintextCode, ownerUid } = input;
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
    metadata: { source: "dreamwish_admin", created_by: ownerUid }
  };
  const polarInput = type === "percentage_discount"
    ? { ...common, type: "percentage", basisPoints: Math.round(Number(body.value || 0) * 100) }
    : { ...common, type: "fixed", amounts: { [String(body.currency || "krw").toLowerCase()]: Math.round(Number(body.value || 0)) } };
  const discount = await getPolarClient().discounts.create(polarInput as never);
  return discount.id;
}
