"use client";

import { Check, Loader2, TicketPercent, X } from "lucide-react";
import { useState } from "react";

type AppliedCoupon =
  | { kind: "access"; codeHint: string; accessDays: number | null }
  | {
      kind: "discount";
      codeHint: string;
      benefit: string;
      baseAmount: number;
      discountedAmount: number;
    };

type ApplyResponse =
  | {
      ok: true;
      kind: "access";
      coupon: { type: string; accessDays: number | null; codeHint: string };
      message?: string;
    }
  | {
      ok: true;
      kind: "discount";
      coupon: { type: string; value: number | null; currency: string | null; codeHint: string };
      preview: { baseAmount: number; discountedAmount: number; discountAmount: number };
      message?: string;
    }
  | { ok: false; error?: string };

function benefitLabel(coupon: { type: string; value: number | null; currency: string | null }) {
  if (coupon.type === "percentage_discount") return `${coupon.value ?? 0}% 할인`;
  const currency = coupon.currency && coupon.currency.toUpperCase() !== "KRW" ? coupon.currency.toUpperCase() : "원";
  return `${(coupon.value ?? 0).toLocaleString("ko-KR")}${currency === "원" ? "원" : ` ${currency}`} 할인`;
}

// 결제 화면에서 할인/이용권 쿠폰 코드를 직접 입력·적용한다. 적용 시 서버가
// 예약(reserved)해 두고, 실제 결제에서 금액을 다시 계산해 반영한다.
export function CouponField({ onChange }: { onChange?: (applied: boolean) => void }) {
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState<AppliedCoupon | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    const trimmed = code.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/coupons/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed })
      });
      const data = (await response.json().catch(() => ({}))) as ApplyResponse;
      if (!response.ok || !data.ok) {
        throw new Error(("error" in data && data.error) || "쿠폰을 적용하지 못했습니다.");
      }
      if (data.kind === "access") {
        setApplied({ kind: "access", codeHint: data.coupon.codeHint, accessDays: data.coupon.accessDays });
      } else {
        setApplied({
          kind: "discount",
          codeHint: data.coupon.codeHint,
          benefit: benefitLabel(data.coupon),
          baseAmount: data.preview.baseAmount,
          discountedAmount: data.preview.discountedAmount
        });
      }
      setCode("");
      onChange?.(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "쿠폰을 적용하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await fetch("/api/coupons/apply", { method: "DELETE" });
      setApplied(null);
      onChange?.(false);
    } catch {
      setError("쿠폰을 해제하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (applied) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <Check size={16} className="mt-0.5 shrink-0 text-emerald-600" />
            <div>
              <p className="text-sm font-bold text-emerald-800">
                {applied.kind === "access"
                  ? `${applied.accessDays ?? 0}일 이용권 적용됨`
                  : `${applied.benefit} 적용됨`}
              </p>
              <p className="mt-0.5 text-[11px] text-emerald-700">
                쿠폰 {applied.codeHint}
                {applied.kind === "discount"
                  ? ` · ${applied.baseAmount.toLocaleString("ko-KR")}원 → ${applied.discountedAmount.toLocaleString("ko-KR")}원`
                  : " · 새로고침하면 바로 이용할 수 있습니다"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
            aria-label="쿠폰 해제"
            title="쿠폰 해제"
          >
            <X size={15} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor="checkout-coupon" className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-700">
        <TicketPercent size={14} className="text-violet-600" />
        쿠폰 코드 (선택)
      </label>
      <div className="flex items-center gap-2">
        <input
          id="checkout-coupon"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void apply();
            }
          }}
          placeholder="할인 또는 이용권 쿠폰"
          className="min-h-11 flex-1 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-violet-400"
        />
        <button
          type="button"
          onClick={() => void apply()}
          disabled={busy || !code.trim()}
          className="flex min-h-11 items-center gap-1.5 rounded-2xl bg-violet-600 px-4 text-sm font-bold text-white transition hover:brightness-105 disabled:opacity-50"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : null}
          적용
        </button>
      </div>
      {error ? <p className="mt-2 text-[11px] leading-4 text-red-600">{error}</p> : null}
    </div>
  );
}
