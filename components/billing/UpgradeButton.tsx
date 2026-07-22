"use client";

import { CreditCard, Globe2, Loader2, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { useAccess } from "@/src/lib/auth/access-context";
import { CouponField } from "@/components/billing/CouponField";
import { DomesticCheckoutDialog } from "@/components/billing/DomesticCheckoutDialog";

export function UpgradeButton({ compact = false }: { compact?: boolean }) {
  const { access } = useAccess();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [domesticOpen, setDomesticOpen] = useState(false);
  const [domesticMode, setDomesticMode] = useState<"sandbox" | "live">("sandbox");
  const [domesticFlow, setDomesticFlow] = useState<"v1" | "v2">("v2");
  const [domesticEnabled, setDomesticEnabled] = useState(false);
  const [domesticMissing, setDomesticMissing] = useState<string[]>([]);

  const admin = access.adminBypass;
  const paid = !admin && access.canUseApp && !access.requiresPayment;

  // 결제는 국내 카드(PortOne)와 Polar 두 경로를 모두 지원한다. 결제하기를
  // 누르면 항상 결제 수단 선택 화면을 먼저 보여주고, 사용자가 고른 방식으로
  // 진행한다. PortOne이 서버에 설정되지 않은 경우에는 선택지에 준비 중임을
  // 표시한다.
  async function openBilling() {
    if (admin) return;
    setLoading(true);
    setError(null);
    try {
      if (!paid) {
        const configResponse = await fetch("/api/billing/domestic/config");
        const domestic = (await configResponse.json().catch(() => null)) as {
          enabled?: boolean;
          environment?: "sandbox" | "live";
          flow?: "v1" | "v2";
          missingVariables?: string[];
        } | null;
        const enabled = Boolean(configResponse.ok && domestic?.enabled);
        setDomesticEnabled(enabled);
        setDomesticMissing(Array.isArray(domestic?.missingVariables) ? domestic.missingVariables : []);
        setDomesticMode(domestic?.environment || "sandbox");
        setDomesticFlow(domestic?.flow || "v2");
        setChooserOpen(true);
        return;
      }
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as { portalUrl?: string; error?: string } | null;
      if (!response.ok || !payload?.portalUrl) {
        throw new Error(payload?.error || "결제 페이지를 열지 못했습니다.");
      }
      window.location.assign(payload.portalUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "결제 페이지를 열지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function startPolarCheckout() {
    const response = await fetch("/api/billing/checkout", { method: "POST" });
    const payload = (await response.json().catch(() => null)) as { checkoutUrl?: string; error?: string } | null;
    if (!response.ok || !payload?.checkoutUrl) {
      throw new Error(payload?.error || "결제 페이지를 열지 못했습니다.");
    }
    window.location.assign(payload.checkoutUrl);
  }

  async function choosePolar() {
    setLoading(true);
    setError(null);
    try {
      await startPolarCheckout();
      setChooserOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "결제 페이지를 열지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  function chooseDomestic() {
    setChooserOpen(false);
    setDomesticOpen(true);
  }

  return (
    <>
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void openBilling()}
        disabled={loading || admin}
        className={`flex w-full items-center justify-center gap-2 rounded-app font-semibold shadow-soft transition disabled:cursor-wait ${
          admin
            ? "border border-violet-200 bg-violet-50 text-violet-700"
            : paid
            ? "border border-app-border bg-white text-app-text hover:bg-app-hover"
            : "bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:brightness-105"
        } ${compact ? "px-3 py-2.5 text-xs" : "px-4 py-3 text-sm"}`}
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : paid ? <CreditCard size={15} /> : <Sparkles size={15} />}
        {admin ? "관리자 무료 이용" : paid ? "결제 관리" : "결제하기"}
      </button>
      {error ? <p className="px-1 text-[11px] leading-4 text-red-600">{error}</p> : null}
    </div>

    {chooserOpen ? (
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-4"
        onMouseDown={(event) => {
          if (event.currentTarget === event.target) setChooserOpen(false);
        }}
      >
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-method-title"
          className="w-full max-w-md rounded-3xl border border-white/30 bg-white p-6 shadow-2xl"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-600">Payment</p>
              <h2 id="payment-method-title" className="mt-1 text-xl font-bold text-slate-900">결제 수단 선택</h2>
            </div>
            <button
              type="button"
              onClick={() => setChooserOpen(false)}
              aria-label="닫기"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl text-slate-500 hover:bg-slate-100"
            >
              <X size={20} />
            </button>
          </div>
          <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50/40 p-3">
            <CouponField />
            <p className="mt-2 text-[11px] leading-4 text-slate-500">
              할인 쿠폰은 결제 금액에 적용되고, 이용권 쿠폰은 결제 없이 바로 이용 기간이 부여됩니다.
            </p>
          </div>

          <div className="mt-3 space-y-3">
            <button
              type="button"
              disabled={!domesticEnabled}
              onClick={chooseDomestic}
              className={`w-full rounded-2xl border p-4 text-left transition ${
                domesticEnabled
                  ? "border-violet-200 bg-violet-50 hover:border-violet-400"
                  : "cursor-not-allowed border-slate-200 bg-slate-50 opacity-70"
              }`}
            >
              <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <CreditCard size={16} className="text-violet-600" />
                국내 카드 결제 (PortOne)
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                {domesticEnabled
                  ? "국내 신용·체크카드로 월간 구독을 결제합니다. KPN·NHN KCP 정기결제."
                  : domesticMissing.length
                    ? `준비 중입니다 — 서버 환경 변수 누락: ${domesticMissing.join(", ")}`
                    : "준비 중입니다 — 서버 설정에서 국내 결제가 비활성화되어 있습니다."}
              </p>
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => void choosePolar()}
              className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-violet-300 disabled:opacity-60"
            >
              <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Globe2 size={16} className="text-violet-600" />
                Polar 결제 (해외 카드 지원)
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                Polar Checkout으로 이동해 구독을 시작합니다. 해외 카드와 영수증 포털 지원.
              </p>
            </button>
          </div>
          {error ? <p className="mt-3 text-[11px] leading-4 text-red-600">{error}</p> : null}
        </section>
      </div>
    ) : null}

    <DomesticCheckoutDialog open={domesticOpen} mode={domesticMode} flow={domesticFlow} onClose={() => setDomesticOpen(false)} />
    </>
  );
}
