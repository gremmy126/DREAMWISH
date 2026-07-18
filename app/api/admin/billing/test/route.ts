import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminContext } from "@/src/lib/admin/admin-guard";
import { getDomesticBillingConfig, requireBillingCapability } from "@/src/lib/billing/billing-config";
import { createBillingMethod, revokeBillingMethod } from "@/src/lib/billing/billing-method.repository";
import { createPaymentAttempt, getPaymentAttempt, transitionPaymentAttempt } from "@/src/lib/billing/payment-attempt.repository";
import { buildKcpBillingKeyRequest, PortOneKcpV1Adapter } from "@/src/lib/billing/portone/kcp-v1.adapter";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepare"), provider: z.literal("portone_kcp_v1") }).strict(),
  z.object({ action: z.literal("confirm"), attemptId: z.string().uuid(), customerUid: z.string().min(8).max(100) }).strict()
]);
const TEST_AMOUNT = 1000;

export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const admin = await requireAdminContext(request);
    const config = getDomesticBillingConfig();
    if (config.mode !== "sandbox") return NextResponse.json({ ok: false, error: "관리자 테스트는 샌드박스 모드에서만 실행됩니다." }, { status: 409 });
    requireBillingCapability(config, "kcpRecurring");
    const body = bodySchema.parse(await request.json());
    if (body.action === "prepare") {
      const nonce = randomBytes(15).toString("hex");
      const merchantUid = `dwkcpissue${nonce}`;
      const customerUid = `dwkcp${createHash("sha256").update(`${admin.uid}:${nonce}`).digest("hex").slice(0, 36)}`;
      const attempt = await createPaymentAttempt({
        ownerId: admin.uid, provider: "portone_kcp_v1", environment: "sandbox", purpose: "subscription_setup",
        idempotencyKey: `${admin.uid}:kcp-test:${nonce}`, providerPaymentId: merchantUid,
        expectedAmount: TEST_AMOUNT, orderName: "DREAMWISH 정기결제 테스트",
        safeMetadata: { customerUid, merchantPaymentId: merchantUid }
      });
      await transitionPaymentAttempt(attempt.id, "pending_provider");
      return NextResponse.json({
        ok: true, attemptId: attempt.id, impCode: process.env.PORTONE_V1_IMP_CODE,
        customerUid,
        parameters: buildKcpBillingKeyRequest({
          channelKey: process.env.PORTONE_KCP_V1_TEST_BILLING_CHANNEL_KEY!, customerUid, merchantUid,
          buyerEmail: admin.email, redirectUrl: `${process.env.APP_URL || new URL(request.url).origin}/billing/success`
        })
      });
    }

    const attempt = await getPaymentAttempt(body.attemptId, admin.uid);
    if (!attempt || attempt.provider !== "portone_kcp_v1" || attempt.safeMetadata.customerUid !== body.customerUid) {
      return NextResponse.json({ ok: false, error: "KCP 테스트 시도를 찾을 수 없습니다." }, { status: 404 });
    }
    const adapter = new PortOneKcpV1Adapter(config);
    const issued = await adapter.issueBillingMethod({
      ownerId: admin.uid, issueId: attempt.providerPaymentId!, environment: "sandbox", providerReference: body.customerUid
    });
    const method = await createBillingMethod({
      ownerId: admin.uid, provider: "portone_kcp_v1", environment: "sandbox", providerReference: issued.providerReference
    });
    await transitionPaymentAttempt(attempt.id, "verification_pending");
    const merchantPaymentId = `dwkcptest${randomBytes(14).toString("hex")}`;
    const charge = await adapter.charge({
      ownerId: admin.uid, paymentId: merchantPaymentId, providerReference: issued.providerReference,
      money: { amount: TEST_AMOUNT, currency: "KRW" }, orderName: "DREAMWISH 정기결제 테스트", environment: "sandbox"
    });
    await adapter.verifyPayment({
      providerPaymentId: charge.paymentId, expectedPaymentId: merchantPaymentId, expectedOwnerId: admin.uid,
      expectedMoney: { amount: TEST_AMOUNT, currency: "KRW" }, environment: "sandbox"
    });
    await transitionPaymentAttempt(attempt.id, "test_succeeded", {
      providerPaymentId: charge.paymentId,
      safeMetadata: { merchantPaymentId }
    });
    await adapter.revokeBillingReference(issued.providerReference);
    await revokeBillingMethod(method.id, admin.uid);
    return NextResponse.json({ ok: true, status: "test_succeeded", environment: "sandbox" });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400;
    return NextResponse.json({ ok: false, error: "KCP 정기결제 테스트를 완료하지 못했습니다." }, { status });
  }
}

