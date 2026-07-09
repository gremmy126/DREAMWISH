"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useEffect } from "react";
import { PAYMENT_STATUS_KEY } from "@/src/lib/payments/payment-state";

export default function BillingSuccessPage() {
  useEffect(() => {
    window.localStorage.setItem(PAYMENT_STATUS_KEY, "true");
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-app-bg px-6">
      <section className="w-full max-w-xl rounded-app border border-app-border bg-white p-8 text-center shadow-soft">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[22px] bg-emerald-50 text-emerald-600">
          <CheckCircle2 size={28} />
        </div>
        <h1 className="mt-5 text-2xl font-semibold text-app-text">결제가 완료되었습니다</h1>
        <p className="mt-2 text-sm leading-6 text-app-muted">
          Polar 결제 성공 페이지입니다. 웹훅 수신 후 주문 상태가 내부 기록에 반영됩니다.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-app bg-app-primary px-5 text-sm font-semibold text-white"
        >
          AI Chat으로 이동
        </Link>
      </section>
    </main>
  );
}
