import {
  invoiceOutstandingAmount,
  resolveInvoiceDisplayStatus,
  type ErpExpense,
  type ErpInvoice,
  type ErpPayment,
  type ErpProduct,
  type ErpProject
} from "./erp.types";

export type BusinessPeriodPreset =
  | "today"
  | "7d"
  | "30d"
  | "this_month"
  | "last_month"
  | "quarter"
  | "year"
  | "custom";

export type BusinessPeriod = {
  preset: BusinessPeriodPreset;
  start: string;
  end: string;
};

export function resolveBusinessPeriod(
  preset: string | null | undefined,
  custom: { start?: string; end?: string } = {},
  now: Date = new Date()
): BusinessPeriod {
  const end = new Date(now);
  const startOfDay = (date: Date) => {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
  };

  switch (preset) {
    case "today":
      return { preset, start: startOfDay(now).toISOString(), end: end.toISOString() };
    case "7d": {
      const start = startOfDay(new Date(now.getTime() - 6 * 86_400_000));
      return { preset, start: start.toISOString(), end: end.toISOString() };
    }
    case "last_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
      return { preset, start: start.toISOString(), end: monthEnd.toISOString() };
    }
    case "this_month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { preset, start: start.toISOString(), end: end.toISOString() };
    }
    case "quarter": {
      const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
      const start = new Date(now.getFullYear(), quarterMonth, 1);
      return { preset, start: start.toISOString(), end: end.toISOString() };
    }
    case "year": {
      const start = new Date(now.getFullYear(), 0, 1);
      return { preset, start: start.toISOString(), end: end.toISOString() };
    }
    case "custom": {
      const start = custom.start ? new Date(custom.start) : startOfDay(new Date(now.getTime() - 29 * 86_400_000));
      const endDate = custom.end ? new Date(custom.end) : end;
      if (Number.isNaN(start.getTime()) || Number.isNaN(endDate.getTime()) || start > endDate) {
        return resolveBusinessPeriod("30d", {}, now);
      }
      return { preset, start: start.toISOString(), end: endDate.toISOString() };
    }
    default: {
      const start = startOfDay(new Date(now.getTime() - 29 * 86_400_000));
      return { preset: "30d", start: start.toISOString(), end: end.toISOString() };
    }
  }
}

export function isWithinPeriod(timestamp: string | null | undefined, period: BusinessPeriod) {
  if (!timestamp) return false;
  const value = new Date(timestamp).getTime();
  if (!Number.isFinite(value)) return false;
  return value >= new Date(period.start).getTime() && value <= new Date(period.end).getTime();
}

export function monthKey(timestamp: string) {
  return timestamp.slice(0, 7);
}

export type MonthlyFinancePoint = {
  month: string;
  revenue: number;
  expense: number;
  profit: number;
};

/** Aggregates ERP payments (revenue ledger) and expenses per calendar month. */
export function buildMonthlyFinanceSeries(
  payments: Array<Pick<ErpPayment, "amount" | "paidAt">>,
  expenses: Array<Pick<ErpExpense, "amount" | "spentAt">>,
  months = 6,
  now: Date = new Date()
): MonthlyFinancePoint[] {
  const series: MonthlyFinancePoint[] = [];
  for (let index = months - 1; index >= 0; index -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    series.push({ month: key, revenue: 0, expense: 0, profit: 0 });
  }
  const byMonth = new Map(series.map((point) => [point.month, point]));
  for (const payment of payments) {
    const point = byMonth.get(monthKey(payment.paidAt));
    if (point) point.revenue += payment.amount;
  }
  for (const expense of expenses) {
    const point = byMonth.get(monthKey(expense.spentAt));
    if (point) point.expense += expense.amount;
  }
  for (const point of series) point.profit = point.revenue - point.expense;
  return series;
}

export function sumAmounts(values: Array<{ amount: number }>) {
  return values.reduce((total, item) => total + item.amount, 0);
}

export type OutstandingInvoiceSummary = {
  totalOutstanding: number;
  overdueAmount: number;
  invoices: Array<{
    id: string;
    customerName: string;
    totalAmount: number;
    paidAmount: number;
    outstanding: number;
    dueAt: string | null;
    status: string;
    overdue: boolean;
  }>;
};

export function getOutstandingInvoiceSummary(
  invoices: ErpInvoice[],
  now: Date = new Date()
): OutstandingInvoiceSummary {
  const open = invoices
    .filter((invoice) => invoiceOutstandingAmount(invoice) > 0)
    .map((invoice) => {
      const status = resolveInvoiceDisplayStatus(invoice, now);
      return {
        id: invoice.id,
        customerName: invoice.customerName,
        totalAmount: invoice.totalAmount,
        paidAmount: invoice.paidAmount,
        outstanding: invoiceOutstandingAmount(invoice),
        dueAt: invoice.dueAt,
        status,
        overdue: status === "overdue"
      };
    })
    .sort((left, right) => right.outstanding - left.outstanding);
  return {
    totalOutstanding: open.reduce((total, item) => total + item.outstanding, 0),
    overdueAmount: open
      .filter((item) => item.overdue)
      .reduce((total, item) => total + item.outstanding, 0),
    invoices: open
  };
}

export type InventorySummary = {
  productCount: number;
  totalStockValue: number;
  lowStock: Array<{
    id: string;
    name: string;
    stockQuantity: number;
    lowStockThreshold: number;
  }>;
};

export function getInventorySummary(products: ErpProduct[]): InventorySummary {
  return {
    productCount: products.length,
    totalStockValue: products.reduce(
      (total, product) => total + product.stockQuantity * product.costPrice,
      0
    ),
    lowStock: products
      .filter(
        (product) =>
          product.lowStockThreshold > 0 && product.stockQuantity <= product.lowStockThreshold
      )
      .map((product) => ({
        id: product.id,
        name: product.name,
        stockQuantity: product.stockQuantity,
        lowStockThreshold: product.lowStockThreshold
      }))
  };
}

export type ProjectProfitability = {
  projectId: string;
  projectName: string;
  status: string;
  revenue: number;
  expense: number;
  profit: number;
  budgetAmount: number;
};

export function getProjectProfitability(
  projects: ErpProject[],
  payments: ErpPayment[],
  expenses: ErpExpense[]
): ProjectProfitability[] {
  return projects.map((project) => {
    const revenue = payments
      .filter((payment) => payment.projectId === project.id)
      .reduce((total, payment) => total + payment.amount, 0);
    const expense = expenses
      .filter((item) => item.projectId === project.id)
      .reduce((total, item) => total + item.amount, 0);
    return {
      projectId: project.id,
      projectName: project.name,
      status: project.status,
      revenue,
      expense,
      profit: revenue - expense,
      budgetAmount: project.budgetAmount
    };
  });
}

export type CustomerReceivable = {
  customerName: string;
  outstanding: number;
  invoiceCount: number;
};

export function getReceivablesByCustomer(invoices: ErpInvoice[]): CustomerReceivable[] {
  const map = new Map<string, CustomerReceivable>();
  for (const invoice of invoices) {
    const outstanding = invoiceOutstandingAmount(invoice);
    if (outstanding <= 0) continue;
    const name = invoice.customerName.trim() || "미지정 고객";
    const current = map.get(name) || { customerName: name, outstanding: 0, invoiceCount: 0 };
    current.outstanding += outstanding;
    current.invoiceCount += 1;
    map.set(name, current);
  }
  return [...map.values()].sort((left, right) => right.outstanding - left.outstanding);
}

export function growthRatePercent(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? null : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
