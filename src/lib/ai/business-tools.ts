import { listRevenueCandidates } from "../business/revenue.repository";
import {
  listCrmDeals,
  listCrmTasks,
  listCustomers
} from "../crm/crm.repository";
import type { CrmDeal, Customer } from "../crm/crm.types";
import {
  buildMonthlyFinanceSeries,
  getInventorySummary,
  getOutstandingInvoiceSummary,
  getReceivablesByCustomer,
  growthRatePercent,
  isWithinPeriod,
  resolveBusinessPeriod
} from "../erp/erp-finance";
import { getErpSnapshot } from "../erp/erp.repository";
import type { SourceDocument } from "../chat/chat.types";

export type BusinessAiContext = {
  detected: boolean;
  contextText: string;
  sources: SourceDocument[];
};

const BUSINESS_PATTERNS = [
  /매출|수익|이익|손익|영업이익|현금\s*흐름|정산/iu,
  /지출|비용|경비|미지급/iu,
  /미수금|수금|연체|청구서|인보이스|세금계산서/iu,
  /주문|발주|납품|결제(?!\s*수단\s*등록)/iu,
  /재고|입고|출고|품절|상품\s*(목록|현황)|제품\s*(목록|현황)/iu,
  /고객|리드|영업\s*기회|파이프라인|전환율|계약|거래처|공급업체/iu,
  /프로젝트\s*(수익|손익|이익|비용)/iu,
  /\b(revenue|profit|expense|invoice|receivable|order|inventory|stock|customer|lead|pipeline|deal|vendor)s?\b/iu
];

export function detectBusinessQuestion(question: string): boolean {
  const normalized = question.trim();
  if (!normalized) return false;
  return BUSINESS_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Builds an exact, owner-scoped CRM/ERP context block. All numbers are
 * computed with integer aggregation here (never by the LLM) and the block is
 * marked as untrusted reference data before it reaches the prompt.
 */
export async function buildBusinessAiContext(
  ownerId: string,
  question: string,
  now: Date = new Date()
): Promise<BusinessAiContext> {
  if (!detectBusinessQuestion(question)) {
    return { detected: false, contextText: "", sources: [] };
  }

  const [customers, deals, tasks, revenueCandidates, erp] = await Promise.all([
    listCustomers(ownerId),
    listCrmDeals(ownerId),
    listCrmTasks(ownerId),
    listRevenueCandidates(ownerId),
    getErpSnapshot(ownerId)
  ]);

  const thisMonth = resolveBusinessPeriod("this_month", {}, now);
  const lastMonth = resolveBusinessPeriod("last_month", {}, now);
  const paymentsIn = (period: typeof thisMonth) =>
    erp.payments
      .filter((payment) => isWithinPeriod(payment.paidAt, period))
      .reduce((total, payment) => total + payment.amount, 0);
  const candidatesIn = (period: typeof thisMonth) =>
    revenueCandidates
      .filter(
        (candidate) =>
          candidate.status === "confirmed" &&
          candidate.direction === "income" &&
          isWithinPeriod(candidate.confirmedAt || candidate.capturedAt, period)
      )
      .reduce((total, candidate) => total + (candidate.confirmedAmount || 0), 0);
  const expensesIn = (period: typeof thisMonth) =>
    erp.expenses
      .filter((expense) => isWithinPeriod(expense.spentAt, period))
      .reduce((total, expense) => total + expense.amount, 0);

  const monthRevenue = paymentsIn(thisMonth) + candidatesIn(thisMonth);
  const lastMonthRevenue = paymentsIn(lastMonth) + candidatesIn(lastMonth);
  const monthExpense = expensesIn(thisMonth);
  const growth = growthRatePercent(monthRevenue, lastMonthRevenue);
  const receivables = getOutstandingInvoiceSummary(erp.invoices, now);
  const byCustomer = getReceivablesByCustomer(erp.invoices);
  const inventory = getInventorySummary(erp.products);
  const monthly = buildMonthlyFinanceSeries(erp.payments, erp.expenses, 4, now);

  const openDeals = deals.filter((deal) => deal.stage !== "won" && deal.stage !== "lost");
  const leads = customers.filter((customer) => customer.status === "lead");
  const openTasks = tasks.filter((task) => !task.completedAt);
  const staleCustomers = customers.filter((customer) => {
    if (!customer.lastContactAt) return false;
    return now.getTime() - new Date(customer.lastContactAt).getTime() > 30 * 86_400_000;
  });

  const lines: string[] = [
    `[비즈니스 데이터 요약 | 기준 시각 ${now.toISOString()} | 소유자 데이터만 집계됨]`,
    `- 이번 달 매출: ${krw(monthRevenue)} (지난달 ${krw(lastMonthRevenue)}${growth === null ? "" : `, 증감 ${growth}%`})`,
    `- 이번 달 지출: ${krw(monthExpense)} / 이번 달 순이익: ${krw(monthRevenue - monthExpense)}`,
    `- 월별 추이: ${monthly
      .map((point) => `${point.month} 매출 ${krw(point.revenue)}·지출 ${krw(point.expense)}`)
      .join(" | ")}`,
    `- 미수금 총액: ${krw(receivables.totalOutstanding)} (연체 ${krw(receivables.overdueAmount)})`
  ];

  if (byCustomer.length > 0) {
    lines.push(
      `- 고객별 미수금 상위: ${byCustomer
        .slice(0, 5)
        .map((row) => `${row.customerName} ${krw(row.outstanding)}(${row.invoiceCount}건)`)
        .join(", ")}`
    );
  }
  if (receivables.invoices.length > 0) {
    lines.push(
      `- 연체/미결 청구서: ${receivables.invoices
        .slice(0, 5)
        .map(
          (invoice) =>
            `${invoice.customerName} ${krw(invoice.outstanding)}${invoice.dueAt ? ` (기한 ${invoice.dueAt.slice(0, 10)})` : ""}${invoice.overdue ? " [연체]" : ""}`
        )
        .join(", ")}`
    );
  }
  lines.push(
    `- 재고: 상품 ${inventory.productCount}종, 재고 자산 ${krw(inventory.totalStockValue)}${
      inventory.lowStock.length > 0
        ? `, 부족 상품 ${inventory.lowStock
            .slice(0, 5)
            .map((item) => `${item.name}(${item.stockQuantity}/${item.lowStockThreshold})`)
            .join(", ")}`
        : ", 부족 상품 없음"
    }`,
    `- CRM: 전체 고객 ${customers.length}명, 리드 ${leads.length}명, 진행 영업기회 ${openDeals.length}건, 미완료 업무 ${openTasks.length}건`,
    `- 30일 이상 연락 없는 고객: ${
      staleCustomers.length > 0
        ? staleCustomers
            .slice(0, 5)
            .map((customer) => customer.name)
            .join(", ")
        : "없음"
    }`
  );

  const matchedCustomers = searchCustomers(customers, question);
  if (matchedCustomers.length > 0) {
    lines.push(
      "[질문과 관련된 CRM 고객]",
      ...matchedCustomers
        .slice(0, 5)
        .map(
          (customer) =>
            `- ${customer.name} (${customer.companyName || "회사 미지정"}, 상태 ${customer.status}, 예상가치 ${krw(customer.expectedValue)}, 연락처 ${maskEmail(customer.email)} ${maskPhone(customer.phone)}, 마지막 연락 ${customer.lastContactAt?.slice(0, 10) || "기록 없음"})`
        )
    );
    const matchedDeals = deals.filter((deal) =>
      matchedCustomers.some((customer) => customer.id === deal.customerId)
    );
    if (matchedDeals.length > 0) {
      lines.push(
        `[해당 고객 거래] ${matchedDeals
          .slice(0, 5)
          .map((deal) => `${deal.title} (${deal.stage}, ${krw(deal.value)})`)
          .join(", ")}`
      );
    }
    const matchedInvoices = erp.invoices.filter((invoice) =>
      matchedCustomers.some(
        (customer) =>
          invoice.customerId === customer.id ||
          (invoice.customerName && invoice.customerName === customer.name)
      )
    );
    if (matchedInvoices.length > 0) {
      lines.push(
        `[해당 고객 청구서] ${matchedInvoices
          .slice(0, 5)
          .map(
            (invoice) =>
              `${krw(invoice.totalAmount)} 중 ${krw(invoice.paidAmount)} 결제 (${invoice.status})`
          )
          .join(", ")}`
      );
    }
  }

  lines.push(
    "위 수치는 시스템이 구조화 집계로 계산한 정확한 값이다. 다시 계산하거나 추정하지 말고 그대로 인용하라. 데이터에 없는 수치는 없다고 답하라."
  );

  return {
    detected: true,
    contextText: lines.join("\n").slice(0, 6000),
    sources: [
      {
        title: "CRM·ERP 비즈니스 데이터",
        path: "business://summary",
        relevance: 0.9,
        updated: now.toISOString(),
        preview: `이번 달 매출 ${krw(monthRevenue)}, 미수금 ${krw(receivables.totalOutstanding)}`
      }
    ]
  };
}

function searchCustomers(customers: Customer[], question: string) {
  const normalized = question.toLowerCase();
  return customers.filter((customer) => {
    const name = customer.name.trim().toLowerCase();
    const company = customer.companyName.trim().toLowerCase();
    return (
      (name.length >= 2 && normalized.includes(name)) ||
      (company.length >= 2 && normalized.includes(company))
    );
  });
}

export function maskEmail(email: string) {
  const trimmed = email.trim();
  if (!trimmed.includes("@")) return trimmed ? "***" : "-";
  const [local, domain] = trimmed.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

export function maskPhone(phone: string) {
  const digits = phone.replace(/\D/gu, "");
  if (digits.length < 7) return phone ? "***" : "-";
  return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
}

export function summarizeDealsByStage(deals: CrmDeal[]) {
  const stages = ["discovery", "contacted", "proposal", "negotiation", "won", "lost"] as const;
  return stages.map((stage) => ({
    stage,
    count: deals.filter((deal) => deal.stage === stage).length,
    value: deals
      .filter((deal) => deal.stage === stage)
      .reduce((total, deal) => total + deal.value, 0)
  }));
}

function krw(value: number) {
  return `${value.toLocaleString("ko-KR")}원`;
}
