import { randomUUID } from "node:crypto";
import { CREDITS_PER_PRODUCT, type AIModelTierId } from "../ai/ai-model-catalog";
import { mutateOwnerDocument, readOwnerDocument } from "../db/owner-document-store";

// Immutable record of one KPN AI-credit purchase intent and its outcome. The
// price and credit grant are snapshotted at intent time so a later price change
// can never alter a settled purchase, and a paid attempt credits the ledger
// exactly once (status advances pending -> paid -> credited).

export const AI_CREDIT_PURCHASE_NAMESPACE = "ai.credit.purchases.v1";
export const MIN_PURCHASE_QUANTITY = 1;
export const MAX_PURCHASE_QUANTITY = 100;
export const CHECKOUT_EXPIRY_MS = 10 * 60_000;

export type AICreditPurchaseStatus =
  | "pending"
  | "paid"
  | "credited"
  | "refund_pending"
  | "refunded"
  | "failed";

export type AICreditPurchase = {
  id: string;
  ownerId: string;
  tierId: AIModelTierId;
  quantity: number;
  creditsGranted: number;
  unitPriceKrw: number;
  totalAmountKrw: number;
  currency: "KRW";
  priceVersion: string;
  environment: "sandbox" | "live";
  paymentAttemptId: string;
  providerPaymentId: string | null;
  status: AICreditPurchaseStatus;
  checkoutExpiresAt: string;
  createdAt: string;
  paidAt: string | null;
  creditedAt: string | null;
  refundedAt: string | null;
};

type PurchaseDocument = { purchases: AICreditPurchase[] };

export class AICreditPurchaseError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "AICreditPurchaseError";
    this.code = code;
  }
}

/**
 * Validates a purchase quantity and computes its credit grant and KRW total
 * using only safe integer arithmetic. The client never supplies the price or
 * the total; both derive from the server-owned unit price here.
 */
export function computePurchaseAmounts(
  quantity: number,
  unitPriceKrw: number
): { credits: number; total: number } {
  if (!Number.isInteger(quantity) || quantity < MIN_PURCHASE_QUANTITY || quantity > MAX_PURCHASE_QUANTITY) {
    throw new AICreditPurchaseError(
      "AI_CREDIT_QUANTITY_INVALID",
      `수량은 ${MIN_PURCHASE_QUANTITY}~${MAX_PURCHASE_QUANTITY} 사이의 정수여야 합니다.`
    );
  }
  if (!Number.isSafeInteger(unitPriceKrw) || unitPriceKrw <= 0) {
    throw new AICreditPurchaseError("AI_CREDIT_PRICE_INVALID", "단가가 올바르지 않습니다.");
  }
  const credits = quantity * CREDITS_PER_PRODUCT;
  const total = quantity * unitPriceKrw;
  if (!Number.isSafeInteger(credits) || !Number.isSafeInteger(total)) {
    throw new AICreditPurchaseError("AI_CREDIT_AMOUNT_UNSAFE", "결제 금액 계산이 안전하지 않습니다.");
  }
  return { credits, total };
}

const PURCHASE_TRANSITIONS: Record<AICreditPurchaseStatus, AICreditPurchaseStatus[]> = {
  pending: ["paid", "failed"],
  paid: ["credited", "refund_pending"],
  credited: ["refund_pending"],
  refund_pending: ["refunded", "credited"],
  refunded: [],
  failed: []
};

export function canTransitionPurchase(from: AICreditPurchaseStatus, to: AICreditPurchaseStatus): boolean {
  return PURCHASE_TRANSITIONS[from]?.includes(to) ?? false;
}

function emptyDocument(): PurchaseDocument {
  return { purchases: [] };
}

export async function createPurchaseIntent(
  ownerId: string,
  input: {
    tierId: AIModelTierId;
    quantity: number;
    unitPriceKrw: number;
    priceVersion: string;
    environment: "sandbox" | "live";
    paymentAttemptId: string;
    now?: () => Date;
  }
): Promise<AICreditPurchase> {
  const { credits, total } = computePurchaseAmounts(input.quantity, input.unitPriceKrw);
  const now = input.now?.() || new Date();
  const purchase: AICreditPurchase = {
    id: randomUUID(),
    ownerId,
    tierId: input.tierId,
    quantity: input.quantity,
    creditsGranted: credits,
    unitPriceKrw: input.unitPriceKrw,
    totalAmountKrw: total,
    currency: "KRW",
    priceVersion: input.priceVersion,
    environment: input.environment,
    paymentAttemptId: input.paymentAttemptId,
    providerPaymentId: null,
    status: "pending",
    checkoutExpiresAt: new Date(now.getTime() + CHECKOUT_EXPIRY_MS).toISOString(),
    createdAt: now.toISOString(),
    paidAt: null,
    creditedAt: null,
    refundedAt: null
  };
  await mutateOwnerDocument<PurchaseDocument, void>(
    ownerId,
    AI_CREDIT_PURCHASE_NAMESPACE,
    emptyDocument(),
    (doc) => {
      if (!Array.isArray(doc.purchases)) doc.purchases = [];
      doc.purchases.push(purchase);
    }
  );
  return purchase;
}

export async function getPurchase(ownerId: string, purchaseId: string): Promise<AICreditPurchase | null> {
  const doc = await readOwnerDocument<PurchaseDocument>(ownerId, AI_CREDIT_PURCHASE_NAMESPACE, emptyDocument());
  return doc.purchases?.find((purchase) => purchase.id === purchaseId) || null;
}

export async function listPurchases(ownerId: string): Promise<AICreditPurchase[]> {
  const doc = await readOwnerDocument<PurchaseDocument>(ownerId, AI_CREDIT_PURCHASE_NAMESPACE, emptyDocument());
  return [...(doc.purchases || [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function transition(
  ownerId: string,
  purchaseId: string,
  to: AICreditPurchaseStatus,
  patch: (purchase: AICreditPurchase) => void
): Promise<AICreditPurchase> {
  return mutateOwnerDocument<PurchaseDocument, AICreditPurchase>(
    ownerId,
    AI_CREDIT_PURCHASE_NAMESPACE,
    emptyDocument(),
    (doc) => {
      const purchase = doc.purchases?.find((item) => item.id === purchaseId);
      if (!purchase) throw new AICreditPurchaseError("AI_CREDIT_PURCHASE_NOT_FOUND", "구매 내역을 찾을 수 없습니다.");
      if (purchase.status === to) return purchase; // idempotent
      if (!canTransitionPurchase(purchase.status, to)) {
        throw new AICreditPurchaseError(
          "AI_CREDIT_PURCHASE_TRANSITION_INVALID",
          `구매 상태를 ${purchase.status}에서 ${to}로 바꿀 수 없습니다.`
        );
      }
      purchase.status = to;
      patch(purchase);
      return purchase;
    }
  );
}

export function markPurchasePaid(
  ownerId: string,
  purchaseId: string,
  providerPaymentId: string,
  now: () => Date = () => new Date()
): Promise<AICreditPurchase> {
  return transition(ownerId, purchaseId, "paid", (purchase) => {
    purchase.providerPaymentId = providerPaymentId;
    purchase.paidAt = now().toISOString();
  });
}

export function markPurchaseCredited(
  ownerId: string,
  purchaseId: string,
  now: () => Date = () => new Date()
): Promise<AICreditPurchase> {
  return transition(ownerId, purchaseId, "credited", (purchase) => {
    purchase.creditedAt = now().toISOString();
  });
}

export function markPurchaseFailed(ownerId: string, purchaseId: string): Promise<AICreditPurchase> {
  return transition(ownerId, purchaseId, "failed", () => undefined);
}

export function markPurchaseRefundPending(ownerId: string, purchaseId: string): Promise<AICreditPurchase> {
  return transition(ownerId, purchaseId, "refund_pending", () => undefined);
}

export function markPurchaseRefunded(
  ownerId: string,
  purchaseId: string,
  now: () => Date = () => new Date()
): Promise<AICreditPurchase> {
  return transition(ownerId, purchaseId, "refunded", (purchase) => {
    purchase.refundedAt = now().toISOString();
  });
}

/** Rolls a refund back to credited when the provider refund could not complete. */
export function restorePurchaseFromRefund(ownerId: string, purchaseId: string): Promise<AICreditPurchase> {
  return transition(ownerId, purchaseId, "credited", () => undefined);
}
