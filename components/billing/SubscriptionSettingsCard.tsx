"use client";

import {
  AlertTriangle,
  CalendarClock,
  CreditCard,
  ExternalLink,
  Loader2,
  RefreshCw,
  X
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SurfaceCard } from "@/components/Common/SurfaceCard";
import type { BillingEntitlement } from "@/src/lib/billing/billing.types";

type BillingStatusResponse = {
  ok?: boolean;
  entitlement?: BillingEntitlement;
  error?: string;
};

type PortalResponse = {
  ok?: boolean;
  portalUrl?: string;
  error?: string;
};

export function SubscriptionSettingsCard() {
  const [entitlement, setEntitlement] = useState<BillingEntitlement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/status", {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store"
      });
      const payload = (await response.json().catch(() => null)) as BillingStatusResponse | null;
      if (!response.ok || !payload?.entitlement) {
        throw new Error(payload?.error || "구독 상태를 확인하지 못했습니다.");
      }
      setEntitlement(payload.entitlement);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "구독 상태를 확인하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function openPortal() {
    setPortalLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { Accept: "application/json" }
      });
      const payload = (await response.json().catch(() => null)) as PortalResponse | null;
      if (!response.ok || !payload?.portalUrl) {
        throw new Error(payload?.error || "구독 관리 페이지를 열지 못했습니다.");
      }
      const portalUrl = new URL(payload.portalUrl);
      if (portalUrl.protocol !== "https:" && portalUrl.protocol !== "http:") {
        throw new Error("안전하지 않은 구독 관리 주소가 반환되었습니다.");
      }
      window.location.assign(portalUrl.toString());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "구독 관리 페이지를 열지 못했습니다.");
      setPortalLoading(false);
      setConfirmOpen(false);
    }
  }

  async function continueCancellation() {
    if (!entitlement || entitlement.provider === "polar" || entitlement.provider === null) {
      await openPortal();
      return;
    }
    setPortalLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/domestic/cancel", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as BillingStatusResponse | null;
      if (!response.ok) throw new Error(payload?.error || "구독 해지를 예약하지 못했습니다.");
      setConfirmOpen(false);
      await loadStatus();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "구독 해지를 예약하지 못했습니다.");
      setConfirmOpen(false);
    } finally {
      setPortalLoading(false);
    }
  }

  const active = entitlement?.status === "active";
  const scheduled = active && entitlement.cancelAtPeriodEnd;
  const periodEnd = entitlement?.endsAt || entitlement?.currentPeriodEnd;

  return (
    <>
      <SurfaceCard className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-app-hover text-app-primary">
              <CreditCard size={18} aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-app-text">구독 및 결제</h2>
              <p className="mt-1 text-sm leading-5 text-app-muted">
                월간 구독 상태, 결제수단과 다음 자동 결제를 관리합니다.
              </p>
            </div>
          </div>
          {entitlement ? <BillingBadge entitlement={entitlement} /> : null}
        </div>

        {loading ? (
          <div className="mt-5 flex min-h-24 items-center justify-center rounded-2xl border border-app-border bg-app-bg text-sm text-app-muted">
            <Loader2 className="mr-2 animate-spin" size={16} aria-hidden="true" />
            구독 상태를 불러오는 중입니다.
          </div>
        ) : null}

        {!loading && error ? (
          <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void loadStatus()}
              className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-sm font-semibold transition hover:bg-red-100"
            >
              <RefreshCw size={15} aria-hidden="true" /> 다시 확인
            </button>
          </div>
        ) : null}

        {!loading && !error && entitlement ? (
          <div className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <BillingFact
                label={scheduled ? "이용 종료 예정일" : "현재 결제 기간 종료일"}
                value={formatBillingDate(periodEnd)}
              />
              <BillingFact
                label="갱신 상태"
                value={scheduled ? "다음 자동 결제 중단됨" : renewalLabel(entitlement)}
              />
            </div>

            {scheduled ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
                <div className="flex items-start gap-2">
                  <CalendarClock className="mt-0.5 shrink-0" size={17} aria-hidden="true" />
                  <p>
                    <strong>해지 예정</strong> — {formatBillingDate(periodEnd)}까지 서비스를 이용할 수 있고 그 이후에는
                    자동 갱신되지 않습니다. 기간이 끝나기 전에는 Polar에서 해지 예약을 취소할 수 있습니다.
                  </p>
                </div>
              </div>
            ) : null}

            {active && !scheduled ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-app-border bg-app-bg p-4">
                <p className="max-w-xl text-sm leading-6 text-app-muted">
                  해지하면 다음 자동 결제가 중단되고 현재 결제 기간이 끝날 때까지 서비스를 계속 이용할 수 있습니다.
                </p>
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-red-300 bg-white px-4 text-sm font-semibold text-red-700 transition hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                >
                  구독 해지
                </button>
              </div>
            ) : null}

            {!active ? (
              <p className="rounded-2xl border border-app-border bg-app-bg p-4 text-sm leading-6 text-app-muted">
                {inactiveMessage(entitlement)}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-3 text-sm">
              {entitlement.provider === "polar" || entitlement.provider === null ? (
              <button
                type="button"
                onClick={() => void openPortal()}
                disabled={portalLoading}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-app-border bg-white px-4 font-semibold text-app-text transition hover:bg-app-hover disabled:cursor-wait disabled:opacity-60"
              >
                {portalLoading ? <Loader2 className="animate-spin" size={15} aria-hidden="true" /> : <ExternalLink size={15} aria-hidden="true" />}
                Polar 결제 관리
              </button>
              ) : null}
              <Link className="inline-flex min-h-11 items-center justify-center px-2 font-semibold text-app-primary" href="/refunds">
                환불 및 구독 해지 정책
              </Link>
            </div>
          </div>
        ) : null}
      </SurfaceCard>

      {confirmOpen ? (
        <CancellationDialog
          busy={portalLoading}
          domestic={Boolean(entitlement?.provider && entitlement.provider !== "polar")}
          periodEnd={periodEnd}
          onCancel={() => setConfirmOpen(false)}
          onContinue={() => void continueCancellation()}
        />
      ) : null}
    </>
  );
}

function CancellationDialog({
  busy,
  domestic,
  periodEnd,
  onCancel,
  onContinue
}: {
  busy: boolean;
  domestic: boolean;
  periodEnd: string | null | undefined;
  onCancel: () => void;
  onContinue: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]") || []
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [busy, onCancel]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4" role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-subscription-title"
        aria-describedby="cancel-subscription-description"
        className="w-full max-w-lg rounded-[26px] border border-red-100 bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
              <AlertTriangle size={19} aria-hidden="true" />
            </span>
            <div>
              <h2 id="cancel-subscription-title" className="text-lg font-semibold text-slate-950">구독을 해지할까요?</h2>
              <p id="cancel-subscription-description" className="mt-2 text-sm leading-6 text-slate-600">
                해지하면 다음 자동 결제가 중단됩니다. 현재 결제 기간이 끝날 때까지 서비스를 이용할 수 있으며,
                구독 해지는 현재 결제의 환불을 의미하지 않습니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="닫기"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            <X size={19} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
          예상 이용 종료일 <strong className="ml-1 text-slate-950">{formatBillingDate(periodEnd)}</strong>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onContinue}
            disabled={busy}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-wait disabled:bg-red-300"
          >
            {busy ? <Loader2 className="animate-spin" size={15} aria-hidden="true" /> : null}
            {domestic ? "구독 해지 예약" : "Polar에서 해지 계속"}
          </button>
        </div>
      </div>
    </div>
  );
}

function BillingBadge({ entitlement }: { entitlement: BillingEntitlement }) {
  const scheduled = entitlement.status === "active" && entitlement.cancelAtPeriodEnd;
  const label = scheduled ? "해지 예정" : statusLabel(entitlement.status);
  const className = scheduled
    ? "border-amber-200 bg-amber-50 text-amber-700"
    : entitlement.status === "active"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-slate-200 bg-slate-50 text-slate-600";
  return <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${className}`}>{label}</span>;
}

function BillingFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-app-border bg-white p-4">
      <p className="text-xs font-semibold text-app-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-app-text">{value}</p>
    </div>
  );
}

function statusLabel(status: BillingEntitlement["status"]) {
  const labels: Record<BillingEntitlement["status"], string> = {
    none: "구독 없음",
    checkout_pending: "결제 확인 중",
    active: "이용 중",
    past_due: "결제 확인 필요",
    canceled: "구독 종료",
    revoked: "이용 종료"
  };
  return labels[status];
}

function renewalLabel(entitlement: BillingEntitlement) {
  if (entitlement.status === "active") return "매월 자동 갱신";
  if (entitlement.status === "past_due") return "결제수단 확인 필요";
  return "자동 갱신 없음";
}

function inactiveMessage(entitlement: BillingEntitlement) {
  if (entitlement.status === "past_due") {
    return "결제가 완료되지 않았습니다. Polar 결제 관리에서 결제수단을 확인해 주세요.";
  }
  if (entitlement.status === "checkout_pending") {
    return "결제 결과를 확인하고 있습니다. 잠시 뒤 다시 확인해 주세요.";
  }
  if (entitlement.status === "canceled" || entitlement.status === "revoked") {
    return "현재 활성화된 구독이 없습니다. 유료 기능을 이용하려면 새 구독이 필요합니다.";
  }
  return "현재 연결된 유료 구독이 없습니다.";
}

function formatBillingDate(value: string | null | undefined) {
  if (!value) return "확인되지 않음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "확인되지 않음";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Seoul"
  }).format(date);
}
