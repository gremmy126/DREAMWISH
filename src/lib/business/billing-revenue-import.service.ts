import { hasPostgresStorage } from "../db/postgres";
import { listBillingEvents } from "../billing/billing-event.repository";
import { createConfirmedRevenueFromBilling } from "./revenue.repository";

export async function importBillingRevenueForOwner(ownerId: string) {
  if (!hasPostgresStorage()) return [];
  const events = await listBillingEvents(ownerId, "payment_confirmed");
  const imported = [];
  for (const row of events) {
    const environment = String(row.environment || "");
    if (environment !== "live") continue;
    const amount = Number(row.amount);
    if (!Number.isSafeInteger(amount) || amount < 1 || String(row.currency) !== "KRW") continue;
    const metadata = (row.safe_metadata || {}) as Record<string, unknown>;
    imported.push(await createConfirmedRevenueFromBilling({
      ownerId,
      eventId: String(row.idempotency_key),
      provider: String(row.provider || "domestic-billing"),
      amount,
      currency: "KRW",
      paidAt: new Date(row.occurred_at as Date | string).toISOString(),
      orderName: String(metadata.orderName || "DREAMWISH 결제")
    }));
  }
  return imported;
}
