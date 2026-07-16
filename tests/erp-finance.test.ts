import assert from "node:assert/strict";
import {
  buildMonthlyFinanceSeries,
  getInventorySummary,
  getOutstandingInvoiceSummary,
  getProjectProfitability,
  getReceivablesByCustomer,
  growthRatePercent,
  resolveBusinessPeriod
} from "../src/lib/erp/erp-finance";
import { buildBusinessOverview } from "../src/lib/business/business-overview";
import type { ErpInvoice, ErpPayment, ErpProduct, ErpProject } from "../src/lib/erp/erp.types";

const NOW = new Date("2026-07-16T12:00:00.000Z");

test("monthly finance series aggregates payments and expenses by month", () => {
  const series = buildMonthlyFinanceSeries(
    [
      { amount: 1_000_000, paidAt: "2026-07-01T00:00:00.000Z" },
      { amount: 500_000, paidAt: "2026-07-10T00:00:00.000Z" },
      { amount: 2_000_000, paidAt: "2026-06-15T00:00:00.000Z" }
    ],
    [{ amount: 300_000, spentAt: "2026-07-05T00:00:00.000Z" }],
    3,
    NOW
  );
  assert.equal(series.length, 3);
  const july = series.find((point) => point.month === "2026-07");
  const june = series.find((point) => point.month === "2026-06");
  assert.ok(july && june);
  assert.equal(july.revenue, 1_500_000);
  assert.equal(july.expense, 300_000);
  assert.equal(july.profit, 1_200_000);
  assert.equal(june.revenue, 2_000_000);
});

test("outstanding invoice summary computes overdue receivables", () => {
  const invoices = [
    invoice({ totalAmount: 3_300_000, paidAmount: 0, dueAt: "2026-07-10T00:00:00.000Z", status: "sent", customerName: "ABC" }),
    invoice({ totalAmount: 1_000_000, paidAmount: 400_000, dueAt: "2026-08-01T00:00:00.000Z", status: "partially_paid", customerName: "DEF" }),
    invoice({ totalAmount: 700_000, paidAmount: 700_000, status: "paid", customerName: "GHI" })
  ];
  const summary = getOutstandingInvoiceSummary(invoices, NOW);
  assert.equal(summary.totalOutstanding, 3_900_000);
  assert.equal(summary.overdueAmount, 3_300_000);
  assert.equal(summary.invoices[0].customerName, "ABC");
  assert.equal(summary.invoices[0].status, "overdue");

  const byCustomer = getReceivablesByCustomer(invoices);
  assert.equal(byCustomer[0].customerName, "ABC");
  assert.equal(byCustomer[0].outstanding, 3_300_000);
});

test("inventory summary flags low stock and values stock at cost", () => {
  const summary = getInventorySummary([
    product({ name: "A", stockQuantity: 2, lowStockThreshold: 5, costPrice: 1000 }),
    product({ name: "B", stockQuantity: 50, lowStockThreshold: 5, costPrice: 200 })
  ]);
  assert.equal(summary.lowStock.length, 1);
  assert.equal(summary.lowStock[0].name, "A");
  assert.equal(summary.totalStockValue, 2 * 1000 + 50 * 200);
});

test("project profitability joins payments and expenses by project", () => {
  const projects: ErpProject[] = [projectRecord({ id: "p1", name: "구축" })];
  const rows = getProjectProfitability(
    projects,
    [payment({ projectId: "p1", amount: 5_000_000 })],
    [
      { ...expense({ projectId: "p1", amount: 2_000_000 }) },
      { ...expense({ projectId: "other", amount: 999 }) }
    ]
  );
  assert.equal(rows[0].revenue, 5_000_000);
  assert.equal(rows[0].expense, 2_000_000);
  assert.equal(rows[0].profit, 3_000_000);
});

test("business overview builds KPIs with period comparison", () => {
  const period = resolveBusinessPeriod("this_month", {}, NOW);
  const overview = buildBusinessOverview({
    customers: [],
    deals: [],
    tasks: [],
    revenueCandidates: [],
    payments: [
      payment({ amount: 4_000_000, paidAt: "2026-07-02T00:00:00.000Z" }),
      payment({ amount: 1_000_000, paidAt: "2026-05-20T00:00:00.000Z" })
    ],
    expenses: [expense({ amount: 1_500_000, spentAt: "2026-07-03T00:00:00.000Z" })],
    invoices: [
      invoice({ totalAmount: 2_000_000, paidAmount: 0, status: "sent", customerName: "ABC" })
    ],
    products: [product({ stockQuantity: 1, lowStockThreshold: 3 })],
    projects: [],
    period,
    now: NOW
  });

  const byId = new Map(overview.kpis.map((item) => [item.id, item]));
  assert.equal(byId.get("totalRevenue")?.value, 5_000_000);
  assert.equal(byId.get("periodRevenue")?.value, 4_000_000);
  assert.equal(byId.get("periodExpense")?.value, 1_500_000);
  assert.equal(byId.get("netProfit")?.value, 2_500_000);
  assert.equal(byId.get("outstanding")?.value, 2_000_000);
  assert.equal(byId.get("lowStock")?.value, 1);
  assert.equal(overview.monthlyFinance.length, 6);
  assert.ok(overview.kpis.every((item) => typeof item.source === "string" && item.source.length > 0));
});

test("growth rate handles zero previous values without division errors", () => {
  assert.equal(growthRatePercent(100, 0), null);
  assert.equal(growthRatePercent(0, 0), 0);
  assert.equal(growthRatePercent(150, 100), 50);
  assert.equal(growthRatePercent(50, 100), -50);
});

test("business period presets resolve to sane ranges", () => {
  const thisMonth = resolveBusinessPeriod("this_month", {}, NOW);
  assert.ok(new Date(thisMonth.start).getTime() <= NOW.getTime());
  const custom = resolveBusinessPeriod("custom", { start: "2026-01-01", end: "2026-02-01" }, NOW);
  assert.equal(custom.preset, "custom");
  const invalid = resolveBusinessPeriod("custom", { start: "2026-03-01", end: "2026-01-01" }, NOW);
  assert.equal(invalid.preset, "30d");
});

function invoice(partial: Partial<ErpInvoice>): ErpInvoice {
  return {
    ownerId: "alice",
    id: `inv_${Math.random()}`,
    orderId: null,
    customerId: null,
    customerName: "고객",
    projectId: null,
    status: "sent",
    items: [],
    totalAmount: 0,
    paidAmount: 0,
    issuedAt: "2026-07-01T00:00:00.000Z",
    dueAt: null,
    paidAt: null,
    memo: "",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    deletedAt: null,
    ...partial
  };
}

function payment(partial: Partial<ErpPayment>): ErpPayment {
  return {
    ownerId: "alice",
    id: `pay_${Math.random()}`,
    invoiceId: "inv",
    customerId: null,
    customerName: "고객",
    projectId: null,
    amount: 0,
    method: "transfer",
    paidAt: "2026-07-01T00:00:00.000Z",
    memo: "",
    createdAt: "2026-07-01T00:00:00.000Z",
    ...partial
  };
}

function expense(partial: { projectId?: string | null; amount: number; spentAt?: string }) {
  return {
    ownerId: "alice",
    id: `exp_${Math.random()}`,
    vendorId: null,
    vendorName: "",
    projectId: partial.projectId ?? null,
    category: "other" as const,
    amount: partial.amount,
    spentAt: partial.spentAt || "2026-07-01T00:00:00.000Z",
    memo: "",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    deletedAt: null
  };
}

function product(partial: Partial<ErpProduct>): ErpProduct {
  return {
    ownerId: "alice",
    id: `prod_${Math.random()}`,
    name: "제품",
    sku: "",
    category: "",
    unit: "개",
    unitPrice: 0,
    costPrice: 0,
    stockQuantity: 0,
    lowStockThreshold: 0,
    memo: "",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    deletedAt: null,
    ...partial
  };
}

function projectRecord(partial: Partial<ErpProject>): ErpProject {
  return {
    ownerId: "alice",
    id: `proj_${Math.random()}`,
    name: "프로젝트",
    customerId: null,
    customerName: "",
    status: "active",
    budgetAmount: 0,
    startedAt: null,
    endedAt: null,
    memo: "",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    deletedAt: null,
    ...partial
  };
}
