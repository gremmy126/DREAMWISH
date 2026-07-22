"use client";

import PortOne from "@portone/browser-sdk/v2";
import { BarChart3, Coins, Loader2, RotateCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { readApiResponse } from "@/src/lib/api/api-response";

type CreditTier = {
  id: string;
  provider: string;
  label: string;
  useCase: string;
  priceKrwPerMillion: number;
  configured: boolean;
  balance: { available: number; reserved: number; consumed: number };
};

type UsageRow = {
  tierId: string;
  label: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  settledCredits: number;
  remainingCredits: number;
  lastUsedAt: string | null;
};

type CheckoutParams = {
  attemptId: string;
  purchaseId: string;
  storeId: string;
  channelKey: string;
  paymentId: string;
  orderName: string;
  totalAmount: number;
  currency: "KRW";
  payMethod: "CARD";
  isTest?: boolean;
  ok?: boolean;
  error?: string;
};

function formatCredits(value: number) {
  return value.toLocaleString("ko-KR");
}

export function AiCreditStore() {
  const [tiers, setTiers] = useState<CreditTier[]>([]);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [environment, setEnvironment] = useState<"sandbox" | "live">("sandbox");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [buyingTier, setBuyingTier] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [productsRes, usageRes] = await Promise.all([
        fetch("/api/ai/credit-products", { cache: "no-store" }),
        fetch("/api/ai/usage", { cache: "no-store" })
      ]);
      const products = await readApiResponse<{ tiers: CreditTier[]; environment: "sandbox" | "live" }>(productsRes);
      const usageData = await readApiResponse<{ usage: UsageRow[] }>(usageRes);
      setTiers(products.tiers || []);
      setEnvironment(products.environment || "sandbox");
      setUsage(usageData.usage || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "크레딧 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function buy(tier: CreditTier) {
    if (buyingTier) return;
    const quantity = Math.min(100, Math.max(1, Math.round(quantities[tier.id] || 1)));
    setBuyingTier(tier.id);
    setError(null);
    setNotice(null);
    try {
      const created = await fetch("/api/billing/domestic/ai-credits/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tierId: tier.id, quantity })
      });
      const checkout = (await created.json()) as CheckoutParams;
      if (!created.ok || !checkout.attemptId) {
        throw new Error(checkout.error || "결제를 시작할 수 없습니다.");
      }

      const result = await PortOne.requestPayment({
        storeId: checkout.storeId,
        channelKey: checkout.channelKey,
        paymentId: checkout.paymentId,
        orderName: checkout.orderName,
        totalAmount: checkout.totalAmount,
        currency: checkout.currency,
        payMethod: checkout.payMethod,
        customData: { attemptId: checkout.attemptId, purchaseId: checkout.purchaseId }
      });
      if (!result) throw new Error("결제창 응답을 받지 못했습니다.");
      if (result.code) throw new Error(result.message || "결제가 취소되었습니다.");

      const verified = await fetch("/api/billing/domestic/ai-credits/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId: checkout.attemptId,
          providerPaymentId: checkout.paymentId,
          purchaseId: checkout.purchaseId
        })
      });
      const outcome = (await verified.json()) as { ok?: boolean; credited?: boolean; isTest?: boolean; error?: string };
      if (!verified.ok) throw new Error(outcome.error || "결제 확인에 실패했습니다.");
      setNotice(
        outcome.credited
          ? `${tier.label} 크레딧이 충전되었습니다.`
          : "테스트 결제가 확인되었습니다. 실제 크레딧은 지급되지 않습니다."
      );
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "결제에 실패했습니다.");
    } finally {
      setBuyingTier(null);
    }
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-app-muted">
        <Loader2 size={15} className="animate-spin" /> 크레딧 정보를 불러오는 중…
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-bold text-app-text">
          <Coins size={16} className="text-app-primary" /> AI 크레딧
          {environment === "sandbox" ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
              샌드박스(테스트)
            </span>
          ) : null}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-app-border bg-app-card px-2.5 py-1.5 text-[11px] font-semibold text-app-muted transition hover:text-app-primary"
        >
          <RotateCw size={12} /> 새로고침
        </button>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      ) : null}
      {notice ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{notice}</p>
      ) : null}

      <p className="text-[11px] leading-4 text-app-muted">
        모델 등급별로 100만 크레딧을 선불로 구매합니다. 입력·출력 토큰 1개당 1크레딧이 차감됩니다. 등급 간 크레딧
        이동은 불가합니다.
      </p>

      <div className="grid gap-2.5 sm:grid-cols-2">
        {tiers.map((tier) => (
          <div
            key={tier.id}
            className={`rounded-2xl border p-3.5 ${
              tier.configured ? "border-app-border bg-app-card" : "border-app-border bg-app-hover/40 opacity-70"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-app-text">{tier.label}</p>
                <p className="mt-0.5 text-[10.5px] text-app-muted">{tier.useCase}</p>
              </div>
              <p className="shrink-0 text-xs font-bold text-app-primary">
                ₩{tier.priceKrwPerMillion.toLocaleString("ko-KR")}
                <span className="text-[10px] font-medium text-app-muted"> /100만</span>
              </p>
            </div>
            <p className="mt-2 text-[11px] text-app-text">
              보유 크레딧 <b>{formatCredits(tier.balance.available)}</b>
              {tier.balance.reserved > 0 ? (
                <span className="text-app-muted"> · 예약 {formatCredits(tier.balance.reserved)}</span>
              ) : null}
            </p>
            {tier.configured ? (
              <div className="mt-2.5 flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={quantities[tier.id] || 1}
                  onChange={(event) =>
                    setQuantities((previous) => ({ ...previous, [tier.id]: Number(event.target.value) }))
                  }
                  className="h-8 w-16 rounded-lg border border-app-border bg-app-bg px-2 text-xs text-app-text outline-none focus:border-app-primary"
                  aria-label={`${tier.label} 구매 수량`}
                />
                <button
                  type="button"
                  disabled={Boolean(buyingTier)}
                  onClick={() => void buy(tier)}
                  className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-app-primary px-2 text-[11px] font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {buyingTier === tier.id ? <Loader2 size={12} className="animate-spin" /> : <Coins size={12} />}
                  구매
                </button>
              </div>
            ) : (
              <p className="mt-2.5 text-[10.5px] font-semibold text-app-muted">현재 사용할 수 없는 등급입니다.</p>
            )}
          </div>
        ))}
      </div>

      {usage.length > 0 ? (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-app-text">
            <BarChart3 size={14} className="text-app-primary" /> 등급별 사용량
          </p>
          <div className="overflow-x-auto rounded-2xl border border-app-border">
            <table className="w-full min-w-[520px] text-[11px]">
              <thead>
                <tr className="bg-app-hover/50 text-left text-app-muted">
                  <th className="px-3 py-2 font-semibold">등급</th>
                  <th className="px-3 py-2 font-semibold">호출</th>
                  <th className="px-3 py-2 font-semibold">입력</th>
                  <th className="px-3 py-2 font-semibold">출력</th>
                  <th className="px-3 py-2 font-semibold">합계</th>
                  <th className="px-3 py-2 font-semibold">잔여</th>
                  <th className="px-3 py-2 font-semibold">최근 사용</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((row) => (
                  <tr key={row.tierId}>
                    <td className="border-t border-app-border px-3 py-2 font-semibold text-app-text">{row.label}</td>
                    <td className="border-t border-app-border px-3 py-2 text-app-text">{formatCredits(row.calls)}</td>
                    <td className="border-t border-app-border px-3 py-2 text-app-muted">{formatCredits(row.inputTokens)}</td>
                    <td className="border-t border-app-border px-3 py-2 text-app-muted">{formatCredits(row.outputTokens)}</td>
                    <td className="border-t border-app-border px-3 py-2 text-app-text">{formatCredits(row.totalTokens)}</td>
                    <td className="border-t border-app-border px-3 py-2 font-semibold text-app-primary">{formatCredits(row.remainingCredits)}</td>
                    <td className="border-t border-app-border px-3 py-2 text-app-muted">
                      {row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleString("ko-KR") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
