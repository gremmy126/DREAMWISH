export type BillingStatus =
  | "none"
  | "checkout_pending"
  | "active"
  | "past_due"
  | "canceled"
  | "revoked";

export type BillingEntitlement = {
  ownerId: string;
  provider: BillingProvider | null;
  environment: BillingEnvironment | null;
  status: BillingStatus;
  customerId: string | null;
  subscriptionId: string | null;
  polarCustomerId: string | null;
  polarSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  endsAt: string | null;
  lastEventId: string | null;
  lastEventAt: string | null;
  updatedAt: string;
};

export function emptyBillingEntitlement(ownerId: string): BillingEntitlement {
  return {
    ownerId,
    provider: null,
    environment: null,
    status: "none",
    customerId: null,
    subscriptionId: null,
    polarCustomerId: null,
    polarSubscriptionId: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    endsAt: null,
    lastEventId: null,
    lastEventAt: null,
    updatedAt: new Date(0).toISOString()
  };
}
import type { BillingEnvironment, BillingProvider } from "./billing-gateway.types";
