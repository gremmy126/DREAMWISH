import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import {
  getAIModelTier,
  isAIModelTierId,
  resolveTierPriceKrw
} from "@/src/lib/ai/ai-model-catalog";
import { OwnerContextError, requireOwnerContext } from "@/src/lib/auth/owner-context";
import { getDomesticBillingConfig, requireBillingCapability } from "@/src/lib/billing/billing-config";
import {
  computePurchaseAmounts,
  createPurchaseIntent
} from "@/src/lib/billing/ai-credit-purchase.repository";
import { createProviderPaymentId } from "@/src/lib/billing/payment-id";
import {
  attachPaymentAttemptMetadata,
  createPaymentAttempt,
  transitionPaymentAttempt
} from "@/src/lib/billing/payment-attempt.repository";
import { PortOneKpnV2Adapter } from "@/src/lib/billing/portone/kpn-v2.adapter";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

// KPN general-payment checkout for prepaid AI credits. The client sends only a
// tier id and integer quantity; the server owns the tier price, the KRW total,
// the credit grant, and the KPN amount. The client can never supply an amount,
// provider, model id, or price.
export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const owner = await requireOwnerContext(request);
    const body = (await request.json().catch(() => ({}))) as { tierId?: unknown; quantity?: unknown };

    if (!isAIModelTierId(body.tierId)) {
      return NextResponse.json({ ok: false, error: "지원하지 않는 모델 등급입니다." }, { status: 400 });
    }
    const tier = getAIModelTier(body.tierId);
    if (!tier.configured) {
      return NextResponse.json(
        { ok: false, code: "AI_TIER_NOT_CONFIGURED", error: "현재 구매할 수 없는 모델 등급입니다." },
        { status: 409 }
      );
    }
    const quantity = Number(body.quantity);
    const unitPriceKrw = resolveTierPriceKrw(tier.id);
    // computePurchaseAmounts validates the quantity (1..100, integer) and does
    // only safe-integer arithmetic; it throws on anything malformed.
    const { credits, total } = computePurchaseAmounts(quantity, unitPriceKrw);

    const config = getDomesticBillingConfig();
    if (config.mode === "sandbox" && !config.publicSandboxEnabled) {
      return NextResponse.json({ ok: false, error: "결제가 비활성화되어 있습니다." }, { status: 404 });
    }
    // Rejects when the KPN general channel / store credentials are not ready,
    // so live AI credit checkout is unavailable until the channel is live.
    requireBillingCapability(config, "kpnGeneral");
    const environment = config.mode;

    const priceVersion = `v1:${tier.id}:${unitPriceKrw}`;
    const orderName = `DREAMWISH AI 크레딧 ${tier.label} x${quantity}`.slice(0, 200);
    const nonce = randomBytes(16).toString("hex");
    const paymentId = createProviderPaymentId("dwcredit");

    const attempt = await createPaymentAttempt({
      ownerId: owner.uid,
      provider: "portone_kpn_v2",
      environment,
      purpose: "general",
      idempotencyKey: `${owner.uid}:ai-credit:${nonce}`,
      providerPaymentId: paymentId,
      expectedAmount: total,
      orderName,
      safeMetadata: {
        purpose: "ai_credit_purchase",
        tierId: tier.id,
        quantity,
        priceVersion
      }
    });

    const purchase = await createPurchaseIntent(owner.uid, {
      tierId: tier.id,
      quantity,
      unitPriceKrw,
      priceVersion,
      environment,
      paymentAttemptId: attempt.id
    });
    await attachPaymentAttemptMetadata(attempt.id, { purchaseId: purchase.id });

    const session = await new PortOneKpnV2Adapter(config).createCheckout({
      attemptId: attempt.id,
      ownerId: owner.uid,
      paymentId,
      purpose: "general",
      money: { amount: total, currency: "KRW" },
      orderName,
      environment
    });
    await transitionPaymentAttempt(attempt.id, "pending_provider");

    return NextResponse.json({
      ok: true,
      attemptId: attempt.id,
      purchaseId: purchase.id,
      environment,
      tier: { id: tier.id, label: tier.label, priceKrwPerMillion: unitPriceKrw },
      quantity,
      creditsGranted: credits,
      totalAmountKrw: total,
      isTest: environment === "sandbox",
      ...session.clientParameters
    });
  } catch (error) {
    if (error instanceof OwnerContextError) {
      return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
    }
    const status = typeof error === "object" && error && "status" in error ? Number((error as { status: number }).status) : 400;
    const message = error instanceof Error ? error.message : "크레딧 결제를 시작할 수 없습니다.";
    return NextResponse.json({ ok: false, error: message }, { status: Number.isFinite(status) ? status : 400 });
  }
}
