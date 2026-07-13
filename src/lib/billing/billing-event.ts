import type { BillingStatus } from "./billing.types";

export function statusFromPolarEvent(
  eventType: string,
  current: BillingStatus
): BillingStatus {
  const type = eventType.trim().toLowerCase();
  if (type === "subscription.active" || type === "subscription.uncanceled") {
    return "active";
  }
  if (type === "subscription.past_due") return "past_due";
  if (type === "subscription.canceled") return "canceled";
  if (
    type === "order.refunded" ||
    type === "refund.created" ||
    type === "customer.deleted" ||
    type === "subscription.revoked"
  ) {
    return "revoked";
  }
  return current;
}
