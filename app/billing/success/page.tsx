"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

export default function BillingSuccessPage() {
  const [state, setState] = useState<"checking" | "ready" | "delayed">("checking");

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    async function checkStatus() {
      attempts += 1;
      const response = await fetch("/api/billing/status", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as
        | { access?: { canUseApp?: boolean } }
        | null;
      if (cancelled) return;
      if (response.ok && payload?.access?.canUseApp) {
        setState("ready");
        window.setTimeout(() => window.location.replace("/"), 700);
        return;
      }
      if (attempts >= 12) {
        setState("delayed");
        return;
      }
      window.setTimeout(() => void checkStatus(), 1500);
    }

    void checkStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <section className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-8 text-center shadow-xl shadow-slate-200/50">
        {state === "ready" ? (
          <CheckCircle2 className="mx-auto text-emerald-500" size={42} />
        ) : (
          <Loader2 className="mx-auto animate-spin text-violet-600" size={42} />
        )}
        <h1 className="mt-5 text-xl font-bold text-slate-950">
          {state === "ready" ? "구독이 활성화되었습니다" : "결제 상태를 확인하고 있습니다"}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {state === "delayed"
            ? "결제 반영이 조금 늦어지고 있습니다. 잠시 후 홈에서 다시 확인해 주세요."
            : "페이지를 새로고침하지 않아도 작업 공간으로 자동 이동합니다."}
        </p>
        {state === "delayed" ? (
          <a href="/" className="mt-6 inline-flex rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white">
            홈으로 이동
          </a>
        ) : null}
      </section>
    </main>
  );
}
