import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { getDomesticBillingConfig, requireBillingCapability } from "@/src/lib/billing/billing-config";
import { createBillingMethod, revokeBillingMethod } from "@/src/lib/billing/billing-method.repository";
import { getDomesticPrimaryProvider } from "@/src/lib/billing/billing-provider.repository";
import { createProviderPaymentId } from "@/src/lib/billing/payment-id";
import { createPaymentAttempt, getPaymentAttempt, transitionPaymentAttempt } from "@/src/lib/billing/payment-attempt.repository";
import { buildKcpBillingKeyRequest, PortOneKcpV1Adapter } from "@/src/lib/billing/portone/kcp-v1.adapter";
import { PortOneKpnV2Adapter } from "@/src/lib/billing/portone/kpn-v2.adapter";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create") }).strict(),
  z.object({
    action: z.literal("confirm"),
    attemptId: z.string().uuid(),
    billingKey: z.string().min(8).max(300).optional(),
    customerUid: z.string().min(8).max(100).optional()
  }).strict().refine((value) => Boolean(value.billingKey) !== Boolean(value.customerUid), {
    message: "Exactly one billing reference is required."
  })
]);
const RECURRING_TEST_AMOUNT = 1000;

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const owner = await requireOwnerContext(request);
    const config = getDomesticBillingConfig();
    if (config.mode === "sandbox" && !config.publicSandboxEnabled) {
      return NextResponse.json({ ok: false, error: "공개 테스트 결제가 비활성화되어 있습니다." }, { status: 404 });
    }
    const body = bodySchema.parse(await request.json());
    if (body.action === "create") {
      const nonce = randomBytes(16).toString("hex");
      const provider = config.mode === "sandbox"
        ? "portone_kpn_v2"
        : await getDomesticPrimaryProvider(config.primaryProvider);
      requireBillingCapability(config, provider === "portone_kcp_v1" ? "kcpRecurring" : "kpnRecurring");

      if (provider === "portone_kcp_v1") {
        const merchantUid = `dwkcpissue${nonce}`;
        const customerUid = `dwkcp${createHash("sha256").update(`${owner.uid}:${nonce}`).digest("hex").slice(0, 36)}`;
        const attempt = await createPaymentAttempt({
          ownerId: owner.uid,
          provider,
          environment: config.mode,
          purpose: "subscription_setup",
          idempotencyKey: `${owner.uid}:billing-method:${nonce}`,
          providerPaymentId: merchantUid,
          expectedAmount: monthlyAmount(),
          orderName: "DREAMWISH 월간 구독",
          safeMetadata: { customerUid, merchantPaymentId: merchantUid }
        });
        await transitionPaymentAttempt(attempt.id, "pending_provider");
        return NextResponse.json({
          ok: true,
          flow: "v1",
          attemptId: attempt.id,
          impCode: config.values.v1ImpCode,
          customerUid,
          environment: config.mode,
          parameters: buildKcpBillingKeyRequest({
            channelKey: config.values.kcpBillingChannelKey!,
            customerUid,
            merchantUid,
            buyerEmail: owner.email,
            redirectUrl: `${process.env.APP_URL || new URL(request.url).origin}/billing/success`
          })
        });
      }

      const issueId = `dwissue${nonce}`;
      const attempt = await createPaymentAttempt({
        ownerId: owner.uid, provider: "portone_kpn_v2", environment: config.mode,
        purpose: "subscription_setup", idempotencyKey: `${owner.uid}:billing-method:${nonce}`,
        providerPaymentId: issueId, expectedAmount: config.mode === "sandbox" ? RECURRING_TEST_AMOUNT : monthlyAmount(),
        orderName: config.mode === "sandbox" ? "DREAMWISH 정기결제 테스트" : "DREAMWISH 월간 구독"
      });
      await transitionPaymentAttempt(attempt.id, "pending_provider");
      return NextResponse.json({
        ok: true, flow: "v2", attemptId: attempt.id, issueId,
        storeId: config.values.storeId,
        channelKey: config.values.kpnBillingChannelKey,
        billingKeyMethod: "CARD",
        displayAmount: config.mode === "sandbox" ? RECURRING_TEST_AMOUNT : monthlyAmount(),
        currency: "KRW",
        environment: config.mode,
        customer: { customerId: ownerCustomerId(owner.uid), fullName: "DREAMWISH 사용자", email: owner.email }
      });
    }

    const attempt = await getPaymentAttempt(body.attemptId, owner.uid);
    if (!attempt || attempt.purpose !== "subscription_setup") {
      return NextResponse.json({ ok: false, error: "빌링수단 설정 시도를 찾을 수 없습니다." }, { status: 404 });
    }

    if (attempt.provider === "portone_kcp_v1") {
      if (!body.customerUid || body.customerUid !== attempt.safeMetadata.customerUid || config.mode !== "live") {
        return NextResponse.json({ ok: false, error: "KCP 빌링수단 설정 시도를 확인할 수 없습니다." }, { status: 409 });
      }
      requireBillingCapability(config, "kcpRecurring");
      const adapter = new PortOneKcpV1Adapter(config);
      const issued = await adapter.issueBillingMethod({
        ownerId: owner.uid,
        issueId: attempt.providerPaymentId!,
        environment: config.mode,
        providerReference: body.customerUid
      });
      const method = await createBillingMethod({
        ownerId: owner.uid,
        provider: attempt.provider,
        environment: config.mode,
        providerReference: issued.providerReference
      });
      await transitionPaymentAttempt(attempt.id, "verification_pending");
      await transitionPaymentAttempt(attempt.id, "succeeded");
      return NextResponse.json({ ok: true, status: "billing_method_ready", billingMethodId: method.id, environment: "live" });
    }

    if (!body.billingKey) {
      return NextResponse.json({ ok: false, error: "KPN 빌링키가 필요합니다." }, { status: 400 });
    }
    requireBillingCapability(config, "kpnRecurring");
    const adapter = new PortOneKpnV2Adapter(config);
    const issued = await adapter.issueBillingMethod({
      ownerId: owner.uid, issueId: attempt.providerPaymentId!, environment: config.mode, providerReference: body.billingKey
    });
    const method = await createBillingMethod({
      ownerId: owner.uid, provider: "portone_kpn_v2", environment: config.mode,
      providerReference: issued.providerReference, cardBrand: issued.card?.brand, cardLast4: issued.card?.last4
    });
    await transitionPaymentAttempt(attempt.id, "verification_pending");

    if (config.mode === "sandbox") {
      const paymentId = createProviderPaymentId("dwsubtst");
      await adapter.charge({
        ownerId: owner.uid, paymentId, providerReference: issued.providerReference,
        money: { amount: RECURRING_TEST_AMOUNT, currency: "KRW" },
        orderName: "DREAMWISH 정기결제 테스트", environment: "sandbox"
      });
      await adapter.verifyPayment({
        providerPaymentId: paymentId, expectedPaymentId: paymentId, expectedOwnerId: owner.uid,
        expectedMoney: { amount: RECURRING_TEST_AMOUNT, currency: "KRW" }, environment: "sandbox"
      });
      await transitionPaymentAttempt(attempt.id, "test_succeeded", { providerPaymentId: paymentId });
      await adapter.revokeBillingReference(issued.providerReference);
      await revokeBillingMethod(method.id, owner.uid);
      return NextResponse.json({ ok: true, status: "test_succeeded", environment: "sandbox" });
    }

    await transitionPaymentAttempt(attempt.id, "succeeded");
    return NextResponse.json({ ok: true, status: "billing_method_ready", billingMethodId: method.id, environment: "live" });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400;
    return NextResponse.json({ ok: false, error: "빌링수단 설정을 완료하지 못했습니다." }, { status });
  }
}

function ownerCustomerId(ownerId: string) {
  return `dw${createHash("sha256").update(ownerId).digest("hex").slice(0, 30)}`;
}
function monthlyAmount() {
  const value = Number(process.env.BILLING_DOMESTIC_MONTHLY_AMOUNT_KRW || 15000);
  if (!Number.isSafeInteger(value) || value < 100) throw new Error("BILLING_DOMESTIC_MONTHLY_AMOUNT_KRW is invalid.");
  return value;
}
