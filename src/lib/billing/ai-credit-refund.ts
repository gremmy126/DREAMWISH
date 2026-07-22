import type { TierBalance } from "./ai-credit-ledger";
import type { AICreditPurchase } from "./ai-credit-purchase.repository";

// Refund safety for prepaid AI credits. An automatic full refund is allowed
// only when the purchase's entire grant is still unspent on its tier: the tier
// has no consumed credits and the full granted amount is still available.
// Consumed, partially spent, later-mixed, or non-live purchases are never
// auto-refunded — they require administrator review so the system does not
// invent a partial monetary value.

export type AICreditRefundEvaluation = {
  eligible: boolean;
  requiresReview: boolean;
  reason: string;
};

export function evaluateAiCreditRefund(
  purchase: Pick<AICreditPurchase, "status" | "environment" | "providerPaymentId" | "creditsGranted">,
  balance: TierBalance
): AICreditRefundEvaluation {
  if (purchase.status === "refunded") {
    return { eligible: false, requiresReview: false, reason: "이미 환불된 구매입니다." };
  }
  if (purchase.status !== "credited") {
    return { eligible: false, requiresReview: false, reason: "적립이 완료된 구매만 환불할 수 있습니다." };
  }
  if (purchase.environment !== "live") {
    return { eligible: false, requiresReview: false, reason: "테스트 결제는 환불 대상이 아닙니다." };
  }
  if (!purchase.providerPaymentId) {
    return { eligible: false, requiresReview: false, reason: "결제 식별자가 없어 환불할 수 없습니다." };
  }
  if (balance.consumed > 0) {
    return {
      eligible: false,
      requiresReview: true,
      reason: "이미 사용한 크레딧이 있어 자동 환불 대신 관리자 검토가 필요합니다."
    };
  }
  if (balance.reserved > 0) {
    return {
      eligible: false,
      requiresReview: true,
      reason: "진행 중인 사용이 있어 잠시 후 다시 시도하거나 관리자 검토가 필요합니다."
    };
  }
  if (balance.available < purchase.creditsGranted) {
    return {
      eligible: false,
      requiresReview: true,
      reason: "구매한 크레딧이 전액 남아 있지 않아 관리자 검토가 필요합니다."
    };
  }
  return { eligible: true, requiresReview: false, reason: "" };
}
