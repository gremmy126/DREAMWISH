import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { markCheckoutPending } from "@/src/lib/billing/billing.repository";
import {
  getAppOrigin,
  getPolarClient,
  getPolarProductId
} from "@/src/lib/billing/polar";
import { getPreparedDiscount, voidPreparedDiscount } from "@/src/lib/coupons/coupon.repository";

export async function POST(request: Request) {
  let ownerId: string | null = null;
  try {
    const owner = await requireOwnerContext(request);
    ownerId = owner.uid;
    if (owner.role === "admin") {
      return NextResponse.json(
        { ok: false, error: "관리자 계정은 결제가 필요하지 않습니다." },
        { status: 409 }
      );
    }
    const appOrigin = getAppOrigin();
    const forwardedIp = request.headers
      .get("x-forwarded-for")
      ?.split(",")[0]
      ?.trim();
    const preparedDiscount = await getPreparedDiscount(owner.uid);
    const checkout = await getPolarClient().checkouts.create({
      products: [getPolarProductId()],
      successUrl: `${appOrigin}/billing/success?checkout_id={CHECKOUT_ID}`,
      returnUrl: appOrigin,
      externalCustomerId: owner.uid,
      customerEmail: owner.email,
      customerIpAddress: forwardedIp || null,
      discountId: preparedDiscount?.coupon.polarDiscountId || undefined,
      metadata: {
        owner_id: owner.uid,
        coupon_redemption_id: preparedDiscount?.redemption.id || ""
      }
    });
    await markCheckoutPending(owner.uid);
    return NextResponse.json({ ok: true, checkoutUrl: checkout.url });
  } catch (error) {
    if (ownerId) await voidPreparedDiscount(ownerId).catch(() => undefined);
    console.error("[billing.checkout]", safeErrorCode(error));
    return NextResponse.json(
      { ok: false, error: "결제창을 열지 못했습니다. 잠시 후 다시 시도해주세요." },
      { status: 502 }
    );
  }
}

function safeErrorCode(error: unknown) {
  return error instanceof Error ? error.name : "UNKNOWN";
}
