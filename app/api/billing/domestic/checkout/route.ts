import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { getDomesticBillingConfig, requireBillingCapability } from "@/src/lib/billing/billing-config";
import { createPaymentAttempt, transitionPaymentAttempt } from "@/src/lib/billing/payment-attempt.repository";
import { PortOneKpnV2Adapter } from "@/src/lib/billing/portone/kpn-v2.adapter";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

const PUBLIC_SANDBOX_SKU = Object.freeze({
  key: "dreamwish-domestic-checkout-test",
  orderName: "DREAMWISH 결제 테스트",
  totalAmount: 1000,
  currency: "KRW" as const
});

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const owner = await requireOwnerContext(request);
    const config = getDomesticBillingConfig();
    if (config.mode !== "sandbox" || !config.publicSandboxEnabled) {
      return NextResponse.json({ ok: false, error: "공개 테스트 결제가 비활성화되어 있습니다." }, { status: 404 });
    }
    requireBillingCapability(config, "kpnGeneral");
    const nonce = randomBytes(16).toString("hex");
    const paymentId = `dwtest${nonce}`;
    const attempt = await createPaymentAttempt({
      ownerId: owner.uid,
      provider: "portone_kpn_v2",
      environment: "sandbox",
      purpose: "general",
      idempotencyKey: `${owner.uid}:sandbox-general:${nonce}`,
      providerPaymentId: paymentId,
      expectedAmount: PUBLIC_SANDBOX_SKU.totalAmount,
      orderName: PUBLIC_SANDBOX_SKU.orderName,
      safeMetadata: { sku: PUBLIC_SANDBOX_SKU.key }
    });
    const session = await new PortOneKpnV2Adapter(config).createCheckout({
      attemptId: attempt.id,
      ownerId: owner.uid,
      paymentId,
      purpose: "general",
      money: { amount: PUBLIC_SANDBOX_SKU.totalAmount, currency: PUBLIC_SANDBOX_SKU.currency },
      orderName: PUBLIC_SANDBOX_SKU.orderName,
      environment: "sandbox"
    });
    await transitionPaymentAttempt(attempt.id, "pending_provider");
    return NextResponse.json({
      ok: true,
      attemptId: attempt.id,
      environment: "sandbox",
      ...session.clientParameters
    });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 503;
    return NextResponse.json({ ok: false, error: "테스트 결제를 시작할 수 없습니다." }, { status });
  }
}
