import { NextResponse } from "next/server";
import { OwnerContextError, requireOwnerContext } from "@/src/lib/auth/owner-context";
import { AICreditError, getTierBalance, holdRefundCredits } from "@/src/lib/billing/ai-credit-ledger";
import {
  getPurchase,
  markPurchaseRefundPending,
  markPurchaseRefunded,
  restorePurchaseFromRefund
} from "@/src/lib/billing/ai-credit-purchase.repository";
import { evaluateAiCreditRefund } from "@/src/lib/billing/ai-credit-refund";
import { getDomesticBillingConfig } from "@/src/lib/billing/billing-config";
import {
  beginBillingRefund,
  completeBillingRefund,
  failBillingRefund
} from "@/src/lib/billing/billing-refund.repository";
import { PortOneKpnV2Adapter } from "@/src/lib/billing/portone/kpn-v2.adapter";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

// Refund a prepaid AI credit purchase. Automatic full refund runs only when the
// full grant is still unspent (see evaluateAiCreditRefund); anything consumed,
// partial, or ambiguous is parked as refund_pending for administrator review.
// The provider money refund reuses the existing idempotent refund saga and runs
// BEFORE the credit reversal, so a provider failure never leaves credits missing.
export async function POST(request: Request) {
  let refundRequestId: string | null = null;
  let providerCompleted = false;
  let ownerId = "";
  let purchaseId = "";
  try {
    assertSameOriginMutation(request);
    const owner = await requireOwnerContext(request);
    ownerId = owner.uid;
    const body = (await request.json().catch(() => ({}))) as { purchaseId?: unknown };
    purchaseId = typeof body.purchaseId === "string" ? body.purchaseId : "";
    if (!purchaseId) {
      return NextResponse.json({ ok: false, error: "환불할 구매를 지정해주세요." }, { status: 400 });
    }

    const purchase = await getPurchase(owner.uid, purchaseId);
    if (!purchase) {
      return NextResponse.json({ ok: false, error: "구매 내역을 찾을 수 없습니다." }, { status: 404 });
    }
    if (purchase.status === "refunded") {
      return NextResponse.json({ ok: true, refunded: true, alreadyRefunded: true });
    }

    const balance = await getTierBalance(owner.uid, purchase.tierId);
    const evaluation = evaluateAiCreditRefund(purchase, balance);
    if (!evaluation.eligible) {
      if (evaluation.requiresReview && purchase.status === "credited") {
        await markPurchaseRefundPending(owner.uid, purchaseId);
      }
      return NextResponse.json({
        ok: true,
        refunded: false,
        requiresReview: evaluation.requiresReview,
        reason: evaluation.reason
      });
    }

    await markPurchaseRefundPending(owner.uid, purchaseId);

    const begun = await beginBillingRefund({
      provider: "portone_kpn_v2",
      providerPaymentId: purchase.providerPaymentId!,
      amount: purchase.totalAmountKrw,
      reason: "AI credit refund",
      requestedBy: owner.uid
    });
    refundRequestId = begun.request.id;
    if (begun.duplicate) {
      if (begun.request.status !== "succeeded") {
        return NextResponse.json({ ok: false, error: "동일한 환불 요청이 이미 처리 중입니다." }, { status: 409 });
      }
      // Money already refunded on a previous attempt: reverse the credits and
      // finalize (both steps are idempotent).
      await reverseCreditsAndFinalize(owner.uid, purchaseId, purchase);
      return NextResponse.json({ ok: true, refunded: true, duplicate: true });
    }

    const config = getDomesticBillingConfig();
    if (config.mode !== "live") {
      throw new Error("Refunds are available only in live billing mode.");
    }
    const result = await new PortOneKpnV2Adapter(config).refundPayment({
      providerPaymentId: purchase.providerPaymentId!,
      amount: purchase.totalAmountKrw,
      reason: "AI credit refund",
      environment: "live"
    });
    await completeBillingRefund(begun.request.id, {
      providerRefundId: result.providerRefundId,
      status: result.status === "succeeded" ? "succeeded" : "pending_provider"
    });
    providerCompleted = true;
    if (result.status === "pending") {
      return NextResponse.json({ ok: true, refunded: false, pending: true }, { status: 202 });
    }

    const finalize = await reverseCreditsAndFinalize(owner.uid, purchaseId, purchase);
    return NextResponse.json({ ok: true, refunded: true, ...finalize });
  } catch (error) {
    if (refundRequestId && !providerCompleted) {
      await failBillingRefund(refundRequestId, "The payment provider could not complete the refund.").catch(
        () => undefined
      );
      if (ownerId && purchaseId) {
        // Provider refund never happened; roll the purchase back to credited.
        await restorePurchaseFromRefund(ownerId, purchaseId).catch(() => undefined);
      }
    }
    if (error instanceof OwnerContextError) {
      return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: "환불을 완료하지 못했습니다." }, { status: 400 });
  }
}

async function reverseCreditsAndFinalize(
  ownerId: string,
  purchaseId: string,
  purchase: { tierId: import("@/src/lib/ai/ai-model-catalog").AIModelTierId; creditsGranted: number }
): Promise<{ creditsReversed: boolean; reconciliationRequired?: boolean }> {
  try {
    await holdRefundCredits(ownerId, {
      tierId: purchase.tierId,
      amount: purchase.creditsGranted,
      correlationId: purchaseId,
      idempotencyKey: `refund:${purchaseId}`,
      actorId: ownerId,
      reason: "AI credit refund"
    });
  } catch (error) {
    // Money was refunded but the credits were spent concurrently — flag for
    // reconciliation instead of forcing a negative balance.
    if (error instanceof AICreditError) {
      return { creditsReversed: false, reconciliationRequired: true };
    }
    throw error;
  }
  await markPurchaseRefunded(ownerId, purchaseId);
  return { creditsReversed: true };
}
