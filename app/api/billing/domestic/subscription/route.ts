import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { applyDomesticBillingPayment } from "@/src/lib/billing/billing.repository";
import { getDomesticBillingConfig, requireBillingCapability } from "@/src/lib/billing/billing-config";
import { enqueueBillingChargeJob } from "@/src/lib/billing/billing-charge-queue.repository";
import { appendBillingEvent } from "@/src/lib/billing/billing-event.repository";
import { getBillingMethodWithReference } from "@/src/lib/billing/billing-method.repository";
import { attachPaymentAttemptMetadata, createPaymentAttempt, transitionPaymentAttempt } from "@/src/lib/billing/payment-attempt.repository";
import { PortOneKcpV1Adapter } from "@/src/lib/billing/portone/kcp-v1.adapter";
import { PortOneKpnV2Adapter } from "@/src/lib/billing/portone/kpn-v2.adapter";
import { createDomesticSubscription, getDomesticSubscriptionByOwner } from "@/src/lib/billing/subscription.repository";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";
import { getPreparedDomesticDiscount, markPreparedDiscountRedeemed, voidPreparedDiscount } from "@/src/lib/coupons/coupon.repository";
import { buildDomesticSubscriptionPricing } from "@/src/lib/coupons/coupon.service";

const inputSchema = z.object({ billingMethodId: z.string().uuid() }).strict();

export async function POST(request: Request) {
  let reservedOwnerId: string | null = null;
  try {
    assertSameOriginMutation(request);
    const owner = await requireOwnerContext(request);
    const config = getDomesticBillingConfig();
    if (config.mode !== "live") return NextResponse.json({ ok: false, error: "샌드박스에서는 구독을 만들 수 없습니다." }, { status: 409 });
    const { billingMethodId } = inputSchema.parse(await request.json());
    const existing = await getDomesticSubscriptionByOwner(owner.uid);
    if (existing && ["active", "past_due"].includes(existing.status)) {
      await markPreparedDiscountRedeemed(owner.uid).catch(() => undefined);
      return NextResponse.json({ ok: true, subscription: existing, recovered: true });
    }
    const method = await getBillingMethodWithReference(billingMethodId, owner.uid);
    if (!method || method.status !== "active" || method.environment !== "live") {
      return NextResponse.json({ ok: false, error: "사용할 수 없는 빌링수단입니다." }, { status: 404 });
    }
    requireBillingCapability(config, method.provider === "portone_kcp_v1" ? "kcpRecurring" : "kpnRecurring");
    const preparedDiscount = await getPreparedDomesticDiscount(owner.uid);
    if (preparedDiscount) reservedOwnerId = owner.uid;
    const baseAmount = monthlyAmount();
    const computedPricing = buildDomesticSubscriptionPricing(baseAmount, preparedDiscount?.coupon || null);
    const initialPaymentId = `dwsub${randomBytes(15).toString("hex")}`;
    let attempt = await createPaymentAttempt({
      ownerId: owner.uid, provider: method.provider, environment: "live", purpose: "subscription_charge",
      idempotencyKey: `${owner.uid}:initial:${method.id}:${existing?.id || "first"}`, providerPaymentId: initialPaymentId,
      expectedAmount: computedPricing.initialAmount, orderName: "DREAMWISH 월간 구독",
      safeMetadata: {
        merchantPaymentId: initialPaymentId, billingMethodId: method.id,
        baseAmount, renewalAmount: computedPricing.renewalAmount,
        discountedAmount: computedPricing.initialAmount < baseAmount ? computedPricing.initialAmount : null,
        remainingDiscountCycles: computedPricing.remainingDiscountCycles,
        discountForever: computedPricing.discountForever,
        couponRedemptionId: preparedDiscount?.redemption.id || null
      }
    });
    reservedOwnerId = null;
    const pricing = pricingFromAttempt(attempt, computedPricing);
    const amount = attempt.expectedAmount;
    const paymentId = typeof attempt.safeMetadata.merchantPaymentId === "string"
      ? attempt.safeMetadata.merchantPaymentId
      : attempt.providerPaymentId || initialPaymentId;
    const adapter = method.provider === "portone_kcp_v1"
      ? new PortOneKcpV1Adapter(config)
      : new PortOneKpnV2Adapter(config);
    if (["failed", "expired", "test_succeeded"].includes(attempt.status)) throw new Error("Initial subscription attempt is terminal.");
    if (attempt.status === "created") attempt = await transitionPaymentAttempt(attempt.id, "pending_provider");
    if (attempt.status === "pending_provider") {
      const charge = await adapter.charge({
        ownerId: owner.uid, paymentId, providerReference: method.providerReference,
        money: { amount, currency: "KRW" }, orderName: "DREAMWISH 월간 구독", environment: "live"
      });
      attempt = await transitionPaymentAttempt(attempt.id, "verification_pending", {
        providerPaymentId: charge.paymentId,
        safeMetadata: { merchantPaymentId: paymentId }
      });
    }
    const providerPaymentId = attempt.providerPaymentId || paymentId;
    const verified = await adapter.verifyPayment({
      providerPaymentId, expectedPaymentId: paymentId, expectedOwnerId: owner.uid,
      expectedMoney: { amount, currency: "KRW" }, environment: "live"
    });
    if (attempt.status !== "succeeded") attempt = await transitionPaymentAttempt(attempt.id, "succeeded");
    const periodStart = new Date();
    const periodEnd = new Date(periodStart);
    periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
    const subscription = await createDomesticSubscription({
      ownerId: owner.uid, provider: method.provider, environment: "live", billingMethodId: method.id,
      productKey: "dreamwish-monthly", amount: pricing.renewalAmount, baseAmount,
      discountedAmount: pricing.initialAmount < baseAmount ? pricing.initialAmount : null,
      discountRemainingCycles: pricing.remainingDiscountCycles, discountForever: pricing.discountForever,
      currentPeriodStart: periodStart.toISOString(), currentPeriodEnd: periodEnd.toISOString()
    });
    await attachPaymentAttemptMetadata(attempt.id, { subscriptionId: subscription.id });
    await applyDomesticBillingPayment({
      eventId: `payment:${method.provider}:${verified.providerPaymentId}`, ownerId: owner.uid, provider: method.provider,
      environment: "live", subscriptionId: subscription.id, currentPeriodEnd: periodEnd.toISOString(), occurredAt: verified.paidAt
    });
    await appendBillingEvent({
      ownerId: owner.uid, provider: method.provider, environment: "live", eventType: "payment_confirmed",
      idempotencyKey: `payment:${method.provider}:${verified.providerPaymentId}`, amount, currency: "KRW", occurredAt: verified.paidAt,
      safeMetadata: { subscriptionId: subscription.id, orderName: "DREAMWISH 월간 구독" }
    });
    await enqueueBillingChargeJob({
      ownerId: owner.uid, subscriptionId: subscription.id, provider: method.provider, environment: "live",
      idempotencyKey: `${subscription.id}:${periodEnd.toISOString()}`, amount: pricing.renewalAmount, nextRunAt: periodEnd.toISOString()
    });
    if (attempt.safeMetadata.couponRedemptionId) await markPreparedDiscountRedeemed(owner.uid);
    return NextResponse.json({ ok: true, subscription });
  } catch (error) {
    if (reservedOwnerId) await voidPreparedDiscount(reservedOwnerId).catch(() => undefined);
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400;
    return NextResponse.json({ ok: false, error: "구독을 활성화하지 못했습니다." }, { status });
  }
}

function monthlyAmount() {
  const value = Number(process.env.BILLING_DOMESTIC_MONTHLY_AMOUNT_KRW || 4900);
  if (!Number.isSafeInteger(value) || value < 100) throw new Error("BILLING_DOMESTIC_MONTHLY_AMOUNT_KRW is invalid.");
  return value;
}

function pricingFromAttempt(
  attempt: { safeMetadata: Record<string, unknown>; expectedAmount: number },
  fallback: ReturnType<typeof buildDomesticSubscriptionPricing>
) {
  const renewalAmount = Number(attempt.safeMetadata.renewalAmount);
  const remainingDiscountCycles = Number(attempt.safeMetadata.remainingDiscountCycles);
  return {
    initialAmount: attempt.expectedAmount,
    renewalAmount: Number.isSafeInteger(renewalAmount) && renewalAmount >= 0 ? renewalAmount : fallback.renewalAmount,
    remainingDiscountCycles: Number.isSafeInteger(remainingDiscountCycles) && remainingDiscountCycles >= 0 ? remainingDiscountCycles : fallback.remainingDiscountCycles,
    discountForever: typeof attempt.safeMetadata.discountForever === "boolean" ? attempt.safeMetadata.discountForever : fallback.discountForever
  };
}
