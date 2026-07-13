import { createHash } from "node:crypto";

export type NormalizedPolarBillingEvent = {
  eventId: string;
  eventType: string;
  ownerId: string;
  occurredAt: string;
  polarCustomerId: string | null;
  polarSubscriptionId: string | null;
  currentPeriodEnd: string | null;
};

export function extractPolarBillingEvent(
  payload: unknown
): NormalizedPolarBillingEvent | null {
  if (!isRecord(payload) || !isRecord(payload.data)) return null;
  const data = payload.data;
  const customer = isRecord(data.customer) ? data.customer : {};
  const ownerId =
    readString(customer, "externalId", "external_id") ||
    readString(data, "externalCustomerId", "external_customer_id");
  if (!ownerId) return null;

  const rawType = readString(payload, "type").toLowerCase();
  const eventType = normalizeStateEventType(rawType, data);
  const occurredAt = normalizeDate(
    readString(payload, "timestamp", "createdAt", "created_at") ||
      readString(data, "modifiedAt", "modified_at")
  );
  const eventId =
    readString(payload, "id", "eventId", "event_id") ||
    createHash("sha256").update(stableJson(payload)).digest("hex");

  return {
    eventId,
    eventType,
    ownerId,
    occurredAt,
    polarCustomerId:
      readString(customer, "id") ||
      readString(data, "customerId", "customer_id") ||
      null,
    polarSubscriptionId:
      (rawType.startsWith("subscription.") ? readString(data, "id") : "") ||
      readString(data, "subscriptionId", "subscription_id") ||
      null,
    currentPeriodEnd:
      readString(
        data,
        "currentPeriodEnd",
        "current_period_end",
        "endsAt",
        "ends_at"
      ) || null
  };
}

function normalizeStateEventType(type: string, data: Record<string, unknown>) {
  if (type === "customer.state_changed") {
    const active = readArray(data, "activeSubscriptions", "active_subscriptions");
    return active.length > 0 ? "subscription.active" : "subscription.canceled";
  }
  if (type === "subscription.updated") {
    const status = readString(data, "status").toLowerCase();
    if (status === "active" || status === "trialing") return "subscription.active";
    if (status === "past_due") return "subscription.past_due";
    if (status === "canceled" || status === "revoked") {
      return `subscription.${status}`;
    }
  }
  return type;
}

function readString(source: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function readArray(source: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (Array.isArray(source[key])) return source[key] as unknown[];
  }
  return [];
}

function normalizeDate(value: string) {
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function stableJson(value: unknown) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortValue(value[key])])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
