"use client";

import { RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SurfaceCard } from "@/components/Common/SurfaceCard";
import { readApiResponse } from "@/src/lib/api/api-response";

type Kpi = {
  id: string;
  label: string;
  value: number;
  unit: "krw" | "count" | "percent";
  previousValue: number | null;
  changePercent: number | null;
  source: string;
};

type MonthlyPoint = { month: string; revenue: number; expense: number; profit: number };

type Overview = {
  period: { preset: string; start: string; end: string };
  generatedAt: string;
  kpis: Kpi[];
  monthlyFinance: MonthlyPoint[];
  pipeline: Array<{ stage: string; count: number; value: number }>;
  receivables: {
    totalOutstanding: number;
    overdueAmount: number;
    invoices: Array<{
      id: string;
      customerName: string;
      outstanding: number;
      dueAt: string | null;
      overdue: boolean;
    }>;
  };
  receivablesByCustomer: Array<{ customerName: string; outstanding: number; invoiceCount: number }>;
  inventory: {
    productCount: number;
    totalStockValue: number;
    lowStock: Array<{ id: string; name: string; stockQuantity: number; lowStockThreshold: number }>;
  };
  projects: Array<{
    projectId: string;
    projectName: string;
    status: string;
    revenue: number;
    expense: number;
    profit: number;
  }>;
};

const PERIODS = [
  { id: "today", label: "오늘" },
  { id: "7d", label: "최근 7일" },
  { id: "30d", label: "최근 30일" },
  { id: "this_month", label: "이번 달" },
  { id: "last_month", label: "지난달" },
  { id: "quarter", label: "이번 분기" },
  { id: "year", label: "올해" }
] as const;

const STAGE_LABELS: Record<string, string> = {
  discovery: "발굴",
  contacted: "접촉",
  proposal: "제안",
  negotiation: "협상",
  won: "성사",
  lost: "실패"
};

export function BusinessOverview() {
  const [period, setPeriod] = useState<string>("this_month");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (selectedPeriod: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/business/overview?period=${selectedPeriod}`, {
        cache: "no-store"
      });
      setOverview(await readApiResponse<Overview>(response));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "개요 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(period);
  }, [load, period]);

  const monthlyMax = useMemo(() => {
    if (!overview) return 1;
    return Math.max(
      1,
      ...overview.monthlyFinance.map((point) => Math.max(point.revenue, point.expense))
    );
  }, [overview]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="기간 선택">
          {PERIODS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPeriod(item.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                period === item.id
                  ? "bg-app-primary text-white"
                  : "border border-app-border bg-white text-app-muted hover:text-app-primary"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-app-muted">
          {overview ? (
            <span>갱신 {new Date(overview.generatedAt).toLocaleTimeString("ko-KR")}</span>
          ) : null}
          <button
            type="button"
            onClick={() => void load(period)}
            className="inline-flex items-center gap-1 rounded-xl border border-app-border bg-white px-2.5 py-1.5 font-semibold text-app-muted transition hover:text-app-primary"
          >
            <RefreshCw size={12} />
            새로고침
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {loading && !overview ? <OverviewSkeleton /> : null}

      {overview ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {overview.kpis.map((kpi) => (
              <KpiCard key={kpi.id} kpi={kpi} />
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <SurfaceCard className="p-5">
              <h2 className="text-sm font-semibold text-app-text">월별 매출·지출·순이익</h2>
              <div className="mt-4 flex items-end gap-3" style={{ height: 160 }}>
                {overview.monthlyFinance.map((point) => (
                  <div key={point.month} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex w-full flex-1 items-end justify-center gap-1">
                      <div
                        title={`매출 ${currency(point.revenue)}`}
                        className="w-1/3 rounded-t bg-app-primary"
                        style={{ height: `${(point.revenue / monthlyMax) * 100}%` }}
                      />
                      <div
                        title={`지출 ${currency(point.expense)}`}
                        className="w-1/3 rounded-t bg-slate-300"
                        style={{ height: `${(point.expense / monthlyMax) * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-app-muted">{point.month.slice(5)}월</span>
                    <span
                      className={`text-[10px] font-semibold ${point.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}
                    >
                      {compactCurrency(point.profit)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-4 text-[11px] text-app-muted">
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-app-primary" /> 매출
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-sm bg-slate-300" /> 지출
                </span>
                <span>월 아래 숫자는 순이익</span>
              </div>
            </SurfaceCard>

            <SurfaceCard className="p-5">
              <h2 className="text-sm font-semibold text-app-text">영업 파이프라인</h2>
              <div className="mt-4 space-y-2">
                {overview.pipeline.map((stage) => {
                  const maxValue = Math.max(1, ...overview.pipeline.map((item) => item.value));
                  return (
                    <div key={stage.stage} className="flex items-center gap-3">
                      <span className="w-12 text-xs text-app-muted">
                        {STAGE_LABELS[stage.stage] || stage.stage}
                      </span>
                      <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${stage.stage === "won" ? "bg-emerald-500" : stage.stage === "lost" ? "bg-slate-300" : "bg-app-primary"}`}
                          style={{ width: `${(stage.value / maxValue) * 100}%` }}
                        />
                      </div>
                      <span className="w-28 text-right text-xs text-app-text">
                        {stage.count}건 · {compactCurrency(stage.value)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </SurfaceCard>

            <SurfaceCard className="p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-app-text">미수금 현황</h2>
                <span className="text-xs font-semibold text-red-600">
                  연체 {currency(overview.receivables.overdueAmount)}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {overview.receivablesByCustomer.slice(0, 6).map((row) => (
                  <div
                    key={row.customerName}
                    className="flex items-center justify-between rounded-xl border border-app-border bg-app-bg px-3 py-2 text-xs"
                  >
                    <span className="font-medium text-app-text">{row.customerName}</span>
                    <span className="text-app-muted">
                      {row.invoiceCount}건 · {currency(row.outstanding)}
                    </span>
                  </div>
                ))}
                {overview.receivablesByCustomer.length === 0 ? (
                  <p className="py-4 text-center text-xs text-app-muted">미수금이 없습니다.</p>
                ) : null}
              </div>
            </SurfaceCard>

            <SurfaceCard className="p-5">
              <h2 className="text-sm font-semibold text-app-text">재고 부족 상품</h2>
              <div className="mt-3 space-y-2">
                {overview.inventory.lowStock.slice(0, 6).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs"
                  >
                    <span className="font-medium text-app-text">{item.name}</span>
                    <span className="text-amber-700">
                      재고 {item.stockQuantity} / 기준 {item.lowStockThreshold}
                    </span>
                  </div>
                ))}
                {overview.inventory.lowStock.length === 0 ? (
                  <p className="py-4 text-center text-xs text-app-muted">
                    재고 부족 상품이 없습니다.
                  </p>
                ) : null}
              </div>
            </SurfaceCard>
          </div>

          {overview.projects.length > 0 ? (
            <SurfaceCard className="overflow-hidden">
              <h2 className="px-5 pt-5 text-sm font-semibold text-app-text">프로젝트 손익</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-app-bg text-xs text-app-muted">
                    <tr>
                      <th className="px-4 py-3 font-semibold">프로젝트</th>
                      <th className="px-4 py-3 font-semibold">상태</th>
                      <th className="px-4 py-3 font-semibold">매출</th>
                      <th className="px-4 py-3 font-semibold">비용</th>
                      <th className="px-4 py-3 font-semibold">이익</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.projects.map((project) => (
                      <tr key={project.projectId} className="border-t border-app-border">
                        <td className="px-4 py-3 text-app-text">{project.projectName}</td>
                        <td className="px-4 py-3 text-app-muted">{project.status}</td>
                        <td className="px-4 py-3 text-app-text">{currency(project.revenue)}</td>
                        <td className="px-4 py-3 text-app-text">{currency(project.expense)}</td>
                        <td
                          className={`px-4 py-3 font-semibold ${project.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}
                        >
                          {currency(project.profit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SurfaceCard>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function KpiCard({ kpi }: { kpi: Kpi }) {
  const positive = (kpi.changePercent ?? 0) >= 0;
  return (
    <SurfaceCard className="p-4">
      <p className="text-xs font-semibold text-app-muted">{kpi.label}</p>
      <p className="mt-1.5 truncate text-lg font-semibold text-app-text" title={formatKpi(kpi)}>
        {formatKpi(kpi)}
      </p>
      <div className="mt-1 flex items-center justify-between gap-2">
        {kpi.changePercent !== null ? (
          <span
            className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${positive ? "text-emerald-600" : "text-red-600"}`}
          >
            {positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {Math.abs(kpi.changePercent)}%
          </span>
        ) : (
          <span />
        )}
        <span className="truncate text-[10px] text-app-muted" title={kpi.source}>
          {kpi.source}
        </span>
      </div>
    </SurfaceCard>
  );
}

function OverviewSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" aria-hidden>
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="h-24 animate-pulse rounded-2xl border border-app-border bg-white"
        />
      ))}
    </div>
  );
}

function formatKpi(kpi: Kpi) {
  if (kpi.unit === "krw") return currency(kpi.value);
  if (kpi.unit === "percent") return `${kpi.value}%`;
  return `${kpi.value.toLocaleString("ko-KR")}`;
}

function currency(value: number) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0
  }).format(value);
}

function compactCurrency(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 100_000_000) return `${sign}${(abs / 100_000_000).toFixed(1)}억`;
  if (abs >= 10_000) return `${sign}${Math.round(abs / 10_000).toLocaleString("ko-KR")}만`;
  return `${sign}${abs.toLocaleString("ko-KR")}원`;
}
