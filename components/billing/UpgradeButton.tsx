"use client";

import { CreditCard, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { useAccess } from "@/src/lib/auth/access-context";

export function UpgradeButton({ compact = false }: { compact?: boolean }) {
  const { access } = useAccess();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (access.adminBypass) return null;

  const paid = access.canUseApp && !access.requiresPayment;

  async function openBilling() {
    setLoading(true);
    setError(null);
    try {
      const endpoint = paid ? "/api/billing/portal" : "/api/billing/checkout";
      const response = await fetch(endpoint, { method: "POST" });
      const payload = (await response.json().catch(() => null)) as
        | { checkoutUrl?: string; portalUrl?: string; error?: string }
        | null;
      const destination = paid ? payload?.portalUrl : payload?.checkoutUrl;
      if (!response.ok || !destination) {
        throw new Error(payload?.error || "결제 페이지를 열지 못했습니다.");
      }
      window.location.assign(destination);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "결제 페이지를 열지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void openBilling()}
        disabled={loading}
        className={`flex w-full items-center justify-center gap-2 rounded-app font-semibold shadow-soft transition disabled:cursor-wait ${
          paid
            ? "border border-app-border bg-white text-app-text hover:bg-app-hover"
            : "bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:brightness-105"
        } ${compact ? "px-3 py-2.5 text-xs" : "px-4 py-3 text-sm"}`}
      >
        {loading ? <Loader2 size={15} className="animate-spin" /> : paid ? <CreditCard size={15} /> : <Sparkles size={15} />}
        {paid ? "구독 관리" : "업그레이드"}
      </button>
      {error ? <p className="px-1 text-[11px] leading-4 text-red-600">{error}</p> : null}
    </div>
  );
}
