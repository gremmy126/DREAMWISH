import type { PolarWebhookEvent } from "@/src/lib/payments/polar.service";
import { markAccountPaid } from "@/src/lib/auth/account.repository";
import { readJsonStore, writeJsonStore } from "@/src/lib/local-db/json-store";

type PaymentDb = {
  polarWebhookEvents: PolarWebhookEvent[];
};

const PAYMENT_DB_FILE = "payments.json";
const EMPTY_DB: PaymentDb = { polarWebhookEvents: [] };

export async function recordPolarWebhookEvent(event: PolarWebhookEvent) {
  const db = await readDb();
  db.polarWebhookEvents.unshift(event);
  await writeDb(db);

  const paidEmail = extractPaidCustomerEmail(event);
  if (isPaidPolarEvent(event.type) && paidEmail) {
    await markAccountPaid({
      email: paidEmail,
      externalCustomerId: String(event.data.external_customer_id || "")
    });
  }

  return event;
}

export async function listPolarWebhookEvents() {
  return (await readDb()).polarWebhookEvents;
}

function isPaidPolarEvent(type: string) {
  return /(?:checkout|order|subscription).*(?:paid|active|created|succeeded)/iu.test(type);
}

function extractPaidCustomerEmail(event: PolarWebhookEvent) {
  const data = event.data || {};
  const customer = data.customer as { email?: unknown } | undefined;
  const metadata = data.metadata as { customer_email?: unknown; email?: unknown } | undefined;

  return (
    stringOrNull(data.customer_email) ||
    stringOrNull(customer?.email) ||
    stringOrNull(metadata?.customer_email) ||
    stringOrNull(metadata?.email) ||
    stringOrNull(data.external_customer_id)
  );
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value.includes("@") ? value : null;
}

async function readDb() {
  const db = await readJsonStore<PaymentDb>(PAYMENT_DB_FILE, EMPTY_DB);
  return {
    polarWebhookEvents: Array.isArray(db.polarWebhookEvents) ? db.polarWebhookEvents : []
  };
}

async function writeDb(db: PaymentDb) {
  await writeJsonStore(PAYMENT_DB_FILE, db);
}
