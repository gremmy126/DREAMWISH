import {
  mutateOwnerDocument,
  readOwnerDocument
} from "../db/owner-document-store";
import { hasPostgresStorage } from "../db/postgres";
import {
  readJsonStore,
  withJsonStoreLock,
  writeJsonStore
} from "../local-db/json-store";
import { statusFromPolarEvent } from "./billing-event";
import {
  emptyBillingEntitlement,
  type BillingEntitlement
} from "./billing.types";

const BILLING_NAMESPACE = "billing-entitlement";
const BILLING_FILE = "billing-entitlements.json";

type BillingDb = { entitlements: BillingEntitlement[] };

export async function getBillingEntitlement(ownerId: string) {
  if (hasPostgresStorage()) {
    return normalizeEntitlement(
      await readOwnerDocument(
        ownerId,
        BILLING_NAMESPACE,
        emptyBillingEntitlement(ownerId)
      ),
      ownerId
    );
  }
  const db = await readJsonStore<BillingDb>(BILLING_FILE, { entitlements: [] });
  return normalizeEntitlement(
    db.entitlements.find((item) => item.ownerId === ownerId) ||
      emptyBillingEntitlement(ownerId),
    ownerId
  );
}

export async function markCheckoutPending(ownerId: string) {
  return updateBillingEntitlement(ownerId, (current) => ({
    ...current,
    status: current.status === "active" ? "active" : "checkout_pending",
    updatedAt: new Date().toISOString()
  }));
}

export async function applyPolarBillingEvent(input: {
  eventId: string;
  eventType: string;
  ownerId: string;
  occurredAt: string;
  polarCustomerId?: string | null;
  polarSubscriptionId?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: string | null;
  endsAt?: string | null;
}) {
  return updateBillingEntitlement(input.ownerId, (current) => {
    if (current.lastEventId === input.eventId) return current;
    if (
      current.lastEventAt &&
      new Date(current.lastEventAt).getTime() > new Date(input.occurredAt).getTime()
    ) {
      return current;
    }
    return {
      ...current,
      status: statusFromPolarEvent(input.eventType, current.status),
      polarCustomerId: input.polarCustomerId || current.polarCustomerId,
      polarSubscriptionId:
        input.polarSubscriptionId || current.polarSubscriptionId,
      currentPeriodEnd: input.currentPeriodEnd ?? current.currentPeriodEnd,
      cancelAtPeriodEnd:
        input.cancelAtPeriodEnd ?? current.cancelAtPeriodEnd,
      canceledAt:
        input.canceledAt === undefined ? current.canceledAt : input.canceledAt,
      endsAt: input.endsAt === undefined ? current.endsAt : input.endsAt,
      lastEventId: input.eventId,
      lastEventAt: input.occurredAt,
      updatedAt: new Date().toISOString()
    };
  });
}

async function updateBillingEntitlement(
  ownerId: string,
  update: (current: BillingEntitlement) => BillingEntitlement
) {
  if (hasPostgresStorage()) {
    return mutateOwnerDocument(
      ownerId,
      BILLING_NAMESPACE,
      emptyBillingEntitlement(ownerId),
      (stored) => {
        const next = update(normalizeEntitlement(stored, ownerId));
        Object.assign(stored, next);
        return next;
      }
    );
  }

  return withJsonStoreLock(BILLING_FILE, async () => {
    const db = await readJsonStore<BillingDb>(BILLING_FILE, { entitlements: [] });
    const current = normalizeEntitlement(
      db.entitlements.find((item) => item.ownerId === ownerId) ||
        emptyBillingEntitlement(ownerId),
      ownerId
    );
    const next = update(current);
    db.entitlements = [
      next,
      ...db.entitlements.filter((item) => item.ownerId !== ownerId)
    ];
    await writeJsonStore(BILLING_FILE, db);
    return next;
  });
}

function normalizeEntitlement(
  value: BillingEntitlement,
  ownerId: string
): BillingEntitlement {
  const fallback = emptyBillingEntitlement(ownerId);
  return {
    ...fallback,
    ...value,
    ownerId,
    status: isBillingStatus(value.status) ? value.status : "none"
  };
}

function isBillingStatus(value: unknown): value is BillingEntitlement["status"] {
  return [
    "none",
    "checkout_pending",
    "active",
    "past_due",
    "canceled",
    "revoked"
  ].includes(String(value));
}
