import { randomUUID } from "node:crypto";
import type { AIModelTierId } from "../ai/ai-model-catalog";
import {
  mutateOwnerDocument,
  readOwnerDocument
} from "../db/owner-document-store";

// Append-only prepaid credit ledger. Balances are the financial source of
// truth and are computed per owner and tier under the document store's
// advisory transaction lock, so concurrent AI calls cannot overspend one
// balance. A purchase adds available credits; a reservation moves credits from
// available to reserved; settlement removes the full reservation, returns the
// unused portion to available, and increases consumed by authoritative usage;
// release moves the full reservation back to available. Any mutation that would
// drive available or reserved negative is rejected — never silently clamped to
// a negative balance.

export const AI_CREDIT_LEDGER_NAMESPACE = "ai.credit.ledger.v1";
const RECENT_ENTRY_CAP = 200;

export type AICreditErrorCode =
  | "AI_CREDIT_INSUFFICIENT"
  | "AI_CREDIT_INVARIANT"
  | "AI_CREDIT_RECONCILIATION_REQUIRED";

export class AICreditError extends Error {
  readonly code: AICreditErrorCode;
  readonly tierId: AIModelTierId | null;

  constructor(code: AICreditErrorCode, message: string, tierId: AIModelTierId | null = null) {
    super(message);
    this.name = "AICreditError";
    this.code = code;
    this.tierId = tierId;
  }
}

export type TierBalance = {
  available: number;
  reserved: number;
  consumed: number;
};

export type LedgerEntryKind =
  | "purchase"
  | "reserve"
  | "release"
  | "settle"
  | "refund"
  | "admin_adjustment";

export type LedgerEntry = {
  id: string;
  tierId: AIModelTierId;
  kind: LedgerEntryKind;
  availableDelta: number;
  reservedDelta: number;
  consumedDelta: number;
  correlationId: string;
  idempotencyKey: string;
  actorId: string;
  reason: string;
  createdAt: string;
};

export type LedgerDocument = {
  version: 1;
  balances: Partial<Record<AIModelTierId, TierBalance>>;
  /** Idempotency keys for must-be-once money moves (purchase, refund). */
  appliedKeys: string[];
  /** Bounded audit tail; the document-store revision history is the full log. */
  recentEntries: LedgerEntry[];
};

export function emptyLedgerDocument(): LedgerDocument {
  return { version: 1, balances: {}, appliedKeys: [], recentEntries: [] };
}

export function readTierBalance(doc: LedgerDocument, tierId: AIModelTierId): TierBalance {
  const balance = doc.balances[tierId];
  return balance ? { ...balance } : { available: 0, reserved: 0, consumed: 0 };
}

function isSafeAmount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * Applies one entry to a ledger document immutably and returns the new document
 * and resulting tier balance. Throws AICreditError when the entry would break
 * the non-negative invariant, or when a dedupe entry's key was already applied
 * (in which case the caller should treat it as an idempotent no-op).
 */
export function applyLedgerEntry(
  doc: LedgerDocument,
  entry: LedgerEntry,
  options: { dedupe?: boolean } = {}
): { doc: LedgerDocument; balance: TierBalance; duplicate: boolean } {
  if (options.dedupe && doc.appliedKeys.includes(entry.idempotencyKey)) {
    return { doc, balance: readTierBalance(doc, entry.tierId), duplicate: true };
  }

  const current = readTierBalance(doc, entry.tierId);
  const next: TierBalance = {
    available: current.available + entry.availableDelta,
    reserved: current.reserved + entry.reservedDelta,
    consumed: current.consumed + entry.consumedDelta
  };

  if (next.available < 0 || next.reserved < 0) {
    throw new AICreditError(
      "AI_CREDIT_INSUFFICIENT",
      `크레딧이 부족합니다. (${entry.tierId})`,
      entry.tierId
    );
  }
  if (next.consumed < current.consumed) {
    throw new AICreditError(
      "AI_CREDIT_INVARIANT",
      "소비 크레딧은 감소할 수 없습니다.",
      entry.tierId
    );
  }

  const balances = { ...doc.balances, [entry.tierId]: next };
  const appliedKeys = options.dedupe
    ? [...doc.appliedKeys, entry.idempotencyKey].slice(-5_000)
    : doc.appliedKeys;
  const recentEntries = [...doc.recentEntries, entry].slice(-RECENT_ENTRY_CAP);
  return {
    doc: { version: 1, balances, appliedKeys, recentEntries },
    balance: next,
    duplicate: false
  };
}

type EntryInput = {
  tierId: AIModelTierId;
  correlationId: string;
  idempotencyKey: string;
  actorId: string;
  reason?: string;
  now?: () => Date;
};

function baseEntry(kind: LedgerEntryKind, input: EntryInput): Omit<
  LedgerEntry,
  "availableDelta" | "reservedDelta" | "consumedDelta"
> {
  return {
    id: randomUUID(),
    tierId: input.tierId,
    kind,
    correlationId: input.correlationId,
    idempotencyKey: input.idempotencyKey,
    actorId: input.actorId,
    reason: input.reason || "",
    createdAt: (input.now?.() || new Date()).toISOString()
  };
}

export function buildPurchaseEntry(input: EntryInput & { credits: number }): LedgerEntry {
  if (!isSafeAmount(input.credits) || input.credits <= 0) {
    throw new AICreditError("AI_CREDIT_INVARIANT", "적립할 크레딧이 올바르지 않습니다.", input.tierId);
  }
  return { ...baseEntry("purchase", input), availableDelta: input.credits, reservedDelta: 0, consumedDelta: 0 };
}

export function buildReserveEntry(input: EntryInput & { amount: number }): LedgerEntry {
  if (!isSafeAmount(input.amount) || input.amount <= 0) {
    throw new AICreditError("AI_CREDIT_INVARIANT", "예약할 크레딧이 올바르지 않습니다.", input.tierId);
  }
  return { ...baseEntry("reserve", input), availableDelta: -input.amount, reservedDelta: input.amount, consumedDelta: 0 };
}

export function buildReleaseEntry(input: EntryInput & { amount: number }): LedgerEntry {
  if (!isSafeAmount(input.amount) || input.amount <= 0) {
    throw new AICreditError("AI_CREDIT_INVARIANT", "해제할 크레딧이 올바르지 않습니다.", input.tierId);
  }
  return { ...baseEntry("release", input), availableDelta: input.amount, reservedDelta: -input.amount, consumedDelta: 0 };
}

/**
 * Settles a reservation with authoritative usage. Consumption is clamped to the
 * reserved amount so a usage estimate that under-reserved can never drive the
 * balance negative; the unused remainder returns to available.
 */
export function buildSettleEntry(input: EntryInput & { reserved: number; usage: number }): LedgerEntry {
  if (!isSafeAmount(input.reserved) || input.reserved <= 0) {
    throw new AICreditError("AI_CREDIT_INVARIANT", "정산할 예약이 올바르지 않습니다.", input.tierId);
  }
  if (!isSafeAmount(input.usage)) {
    throw new AICreditError("AI_CREDIT_INVARIANT", "정산할 사용량이 올바르지 않습니다.", input.tierId);
  }
  const settled = Math.min(input.usage, input.reserved);
  return {
    ...baseEntry("settle", input),
    availableDelta: input.reserved - settled,
    reservedDelta: -input.reserved,
    consumedDelta: settled
  };
}

export function buildRefundEntry(input: EntryInput & { amount: number }): LedgerEntry {
  if (!isSafeAmount(input.amount) || input.amount <= 0) {
    throw new AICreditError("AI_CREDIT_INVARIANT", "환불할 크레딧이 올바르지 않습니다.", input.tierId);
  }
  return { ...baseEntry("refund", input), availableDelta: -input.amount, reservedDelta: 0, consumedDelta: 0 };
}

// ---- Store-backed operations (owner-scoped, advisory-locked, idempotent) ----

async function commitEntry(
  ownerId: string,
  entry: LedgerEntry,
  dedupe: boolean
): Promise<{ balance: TierBalance; duplicate: boolean }> {
  return mutateOwnerDocument<LedgerDocument, { balance: TierBalance; duplicate: boolean }>(
    ownerId,
    AI_CREDIT_LEDGER_NAMESPACE,
    emptyLedgerDocument(),
    (doc) => {
      const result = applyLedgerEntry(normalizeDocument(doc), entry, { dedupe });
      // mutateOwnerDocument persists the mutated `doc` object, so copy fields in.
      Object.assign(doc, result.doc);
      return { balance: result.balance, duplicate: result.duplicate };
    }
  );
}

function normalizeDocument(doc: LedgerDocument | Partial<LedgerDocument> | null): LedgerDocument {
  if (!doc || typeof doc !== "object") return emptyLedgerDocument();
  return {
    version: 1,
    balances: doc.balances || {},
    appliedKeys: Array.isArray(doc.appliedKeys) ? doc.appliedKeys : [],
    recentEntries: Array.isArray(doc.recentEntries) ? doc.recentEntries : []
  };
}

/** Credits a paid purchase exactly once (deduped by idempotency key). */
export function creditPurchase(
  ownerId: string,
  input: EntryInput & { credits: number }
): Promise<{ balance: TierBalance; duplicate: boolean }> {
  return commitEntry(ownerId, buildPurchaseEntry(input), true);
}

/** Reserves credits before a provider call. Rejects when available is short. */
export function reserveTierCredits(
  ownerId: string,
  input: EntryInput & { amount: number }
): Promise<{ balance: TierBalance; duplicate: boolean }> {
  return commitEntry(ownerId, buildReserveEntry(input), false);
}

export function settleTierReservation(
  ownerId: string,
  input: EntryInput & { reserved: number; usage: number }
): Promise<{ balance: TierBalance; duplicate: boolean }> {
  return commitEntry(ownerId, buildSettleEntry(input), false);
}

export function releaseTierReservation(
  ownerId: string,
  input: EntryInput & { amount: number }
): Promise<{ balance: TierBalance; duplicate: boolean }> {
  return commitEntry(ownerId, buildReleaseEntry(input), false);
}

/** Holds unspent credits for a refund (deduped by idempotency key). */
export function holdRefundCredits(
  ownerId: string,
  input: EntryInput & { amount: number }
): Promise<{ balance: TierBalance; duplicate: boolean }> {
  return commitEntry(ownerId, buildRefundEntry(input), true);
}

export async function getTierBalance(ownerId: string, tierId: AIModelTierId): Promise<TierBalance> {
  const doc = normalizeDocument(
    await readOwnerDocument<LedgerDocument>(ownerId, AI_CREDIT_LEDGER_NAMESPACE, emptyLedgerDocument())
  );
  return readTierBalance(doc, tierId);
}

export async function getOwnerBalances(
  ownerId: string
): Promise<Partial<Record<AIModelTierId, TierBalance>>> {
  const doc = normalizeDocument(
    await readOwnerDocument<LedgerDocument>(ownerId, AI_CREDIT_LEDGER_NAMESPACE, emptyLedgerDocument())
  );
  return doc.balances;
}
