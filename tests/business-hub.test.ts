import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { buildBusinessSummary } from "../src/lib/business/business-workspace";

test("Business navigation replaces CRM while keeping the legacy CRM alias", async () => {
  const sidebar = await read("components/layout/Sidebar.tsx");
  const shell = await read("components/layout/AppShell.tsx");
  const types = await read("components/layout/types.ts");
  const route = await read("app/business/[[...section]]/page.tsx");

  assert.match(sidebar, /"business"/u);
  assert.doesNotMatch(sidebar, /\{ id: "crm"/u);
  assert.match(types, /"business"/u);
  assert.match(shell, /case "business"/u);
  assert.match(shell, /case "crm"/u);
  assert.match(route, /AppShell/u);
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

test("Business Hub exposes nine responsive panels and safe authenticated data loading", async () => {
  const source = await read("components/Business/BusinessHub.tsx");
  for (const section of [
    "overview",
    "customers",
    "companies",
    "sales",
    "mail",
    "cards",
    "meetings",
    "tasks",
    "reports"
  ]) {
    assert.match(source, new RegExp(`id: "${section}"`, "u"));
  }
  assert.match(source, /readApiResponse/u);
  assert.match(source, /CRMView/u);
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
