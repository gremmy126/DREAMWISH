import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { buildBusinessSummary } from "../src/lib/business/business-workspace";

test("Business and CRM remain separate sidebar workspaces while legacy URLs return to AI Chat", async () => {
  const sidebar = await read("components/layout/Sidebar.tsx");
  const shell = await read("components/layout/AppShell.tsx");
  const types = await read("components/layout/types.ts");
  const route = await read("app/business/[[...section]]/page.tsx");

  assert.match(sidebar, /"business"/u);
  assert.match(sidebar, /\{ id: "crm"/u);
  assert.match(types, /"business"/u);
  assert.match(types, /"crm"/u);
  assert.match(shell, /case "business"/u);
  assert.match(shell, /case "crm"/u);
  assert.match(route, /permanentRedirect\("\/"\)/u);
});

test("Business tabs never write legacy routes and integrations stay in-app", async () => {
  const source = await read("components/Business/BusinessHub.tsx");

  assert.doesNotMatch(source, /history\.replaceState/u);
  assert.doesNotMatch(source, /window\.location\.assign/u);
  assert.match(source, /dreamwish:navigate/u);
});

test("Business summary distinguishes confirmed revenue from expected pipeline", () => {
  const summary = buildBusinessSummary({
    customers: [
      customer("c1", "Alpha", "active", 1_000, "2026-07-11T10:00:00.000Z"),
      customer("c2", "Alpha", "lead", 2_000, null),
      customer("c3", "Beta", "paused", 500, "2026-07-10T10:00:00.000Z")
    ],
    activities: [
      { id: "a1", customerId: "c1", type: "meeting", createdAt: "2026-07-11T01:00:00.000Z" },
      { id: "a2", customerId: "c2", type: "note", createdAt: "2026-07-11T02:00:00.000Z" }
    ],
    tasks: [
      { id: "t1", completedAt: null },
      { id: "t2", completedAt: "2026-07-10T00:00:00.000Z" }
    ],
    deals: [
      { id: "d1", stage: "won", value: 3_000, probability: 100 },
      { id: "d2", stage: "proposal", value: 2_000, probability: 50 },
      { id: "d3", stage: "lost", value: 8_000, probability: 0 }
    ],
    revenueCandidates: [
      { status: "confirmed", direction: "income", confirmedAmount: 500 },
      { status: "provisional", direction: "income", confirmedAmount: null }
    ],
    now: new Date("2026-07-11T12:00:00.000Z")
  });

  assert.deepEqual(summary, {
    customerCount: 3,
    companyCount: 2,
    activeDealCount: 1,
    expectedRevenue: 3_500,
    confirmedRevenue: 3_500,
    weightedPipeline: 1_000,
    openTaskCount: 1,
    todayMeetingCount: 1,
    followUpCustomerCount: 2
  });
});

test("Business Hub keeps business-only panels after CRM becomes a separate workspace", async () => {
  const source = await read("components/Business/BusinessHub.tsx");
  for (const section of [
    "overview",
    "erp",
    "mail",
    "cards",
    "meetings",
    "reports"
  ]) {
    assert.match(source, new RegExp(`id: "${section}"`, "u"));
  }
  // The sales/revenue workspace was removed: Business is operations-focused
  // and revenue figures never render on the Business overview.
  assert.doesNotMatch(source, /id: "sales"/u);
  assert.doesNotMatch(source, /확정 매출|예상 매출|가중 파이프라인/u);
  assert.doesNotMatch(source, /id: "customers"/u);
  assert.doesNotMatch(source, /id: "companies"/u);
  assert.doesNotMatch(source, /id: "tasks"/u);
  assert.match(source, /readApiResponse/u);
  assert.doesNotMatch(source, /CRMView/u);
  assert.match(source, /flex-wrap/u);
  assert.match(source, /configured_unverified/u);
  assert.match(source, /승인/u);
});

function customer(
  id: string,
  companyName: string,
  status: string,
  expectedValue: number,
  nextContactAt: string | null
) {
  return { id, companyName, status, expectedValue, nextContactAt };
}

function read(relativePath: string) {
  return fs.readFile(path.join(process.cwd(), relativePath), "utf8");
}
