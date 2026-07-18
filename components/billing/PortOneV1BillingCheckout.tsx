"use client";

import { CreditCard, Loader2 } from "lucide-react";
import { useState } from "react";

let sdkPromise: Promise<void> | null = null;

export function PortOneV1BillingCheckout({
  onComplete,
  scope = "admin",
  mode = "sandbox"
}: {
  onComplete: (message: string) => void;
  scope?: "admin" | "customer";
  mode?: "sandbox" | "live";
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runKcpCheckout() {
    setLoading(true);
    setError(null);
    try {
      const endpoint = scope === "admin" ? "/api/admin/billing/test" : "/api/billing/domestic/billing-method";
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scope === "admin"
          ? { action: "prepare", provider: "portone_kcp_v1" }
          : { action: "create" })
      });
      const prepared = (await response.json()) as {
        attemptId?: string; impCode?: string; customerUid?: string;
        parameters?: Parameters<NonNullable<Window["IMP"]>["request_pay"]>[0]; error?: string;
      };
      if (!response.ok || !prepared.attemptId || !prepared.impCode || !prepared.customerUid || !prepared.parameters) {
        throw new Error(prepared.error || "KCP 테스트를 준비하지 못했습니다.");
      }
      await loadPortOneV1();
      const IMP = window.IMP;
      if (!IMP) throw new Error("결제창 SDK를 불러오지 못했습니다.");
      IMP.init(prepared.impCode);
      await new Promise<void>((resolve, reject) => {
        IMP.request_pay(prepared.parameters!, (result) => {
          if (result.success) resolve();
          else reject(new Error(result.error_msg || "빌링수단 발급이 취소되었습니다."));
        });
      });
      const confirmed = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", attemptId: prepared.attemptId, customerUid: prepared.customerUid })
      });
      const outcome = (await confirmed.json()) as { status?: string; billingMethodId?: string; error?: string };
      if (!confirmed.ok) throw new Error(outcome.error || "KCP 빌링수단 검증에 실패했습니다.");
      if (scope === "admin") {
        if (outcome.status !== "test_succeeded") throw new Error(outcome.error || "KCP 테스트 검증에 실패했습니다.");
        onComplete("NHN KCP 정기결제 테스트가 확인되었고 테스트 빌링수단은 폐기되었습니다.");
        return;
      }
      if (mode !== "live" || outcome.status !== "billing_method_ready" || !outcome.billingMethodId) {
        throw new Error("KCP 운영 빌링수단을 준비하지 못했습니다.");
      }
      const activated = await fetch("/api/billing/domestic/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billingMethodId: outcome.billingMethodId })
      });
      const subscription = await activated.json().catch(() => null) as { error?: string } | null;
      if (!activated.ok) throw new Error(subscription?.error || "구독을 활성화하지 못했습니다.");
      onComplete("NHN KCP 월간 구독이 활성화되었습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "KCP 테스트에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={() => void runKcpCheckout()} disabled={loading}
        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60">
        {loading ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
        {scope === "admin" ? "NHN KCP 정기결제 테스트" : "NHN KCP 월간 구독 시작"}
      </button>
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

function loadPortOneV1() {
  if (window.IMP) return Promise.resolve();
  sdkPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.iamport.kr/v1/iamport.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("결제창 SDK를 불러오지 못했습니다."));
    document.head.appendChild(script);
  });
  return sdkPromise;
}
