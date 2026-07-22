"use client";

import { CreditCard, KeyRound, RefreshCcw, Search, TicketCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Grant = {
  id: string;
  userId?: string;
  source: string;
  couponId?: string | null;
  startsAt: string;
  endsAt: string;
  status: string;
};

type Subscription = {
  id: string;
  ownerId: string;
  provider: string;
  status: string;
  amount: number;
  currency: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
};

type Overview = {
  grants: Grant[];
  subscriptions: Subscription[];
  stats: {
    activeGrants: number;
    totalGrants: number;
    activeSubscriptions: number;
    totalSubscriptions: number;
  };
};

const SOURCE_LABELS: Record<string, string> = { coupon: "쿠폰", admin: "관리자 지급" };
const STATUS_LABELS: Record<string, string> = {
  active: "활성",
  past_due: "연체",
  canceled: "해지 예약",
  ended: "종료",
  revoked: "회수됨"
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ko-KR");
}

// 관리자 구독·이용권 화면. 처음 열면 전체 활성 구독과 최근 발급 이용권을
// 요약·목록으로 보여주고(사용자 ID 조회 불필요), 아래에서 사용자별 지급·회수를
// 할 수 있다.
export function AdminAccessGrants() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);

  const [userId, setUserId] = useState("");
  const [days, setDays] = useState(30);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true);
    setOverviewError(null);
    try {
      const response = await fetch("/api/admin/access-grants", { cache: "no-store" });
      const body = (await response.json().catch(() => ({}))) as Overview & { ok?: boolean; error?: string };
      if (!response.ok || body.ok === false) {
        throw new Error(body.error || "구독·이용권 정보를 불러오지 못했습니다.");
      }
      setOverview({ grants: body.grants || [], subscriptions: body.subscriptions || [], stats: body.stats });
    } catch (caught) {
      setOverviewError(caught instanceof Error ? caught.message : "구독·이용권 정보를 불러오지 못했습니다.");
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  async function load() {
    if (!userId.trim()) return;
    const response = await fetch(`/api/admin/users/${encodeURIComponent(userId.trim())}/access-grants`, { cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as { grants?: Grant[]; error?: string };
    if (!response.ok) throw new Error(body.error || "이용권을 불러오지 못했습니다.");
    setGrants(body.grants || []);
  }

  async function grant() {
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(userId.trim())}/access-grants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days })
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || "이용권을 지급하지 못했습니다.");
      await load();
      await loadOverview();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "이용권을 지급하지 못했습니다.");
    }
  }

  async function revoke(grantId: string) {
    const confirmationPhrase = window.prompt("이용권을 회수하려면 REVOKE를 입력하세요.");
    if (confirmationPhrase !== "REVOKE") return;
    const response = await fetch(`/api/admin/users/${encodeURIComponent(userId.trim())}/access-grants`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grantId, confirmationPhrase })
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error || "회수하지 못했습니다.");
      return;
    }
    await load();
    await loadOverview();
  }

  const stats = overview?.stats;

  return (
    <div className="space-y-5">
      <section className="rounded-[22px] border border-app-border bg-app-card p-5 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-app-hover text-app-primary">
              <KeyRound size={19} />
            </span>
            <div>
              <h2 className="text-lg font-bold">구독·이용권</h2>
              <p className="mt-1 text-xs text-app-muted">전체 활성 구독과 발급된 이용권을 한눈에 보고, 사용자별로 지급·회수합니다.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadOverview()}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-app-border"
            aria-label="새로고침"
          >
            <RefreshCcw size={16} />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="활성 구독" value={stats ? stats.activeSubscriptions : "—"} icon={CreditCard} />
          <StatCard label="전체 구독" value={stats ? stats.totalSubscriptions : "—"} icon={CreditCard} />
          <StatCard label="활성 이용권" value={stats ? stats.activeGrants : "—"} icon={TicketCheck} />
          <StatCard label="전체 이용권" value={stats ? stats.totalGrants : "—"} icon={TicketCheck} />
        </div>
        {overviewError ? <p className="mt-4 rounded-2xl bg-red-50 p-3 text-xs text-red-700">{overviewError}</p> : null}
      </section>

      <section className="rounded-[22px] border border-app-border bg-app-card p-5 shadow-soft">
        <h3 className="text-sm font-bold">활성 구독</h3>
        <div className="mt-3 space-y-2">
          {loadingOverview ? (
            <p className="text-xs text-app-muted">불러오는 중…</p>
          ) : overview && overview.subscriptions.length ? (
            overview.subscriptions.map((subscription) => (
              <article key={subscription.id} className="flex flex-col gap-1 rounded-2xl border border-app-border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold">{subscription.ownerId}</p>
                  <p className="mt-1 text-[10px] text-app-muted">
                    {subscription.provider} · {STATUS_LABELS[subscription.status] || subscription.status}
                    {subscription.cancelAtPeriodEnd ? " · 기간 종료 시 해지" : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold">{subscription.amount.toLocaleString("ko-KR")}원 / 월</p>
                  <p className="mt-1 text-[10px] text-app-muted">~ {formatDate(subscription.currentPeriodEnd)}</p>
                </div>
              </article>
            ))
          ) : (
            <p className="text-xs text-app-muted">활성 구독이 없습니다.</p>
          )}
        </div>
      </section>

      <section className="rounded-[22px] border border-app-border bg-app-card p-5 shadow-soft">
        <h3 className="text-sm font-bold">발급된 이용권</h3>
        <div className="mt-3 space-y-2">
          {loadingOverview ? (
            <p className="text-xs text-app-muted">불러오는 중…</p>
          ) : overview && overview.grants.length ? (
            overview.grants.map((entry) => (
              <article key={entry.id} className="flex flex-col gap-1 rounded-2xl border border-app-border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold">{entry.userId || "-"}</p>
                  <p className="mt-1 text-[10px] text-app-muted">
                    {SOURCE_LABELS[entry.source] || entry.source} · {STATUS_LABELS[entry.status] || entry.status}
                  </p>
                </div>
                <p className="text-[10px] text-app-muted">{formatDate(entry.startsAt)} ~ {formatDate(entry.endsAt)}</p>
              </article>
            ))
          ) : (
            <p className="text-xs text-app-muted">발급된 이용권이 없습니다.</p>
          )}
        </div>
      </section>

      <section className="rounded-[22px] border border-app-border bg-app-card p-5 shadow-soft">
        <h3 className="text-sm font-bold">사용자별 이용권 지급·회수</h3>
        <p className="mt-1 text-xs text-app-muted">사용자 ID를 기준으로 기간형 접근권한을 지급하거나 회수합니다.</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <label className="flex min-h-11 flex-1 items-center gap-2 rounded-2xl border border-app-border px-3">
            <Search size={15} />
            <input value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="사용자 ID" className="min-w-0 flex-1 bg-transparent text-xs outline-none" />
          </label>
          <input type="number" min={1} max={3650} value={days} onChange={(event) => setDays(Number(event.target.value))} className="min-h-11 rounded-2xl border border-app-border px-3 text-xs sm:w-32" />
          <button type="button" onClick={() => void load().catch((caught) => setError(caught.message))} className="min-h-11 rounded-2xl border border-app-border px-4 text-xs font-bold">조회</button>
          <button type="button" onClick={() => void grant()} className="min-h-11 rounded-2xl bg-app-primary px-4 text-xs font-bold text-white">지급</button>
        </div>
        {error ? <p className="mt-4 rounded-2xl bg-red-50 p-3 text-xs text-red-700">{error}</p> : null}
        <div className="mt-5 space-y-2">
          {grants.map((entry) => (
            <article key={entry.id} className="flex flex-col gap-3 rounded-2xl border border-app-border p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold">{SOURCE_LABELS[entry.source] || entry.source} · {STATUS_LABELS[entry.status] || entry.status}</p>
                <p className="mt-1 text-[10px] text-app-muted">{formatDate(entry.startsAt)} ~ {formatDate(entry.endsAt)}</p>
              </div>
              {entry.status === "active" ? (
                <button type="button" onClick={() => void revoke(entry.id)} className="min-h-11 rounded-2xl border border-red-200 px-4 text-xs font-bold text-red-600">회수</button>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number | string; icon: typeof CreditCard }) {
  return (
    <div className="rounded-2xl border border-app-border bg-app-bg p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-bold text-app-muted">
        <Icon size={12} className="text-app-primary" />
        {label}
      </div>
      <p className="mt-1 text-xl font-black text-app-text">{value}</p>
    </div>
  );
}
