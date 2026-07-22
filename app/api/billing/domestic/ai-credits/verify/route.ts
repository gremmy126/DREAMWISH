import { NextResponse } from "next/server";
import { OwnerContextError, requireOwnerContext } from "@/src/lib/auth/owner-context";
import { creditPurchase, getTierBalance } from "@/src/lib/billing/ai-credit-ledger";
import {
  getPurchase,
  markPurchaseCredited,
  markPurchasePaid
} from "@/src/lib/billing/ai-credit-purchase.repository";
import { verifyDomesticPayment } from "@/src/lib/billing/domestic-payment.service";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

// Verifies a KPN general payment and credits the purchased tier exactly once.
// The whole flow is idempotent: duplicate client verification or webhook retry
// returns the already-credited result without granting more credits. Sandbox
// attempts are verified but never mint live credits.
export async function POST(request: Request) {
  try {
    assertSameOriginMutation(request);
    const owner = await requireOwnerContext(request);
    const body = (await request.json().catch(() => ({}))) as {
      attemptId?: unknown;
      providerPaymentId?: unknown;
      purchaseId?: unknown;
    };
    const attemptId = typeof body.attemptId === "string" ? body.attemptId : "";
    const providerPaymentId = typeof body.providerPaymentId === "string" ? body.providerPaymentId : "";
    const purchaseId = typeof body.purchaseId === "string" ? body.purchaseId : "";
    if (!attemptId || !providerPaymentId || !purchaseId) {
      return NextResponse.json({ ok: false, error: "결제 확인에 필요한 정보가 없습니다." }, { status: 400 });
    }

    const purchase = await getPurchase(owner.uid, purchaseId);
    if (!purchase) {
      return NextResponse.json({ ok: false, error: "구매 내역을 찾을 수 없습니다." }, { status: 404 });
    }
    if (purchase.paymentAttemptId !== attemptId) {
      return NextResponse.json({ ok: false, error: "결제 정보가 일치하지 않습니다." }, { status: 400 });
    }

    // Already credited: return the current balance without re-crediting.
    if (purchase.status === "credited") {
      const balance = await getTierBalance(owner.uid, purchase.tierId);
      return NextResponse.json({
        ok: true,
        credited: true,
        isTest: purchase.environment !== "live",
        tierId: purchase.tierId,
        creditsGranted: purchase.creditsGranted,
        balance
      });
    }

    // Verifies owner, provider payment id, exact amount, currency, and channel.
    // A forged amount/tier/owner is rejected here before any credit is granted.
    await verifyDomesticPayment({ ownerId: owner.uid, attemptId, providerPaymentId });

    if (purchase.status === "pending") {
      await markPurchasePaid(owner.uid, purchaseId, providerPaymentId);
    }

    // Sandbox verification is a labeled test and never mints live credits.
    if (purchase.environment !== "live") {
      return NextResponse.json({
        ok: true,
        credited: false,
        isTest: true,
        tierId: purchase.tierId,
        creditsGranted: purchase.creditsGranted,
        message: "테스트 결제가 확인되었습니다. 실제 크레딧은 지급되지 않습니다."
      });
    }

    // Live: grant credits exactly once, then mark the purchase credited.
    const { balance } = await creditPurchase(owner.uid, {
      tierId: purchase.tierId,
      credits: purchase.creditsGranted,
      correlationId: purchase.id,
      idempotencyKey: `purchase:${purchase.id}`,
      actorId: owner.uid,
      reason: "AI credit purchase"
    });
    await markPurchaseCredited(owner.uid, purchaseId);

    return NextResponse.json({
      ok: true,
      credited: true,
      isTest: false,
      tierId: purchase.tierId,
      creditsGranted: purchase.creditsGranted,
      balance
    });
  } catch (error) {
    if (error instanceof OwnerContextError) {
      return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: "결제 확인에 실패했습니다." }, { status: 400 });
  }
}
