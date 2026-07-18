import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminContext } from "@/src/lib/admin/admin-guard";
import { appendAdminAuditEvent } from "@/src/lib/admin/account-admin.repository";
import { applyDomesticRefund } from "@/src/lib/billing/billing.repository";
import { getDomesticBillingConfig } from "@/src/lib/billing/billing-config";
import { cancelPendingBillingJobs } from "@/src/lib/billing/billing-charge-queue.repository";
import { appendBillingEvent } from "@/src/lib/billing/billing-event.repository";
import {
  beginBillingRefund,
  completeBillingRefund,
  failBillingRefund,
  listRefundablePayments
} from "@/src/lib/billing/billing-refund.repository";
import { PortOneKcpV1Adapter } from "@/src/lib/billing/portone/kcp-v1.adapter";
import { PortOneKpnV2Adapter } from "@/src/lib/billing/portone/kpn-v2.adapter";
import { endDomesticSubscription } from "@/src/lib/billing/subscription.repository";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

const refundSchema = z.object({
  provider: z.enum(["portone_kpn_v2", "portone_kcp_v1"]),
  providerPaymentId: z.string().min(8).max(200),
  amount: z.number().int().positive(),
  reason: z.string().trim().min(3).max(200),
  confirmation: z.string().max(240)
}).strict();

export async function GET(request: Request) {
  await requireAdminContext(request);
  return NextResponse.json({ ok: true, payments: await listRefundablePayments() });
}

export async function POST(request: Request) {
  let refundRequestId: string | null = null;
  let providerCompleted = false;
  try {
    assertSameOriginMutation(request);
    const admin = await requireAdminContext(request);
    const input = refundSchema.parse(await request.json());
    if (input.confirmation !== `REFUND ${input.providerPaymentId}`) {
      return NextResponse.json({ ok: false, error: `REFUND ${input.providerPaymentId}를 정확히 입력하세요.` }, { status: 409 });
    }
    const begun = await beginBillingRefund({
      provider: input.provider,
      providerPaymentId: input.providerPaymentId,
      amount: input.amount,
      reason: input.reason,
      requestedBy: admin.uid
    });
    refundRequestId = begun.request.id;
    if (begun.duplicate) {
      if (begun.request.status === "succeeded") {
        return NextResponse.json({ ok: true, duplicate: true, refund: begun.request });
      }
      return NextResponse.json({ ok: false, error: "동일한 환불 요청이 이미 처리 중입니다." }, { status: 409 });
    }
    const config = getDomesticBillingConfig();
    if (config.mode !== "live") {
      throw new Error("Refunds are available only in live billing mode.");
    }
    const adapter = input.provider === "portone_kcp_v1"
      ? new PortOneKcpV1Adapter(config)
      : new PortOneKpnV2Adapter(config);
    const result = await adapter.refundPayment({
      providerPaymentId: input.providerPaymentId,
      amount: input.amount,
      reason: input.reason,
      environment: "live"
    });
    const refund = await completeBillingRefund(begun.request.id, {
      providerRefundId: result.providerRefundId,
      status: result.status === "succeeded" ? "succeeded" : "pending_provider"
    });
    providerCompleted = true;
    if (result.status === "pending") {
      return NextResponse.json({ ok: true, pending: true, refund }, { status: 202 });
    }

    const occurredAt = new Date().toISOString();
    const eventId = `refund:${input.provider}:${result.providerRefundId}`;
    await appendBillingEvent({
      ownerId: begun.attempt!.ownerId,
      provider: input.provider,
      environment: "live",
      eventType: "refund_confirmed",
      idempotencyKey: eventId,
      amount: result.amount,
      currency: "KRW",
      occurredAt,
      safeMetadata: { paymentAttemptId: begun.attempt!.id, providerPaymentId: input.providerPaymentId }
    });
    const subscriptionId = String(begun.attempt!.safeMetadata.subscriptionId || "");
    if (result.amount >= begun.attempt!.expectedAmount && subscriptionId) {
      await endDomesticSubscription(subscriptionId, begun.attempt!.ownerId);
      await cancelPendingBillingJobs(subscriptionId);
      await applyDomesticRefund({
        eventId,
        ownerId: begun.attempt!.ownerId,
        subscriptionId,
        occurredAt
      });
    }
    await appendAdminAuditEvent({
      actorAccountId: admin.uid,
      targetAccountId: begun.attempt!.ownerId,
      action: "billing.refund",
      safeMetadata: {
        provider: input.provider,
        providerPaymentId: input.providerPaymentId,
        amount: result.amount,
        refundRequestId: refund.id
      }
    });
    return NextResponse.json({ ok: true, refund });
  } catch (error) {
    if (refundRequestId && !providerCompleted) {
      await failBillingRefund(refundRequestId, "The payment provider could not complete the refund.").catch(() => undefined);
    }
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400;
    return NextResponse.json({ ok: false, error: "환불을 완료하지 못했습니다." }, { status });
  }
}
