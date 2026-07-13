export type BillingStatus =
  | "none"
  | "checkout_pending"
  | "active"
  | "past_due"
  | "canceled"
  | "revoked";

export type BillingEntitlement = {
  ownerId: string;
  status: BillingStatus;
  polarCustomerId: string | null;
  polarSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  lastEventId: string | null;
  lastEventAt: string | null;
  updatedAt: string;
};

export function emptyBillingEntitlement(ownerId: string): BillingEntitlement {
  return {
    ownerId,
    status: "none",
    polarCustomerId: null,
    polarSubscriptionId: null,
    currentPeriodEnd: null,
    lastEventId: null,
    lastEventAt: null,
    updatedAt: new Date(0).toISOString()
  };
}
