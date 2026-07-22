"use client";

import { LockKeyhole, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { UpgradeButton } from "@/components/billing/UpgradeButton";
import { useAccess } from "@/src/lib/auth/access-context";

export function PaymentGate({ children }: { children: ReactNode }) {
  const { access } = useAccess();
  if (!access.requiresPayment) return <>{children}</>;

  return (
    <section className="flex min-h-[calc(100vh-150px)] items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg rounded-[28px] border border-violet-100 bg-white p-8 text-center shadow-app">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
          <LockKeyhole size={24} />
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-violet-600">DREAMWISH PRO</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-950">DreamWish AI를 활성화하세요</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          AI Chat과 결정 분석, 딥리서치, Memory, Team, AI Agent를 하나의 작업 공간에서 사용할 수 있습니다.
        </p>
        <div className="mx-auto mt-6 max-w-xs">
          <UpgradeButton />
        </div>
        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-slate-400">
          <ShieldCheck size={13} /> PortOne(국내 카드) 또는 Polar의 안전한 결제 페이지에서 처리됩니다.
        </p>
      </div>
    </section>
  );
}
