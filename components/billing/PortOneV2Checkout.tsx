"use client";

import PortOne from "@portone/browser-sdk/v2";
import { CreditCard, Loader2 } from "lucide-react";
import { useState } from "react";

type CheckoutPayload = {
  attemptId: string;
  paymentId: string;
  storeId: string;
  channelKey: string;
  orderName: string;
  totalAmount: number;
  currency: "KRW";
  payMethod: "CARD";
  environment: "sandbox";
};

export function PortOneV2Checkout({ mode = "sandbox", onComplete }: { mode?: "sandbox" | "live"; onComplete: (message: string) => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runTestCheckout() {
    setLoading(true);
    setError(null);
    try {
      const created = await fetch("/api/billing/domestic/checkout", { method: "POST" });
      const checkout = (await created.json()) as CheckoutPayload & { ok?: boolean; error?: string };
      if (!created.ok || !checkout.attemptId) throw new Error(checkout.error || "테스트 결제를 만들 수 없습니다.");

      const result = await PortOne.requestPayment({
        storeId: checkout.storeId,
        channelKey: checkout.channelKey,
        paymentId: checkout.paymentId,
        orderName: checkout.orderName,
        totalAmount: checkout.totalAmount,
        currency: checkout.currency,
        payMethod: checkout.payMethod,
        customData: { attemptId: checkout.attemptId }
      });
      if (!result) throw new Error("결제창 응답을 받지 못했습니다.");
      if (result.code) throw new Error(result.message || "테스트 결제가 취소되었습니다.");

      const verified = await fetch("/api/billing/domestic/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId: checkout.attemptId, providerPaymentId: checkout.paymentId })
      });
      const outcome = (await verified.json()) as { status?: string; error?: string };
      if (!verified.ok || outcome.status !== "test_succeeded") {
        throw new Error(outcome.error || "테스트 결제 검증에 실패했습니다.");
      }
      onComplete("테스트 결제가 확인되었습니다. 실제 청구 및 구독 활성화는 없습니다.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "테스트 결제에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function runRecurring() {
    setLoading(true);
    setError(null);
    try {
      const created = await fetch("/api/billing/domestic/billing-method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create" })
      });
      const setup = (await created.json()) as {
        attemptId?: string; issueId?: string; storeId?: string; channelKey?: string;
        billingKeyMethod?: "CARD"; displayAmount?: number; currency?: "KRW";
        customer?: { customerId: string; fullName: string; email: string }; error?: string;
      };
      if (!created.ok || !setup.attemptId || !setup.storeId || !setup.issueId) {
        throw new Error(setup.error || "정기결제 테스트를 만들 수 없습니다.");
      }
      const result = await PortOne.requestIssueBillingKey({
        storeId: setup.storeId,
        channelKey: setup.channelKey,
        issueId: setup.issueId,
        issueName: "DREAMWISH 정기결제 테스트",
        billingKeyMethod: setup.billingKeyMethod || "CARD",
        displayAmount: setup.displayAmount,
        currency: setup.currency,
        customer: setup.customer
      });
      if (!result) throw new Error("결제창 응답을 받지 못했습니다.");
      if (result.code || !result.billingKey) throw new Error(result.message || "빌링수단 발급이 취소되었습니다.");
      const confirmed = await fetch("/api/billing/domestic/billing-method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", attemptId: setup.attemptId, billingKey: result.billingKey })
      });
      const outcome = (await confirmed.json()) as { status?: string; error?: string };
      if (!confirmed.ok || (mode === "sandbox" && outcome.status !== "test_succeeded")) {
        throw new Error(outcome.error || "정기결제 테스트 검증에 실패했습니다.");
      }
      if (mode === "live") {
        const billingMethodId = (outcome as { billingMethodId?: string }).billingMethodId;
        if (!billingMethodId) throw new Error("확인된 빌링수단을 찾을 수 없습니다.");
        const activated = await fetch("/api/billing/domestic/subscription", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ billingMethodId })
        });
        const subscription = await activated.json().catch(() => null) as { error?: string } | null;
        if (!activated.ok) throw new Error(subscription?.error || "구독을 활성화하지 못했습니다.");
        onComplete("월간 구독이 활성화되었습니다.");
      } else {
        onComplete("정기결제 테스트가 확인되었고 테스트 빌링수단은 폐기되었습니다. 실제 구독은 생성되지 않았습니다.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "정기결제 테스트에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      {mode === "sandbox" ? <button
        type="button"
        onClick={() => void runTestCheckout()}
        disabled={loading}
        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-wait disabled:opacity-70"
      >
        {loading ? <Loader2 size={17} className="animate-spin" /> : <CreditCard size={17} />}
        일반 결제 테스트
      </button> : null}
      <button
        type="button"
        onClick={() => void runRecurring()}
        disabled={loading}
        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-800 transition hover:bg-violet-100 disabled:cursor-wait disabled:opacity-70"
      >
        {loading ? <Loader2 size={17} className="animate-spin" /> : <CreditCard size={17} />}
        {mode === "sandbox" ? "정기결제 테스트" : "월간 구독 시작"}
      </button>
      {error ? <p role="alert" className="text-sm leading-5 text-red-600">{error}</p> : null}
    </div>
  );
}
