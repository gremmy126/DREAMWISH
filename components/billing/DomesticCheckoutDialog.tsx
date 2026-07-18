"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PortOneV2Checkout } from "./PortOneV2Checkout";
import { PortOneV1BillingCheckout } from "./PortOneV1BillingCheckout";

export function DomesticCheckoutDialog({ open, mode, flow, onClose }: { open: boolean; mode: "sandbox" | "live"; flow: "v1" | "v2"; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-4" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="domestic-checkout-title" className="w-full max-w-md rounded-3xl border border-white/30 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-600">{mode === "sandbox" ? "Sandbox" : "Subscription"}</p>
            <h2 id="domestic-checkout-title" className="mt-1 text-xl font-bold text-slate-900">{mode === "sandbox" ? "테스트 결제" : "월간 구독 결제"}</h2>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="닫기" className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl text-slate-500 hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>
        {mode === "sandbox" ? <div className="my-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          테스트 결제입니다. 실제 청구 및 구독 활성화 없음. 결제 성공 후에도 이용 권한·매출·쿠폰은 변경되지 않습니다.
        </div> : <div className="my-5 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm leading-6 text-violet-900">
          카드 정보는 결제 공급자 화면에서만 처리됩니다. 결제가 확인되면 월간 구독과 다음 결제 일정이 활성화됩니다.
        </div>}
        {message ? <p role="status" className="mb-4 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">{message}</p> : null}
        {flow === "v1"
          ? <PortOneV1BillingCheckout scope="customer" mode={mode} onComplete={setMessage} />
          : <PortOneV2Checkout mode={mode} onComplete={setMessage} />}
      </section>
    </div>
  );
}
