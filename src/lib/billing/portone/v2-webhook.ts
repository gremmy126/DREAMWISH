import { Webhook } from "@portone/server-sdk";
import type { BillingEnvironment } from "../billing-gateway.types";
import type { NormalizedBillingWebhook } from "../billing-webhook.repository";

export async function verifyPortOneV2Webhook(input: {
  secret: string;
  rawBody: string;
  headers: Record<string, string | string[] | undefined>;
}) {
  return Webhook.verify(input.secret, input.rawBody, input.headers);
}

export function normalizePortOneV2Webhook(
  webhook: Record<string, any>,
  environment: BillingEnvironment,
  eventKey?: string
): NormalizedBillingWebhook | null {
  const paymentId = webhook?.data?.paymentId;
  if (!paymentId || !String(webhook.type || "").startsWith("Transaction.")) return null;
  const occurredAt = validDate(webhook.timestamp) || new Date().toISOString();
  return {
    provider: "portone_kpn_v2",
    environment,
    eventKey: eventKey || `${String(webhook.type)}:${String(paymentId)}:${occurredAt}`,
    providerPaymentId: String(paymentId),
    occurredAt,
    safePayload: { type: String(webhook.type) }
  };
}

function validDate(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

