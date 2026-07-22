import assert from "node:assert/strict";
import fs from "node:fs";
import {
  AICreditError,
  applyLedgerEntry,
  buildPurchaseEntry,
  buildReleaseEntry,
  buildReserveEntry,
  buildRefundEntry,
  buildSettleEntry,
  emptyLedgerDocument,
  readTierBalance,
  type LedgerDocument
} from "../src/lib/billing/ai-credit-ledger";

const TIER = "claude-sonnet" as const;

function entryInput(key: string) {
  return { tierId: TIER, correlationId: `corr-${key}`, idempotencyKey: key, actorId: "owner-1" };
}

function apply(doc: LedgerDocument, entry: ReturnType<typeof buildPurchaseEntry>, dedupe = false) {
  return applyLedgerEntry(doc, entry, { dedupe });
}

test("a purchase adds available credits", () => {
  const { doc, balance } = apply(
    emptyLedgerDocument(),
    buildPurchaseEntry({ ...entryInput("p1"), credits: 1_000_000 }),
    true
  );
  assert.deepEqual(balance, { available: 1_000_000, reserved: 0, consumed: 0 });
  assert.deepEqual(readTierBalance(doc, TIER), balance);
});

test("a reservation moves credits from available to reserved and rejects overspend", () => {
  const purchased = apply(emptyLedgerDocument(), buildPurchaseEntry({ ...entryInput("p1"), credits: 1_000 }), true).doc;
  const reserved = apply(purchased, buildReserveEntry({ ...entryInput("r1"), amount: 400 }));
  assert.deepEqual(reserved.balance, { available: 600, reserved: 400, consumed: 0 });

  assert.throws(
    () => apply(reserved.doc, buildReserveEntry({ ...entryInput("r2"), amount: 700 })),
    (error: unknown) =>
      error instanceof AICreditError && error.code === "AI_CREDIT_INSUFFICIENT"
  );
});

test("settlement clears the reservation, consumes usage, and returns the unused remainder", () => {
  let doc = apply(emptyLedgerDocument(), buildPurchaseEntry({ ...entryInput("p1"), credits: 1_000_000 }), true).doc;
  doc = apply(doc, buildReserveEntry({ ...entryInput("r1"), amount: 500 })).doc;
  const settled = apply(doc, buildSettleEntry({ ...entryInput("s1"), reserved: 500, usage: 320 }));
  assert.deepEqual(settled.balance, { available: 999_680, reserved: 0, consumed: 320 });
});

test("settlement never goes negative when usage exceeds a conservative reservation", () => {
  let doc = apply(emptyLedgerDocument(), buildPurchaseEntry({ ...entryInput("p1"), credits: 1_000 }), true).doc;
  doc = apply(doc, buildReserveEntry({ ...entryInput("r1"), amount: 300 })).doc;
  // Authoritative usage came in above the reservation; consumption is clamped.
  const settled = apply(doc, buildSettleEntry({ ...entryInput("s1"), reserved: 300, usage: 450 }));
  assert.deepEqual(settled.balance, { available: 700, reserved: 0, consumed: 300 });
  assert.ok(settled.balance.available >= 0 && settled.balance.reserved >= 0);
});

test("release returns the full reservation to available", () => {
  let doc = apply(emptyLedgerDocument(), buildPurchaseEntry({ ...entryInput("p1"), credits: 1_000 }), true).doc;
  doc = apply(doc, buildReserveEntry({ ...entryInput("r1"), amount: 250 })).doc;
  const released = apply(doc, buildReleaseEntry({ ...entryInput("rel1"), amount: 250 }));
  assert.deepEqual(released.balance, { available: 1_000, reserved: 0, consumed: 0 });
});

test("a purchase credit is idempotent — a duplicate key does not double-credit", () => {
  const entry = buildPurchaseEntry({ ...entryInput("dup"), credits: 1_000_000 });
  const first = apply(emptyLedgerDocument(), entry, true);
  const second = applyLedgerEntry(first.doc, entry, { dedupe: true });
  assert.equal(second.duplicate, true);
  assert.deepEqual(readTierBalance(second.doc, TIER), { available: 1_000_000, reserved: 0, consumed: 0 });
});

test("a refund hold cannot exceed available credits", () => {
  const doc = apply(emptyLedgerDocument(), buildPurchaseEntry({ ...entryInput("p1"), credits: 500 }), true).doc;
  assert.throws(
    () => applyLedgerEntry(doc, buildRefundEntry({ ...entryInput("rf1"), amount: 900 }), { dedupe: true }),
    (error: unknown) => error instanceof AICreditError && error.code === "AI_CREDIT_INSUFFICIENT"
  );
});

test("credits stay isolated per tier", () => {
  let doc = apply(emptyLedgerDocument(), buildPurchaseEntry({ ...entryInput("p1"), credits: 1_000 }), true).doc;
  doc = applyLedgerEntry(
    doc,
    buildPurchaseEntry({ tierId: "gemini-flash", correlationId: "c", idempotencyKey: "p2", actorId: "o", credits: 200 }),
    { dedupe: true }
  ).doc;
  assert.equal(readTierBalance(doc, "claude-sonnet").available, 1_000);
  assert.equal(readTierBalance(doc, "gemini-flash").available, 200);
});

test("serial application cannot overspend one balance (concurrency invariant)", () => {
  // Two reservations that individually fit but together exceed the balance:
  // folding them in sequence (as the advisory lock forces) rejects the second.
  let doc = apply(emptyLedgerDocument(), buildPurchaseEntry({ ...entryInput("p1"), credits: 1_000 }), true).doc;
  doc = apply(doc, buildReserveEntry({ ...entryInput("r1"), amount: 700 })).doc;
  assert.throws(
    () => apply(doc, buildReserveEntry({ ...entryInput("r2"), amount: 700 })),
    (error: unknown) => error instanceof AICreditError && error.code === "AI_CREDIT_INSUFFICIENT"
  );
});

test("invalid amounts are rejected before touching the balance", () => {
  assert.throws(
    () => buildPurchaseEntry({ ...entryInput("p1"), credits: -5 }),
    (error: unknown) => error instanceof AICreditError && error.code === "AI_CREDIT_INVARIANT"
  );
  assert.throws(
    () => buildReserveEntry({ ...entryInput("r1"), amount: 1.5 }),
    (error: unknown) => error instanceof AICreditError && error.code === "AI_CREDIT_INVARIANT"
  );
});

test("the ledger persists through the owner-scoped, advisory-locked document store", () => {
  const source = fs.readFileSync("src/lib/billing/ai-credit-ledger.ts", "utf8");
  assert.match(source, /mutateOwnerDocument/u);
  assert.match(source, /readOwnerDocument/u);
  assert.match(source, /ai\.credit\.ledger\.v1/u);
  assert.doesNotMatch(source, /DELETE FROM|TRUNCATE/u);
});
