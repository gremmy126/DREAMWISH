import assert from "node:assert/strict";
import fs from "node:fs";

test("revenue persistence uses PostgreSQL with encrypted raw text, fingerprints, and append-only audit", () => {
  const schema = fs.readFileSync("src/lib/business/revenue.schema.ts", "utf8");
  const repository = fs.readFileSync("src/lib/business/revenue.repository.ts", "utf8");
  assert.match(schema, /revenue_candidates/u);
  assert.match(schema, /revenue_source_trust_rules/u);
  assert.match(schema, /revenue_audit_events/u);
  assert.match(schema, /owner_id, transaction_fingerprint/u);
  assert.match(repository, /hasPostgresStorage/u);
  assert.match(repository, /sealRevenueText/u);
  assert.match(repository, /appendRevenueAudit/u);
});

test("revenue review supports expense, personal, duplicate, rejection, and correction actions", () => {
  const types = fs.readFileSync("src/lib/business/revenue.types.ts", "utf8");
  const route = fs.readFileSync("app/api/business/revenue/route.ts", "utf8");
  const panel = fs.readFileSync("components/Business/RevenueReviewPanel.tsx", "utf8");
  for (const action of ["confirmed", "expense", "personal", "duplicate", "rejected"]) {
    assert.match(types + route, new RegExp(action, "u"));
  }
  assert.match(panel, /확인 대기 매출/u);
  assert.match(panel, /sourceApp/u);
  assert.match(panel, /counterpartyHint/u);
  assert.match(panel, /중복/u);
});

test("billing revenue import accepts only live confirmed payment events", () => {
  const importer = fs.readFileSync("src/lib/business/billing-revenue-import.service.ts", "utf8");
  assert.match(importer, /payment_confirmed/u);
  assert.match(importer, /environment !== "live"/u);
  assert.match(importer, /createConfirmedRevenueFromBilling/u);
});
