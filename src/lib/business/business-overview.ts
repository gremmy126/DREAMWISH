import type { CrmDeal, CrmTask, Customer } from "../crm/crm.types";
import type { RevenueCandidate } from "./revenue.types";
import {
  buildMonthlyFinanceSeries,
  getInventorySummary,
  getOutstandingInvoiceSummary,
  getProjectProfitability,
  getReceivablesByCustomer,
  growthRatePercent,
  isWithinPeriod,
  resolveBusinessPeriod,
  type BusinessPeriod,
  type InventorySummary,
  type MonthlyFinancePoint,
  type OutstandingInvoiceSummary,
  type ProjectProfitability
} from "../erp/erp-finance";
import type {
  ErpExpense,
  ErpInvoice,
  ErpPayment,
  ErpProduct,
  ErpProject
} from "../erp/erp.types";

export type BusinessOverviewInput = {
  customers: Customer[];
  deals: CrmDeal[];
  tasks: CrmTask[];
  revenueCandidates: RevenueCandidate[];
  payments: ErpPayment[];
  expenses: ErpExpense[];
  invoices: ErpInvoice[];
  products: ErpProduct[];
  projects: ErpProject[];
  period: BusinessPeriod;
  now?: Date;
};

export type BusinessKpi = {
  id: string;
  label: string;
  value: number;
  unit: "krw" | "count" | "percent";
  previousValue: number | null;
  changePercent: number | null;
  source: string;
};

export type BusinessOverview = {
  period: BusinessPeriod;
  generatedAt: string;
  kpis: BusinessKpi[];
  monthlyFinance: MonthlyFinancePoint[];
  pipeline: Array<{ stage: string; count: number; value: number }>;
  receivables: OutstandingInvoiceSummary;
  receivablesByCustomer: Array<{ customerName: string; outstanding: number; invoiceCount: number }>;
  inventory: InventorySummary;
  projects: ProjectProfitability[];
};

const DEAL_STAGES = ["discovery", "contacted", "proposal", "negotiation", "won", "lost"] as const;

export function buildBusinessOverview(input: BusinessOverviewInput): BusinessOverview {
  const now = input.now || new Date();
  const period = input.period;
  const previousPeriod = buildPreviousPeriod(period);

  const confirmedCandidateRevenue = (candidates: RevenueCandidate[], range: BusinessPeriod) =>
    candidates
      .filter(
        (candidate) =>
          candidate.status === "confirmed" &&
          candidate.direction === "income" &&
          isWithinPeriod(candidate.confirmedAt || candidate.capturedAt, range)
      )
      .reduce((total, candidate) => total + (candidate.confirmedAmount || 0), 0);

  const paymentsIn = (range: BusinessPeriod) =>
    input.payments
      .filter((payment) => isWithinPeriod(payment.paidAt, range))
      .reduce((total, payment) => total + payment.amount, 0);
  const expensesIn = (range: BusinessPeriod) =>
    input.expenses
      .filter((expense) => isWithinPeriod(expense.spentAt, range))
      .reduce((total, expense) => total + expense.amount, 0);

  const totalRevenueAllTime =
    input.payments.reduce((total, payment) => total + payment.amount, 0) +
    input.revenueCandidates
      .filter((candidate) => candidate.status === "confirmed" && candidate.direction === "income")
      .reduce((total, candidate) => total + (candidate.confirmedAmount || 0), 0);

  const periodRevenue = paymentsIn(period) + confirmedCandidateRevenue(input.revenueCandidates, period);
  const previousRevenue =
    paymentsIn(previousPeriod) + confirmedCandidateRevenue(input.revenueCandidates, previousPeriod);
  const periodExpense = expensesIn(period);
  const previousExpense = expensesIn(previousPeriod);

  const openDeals = input.deals.filter((deal) => deal.stage !== "won" && deal.stage !== "lost");
  const wonDeals = input.deals.filter((deal) => deal.stage === "won");
  const closedDeals = input.deals.filter((deal) => deal.stage === "won" || deal.stage === "lost");
  const expectedRevenue = openDeals.reduce(
    (total, deal) => total + Math.round(deal.value * (deal.probability / 100)),
    0
  );

  const newCustomers = input.customers.filter((customer) =>
    isWithinPeriod(customer.createdAt, period)
  ).length;
  const previousNewCustomers = input.customers.filter((customer) =>
    isWithinPeriod(customer.createdAt, previousPeriod)
  ).length;
  const newLeads = input.customers.filter(
    (customer) => customer.status === "lead" && isWithinPeriod(customer.createdAt, period)
  ).length;

  const receivables = getOutstandingInvoiceSummary(input.invoices, now);
  const inventory = getInventorySummary(input.products);
  const openTasks = input.tasks.filter((task) => !task.completedAt).length;
  const conversionRate =
    closedDeals.length > 0 ? Math.round((wonDeals.length / closedDeals.length) * 1000) / 10 : 0;
  const averageDealValue =
    wonDeals.length > 0
      ? Math.round(wonDeals.reduce((total, deal) => total + deal.value, 0) / wonDeals.length)
      : 0;

  const kpis: BusinessKpi[] = [
    kpi("totalRevenue", "총매출", totalRevenueAllTime, "krw", null, "ERP 결제 + 확정 매출"),
    kpi("periodRevenue", "기간 매출", periodRevenue, "krw", previousRevenue, "ERP 결제 + 확정 매출"),
    kpi("expectedRevenue", "예상 매출", expectedRevenue, "krw", null, "CRM 가중 파이프라인"),
    kpi("outstanding", "미수금", receivables.totalOutstanding, "krw", null, "ERP 청구서"),
    kpi("periodExpense", "기간 지출", periodExpense, "krw", previousExpense, "ERP 지출"),
    kpi(
      "netProfit",
      "순이익",
      periodRevenue - periodExpense,
      "krw",
      previousRevenue - previousExpense,
      "매출 - 지출"
    ),
    kpi("newCustomers", "신규 고객", newCustomers, "count", previousNewCustomers, "CRM 고객"),
    kpi(
      "activeCustomers",
      "활성 고객",
      input.customers.filter((customer) => customer.status === "active").length,
      "count",
      null,
      "CRM 고객"
    ),
    kpi("newLeads", "신규 리드", newLeads, "count", null, "CRM 리드"),
    kpi("openDeals", "진행 영업기회", openDeals.length, "count", null, "CRM 거래"),
    kpi("conversionRate", "계약 전환율", conversionRate, "percent", null, "CRM 성사/종결 거래"),
    kpi("averageDealValue", "평균 계약 금액", averageDealValue, "krw", null, "CRM 성사 거래"),
    kpi("lowStock", "재고 부족 상품", inventory.lowStock.length, "count", null, "ERP 재고"),
    kpi("openTasks", "미처리 업무", openTasks, "count", null, "CRM 업무")
  ];

  return {
    period,
    generatedAt: now.toISOString(),
    kpis,
    monthlyFinance: buildMonthlyFinanceSeries(input.payments, input.expenses, 6, now),
    pipeline: DEAL_STAGES.map((stage) => {
      const deals = input.deals.filter((deal) => deal.stage === stage);
      return {
        stage,
        count: deals.length,
        value: deals.reduce((total, deal) => total + deal.value, 0)
      };
    }),
    receivables,
    receivablesByCustomer: getReceivablesByCustomer(input.invoices).slice(0, 8),
    inventory,
    projects: getProjectProfitability(input.projects, input.payments, input.expenses)
  };
}

export { resolveBusinessPeriod };

function kpi(
  id: string,
  label: string,
  value: number,
  unit: BusinessKpi["unit"],
  previousValue: number | null,
  source: string
): BusinessKpi {
  return {
    id,
    label,
    value,
    unit,
    previousValue,
    changePercent: previousValue === null ? null : growthRatePercent(value, previousValue),
    source
  };
}

function buildPreviousPeriod(period: BusinessPeriod): BusinessPeriod {
  const start = new Date(period.start).getTime();
  const end = new Date(period.end).getTime();
  const span = Math.max(1, end - start);
  return {
    preset: period.preset,
    start: new Date(start - span).toISOString(),
    end: new Date(start - 1).toISOString()
  };
}
