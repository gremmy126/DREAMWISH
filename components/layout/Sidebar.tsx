"use client";

import {
  Brain,
  CalendarDays,
  Cable,
  DatabaseZap,
  File,
  Home,
  Info,
  MessageSquareText,
  ScrollText,
  Settings,
  Sparkles
} from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { StorageStatus } from "@/components/Common/StorageStatus";
import type { ViewId } from "@/components/layout/types";
import { AUTH_SESSION_KEY, type AccessState } from "@/src/lib/auth/access-control";
import { useAppLanguage } from "@/src/lib/i18n/use-app-language";
import { getNavLabel } from "@/src/lib/i18n/translations";
import { PAYMENT_STATUS_KEY, buildPaymentButtonState } from "@/src/lib/payments/payment-state";

type SidebarProps = {
  activeView: ViewId;
  onViewChange: (view: ViewId) => void;
};

export const SIDEBAR_NAV_ORDER = [
  "chat",
  "memory",
  "crm",
  "automation",
  "calendar",
  "files",
  "integrations",
  "settings"
] as const satisfies readonly ViewId[];

const primaryItems: Array<{
  id: ViewId;
  icon: typeof Home;
}> = [
  { id: "chat", icon: MessageSquareText },
  { id: "memory", icon: Brain },
  { id: "crm", icon: DatabaseZap },
  { id: "automation", icon: ScrollText },
  { id: "calendar", icon: CalendarDays },
  { id: "files", icon: File },
  { id: "integrations", icon: Cable },
  { id: "settings", icon: Settings }
];

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const [companyOpen, setCompanyOpen] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const paymentButton = buildPaymentButtonState(paymentComplete);
  const { language, t } = useAppLanguage();

  useEffect(() => {
    const readPaymentState = () => {
      const localPaymentComplete = window.localStorage.getItem(PAYMENT_STATUS_KEY) === "true";
      setPaymentComplete(localPaymentComplete);
      void refreshAccessState(localPaymentComplete).then((accountCanUseApp) => {
        setPaymentComplete(localPaymentComplete || accountCanUseApp);
      });
    };
    window.addEventListener("storage", readPaymentState);
    readPaymentState();
    return () => window.removeEventListener("storage", readPaymentState);
  }, []);

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex h-dvh w-[248px] min-h-0 flex-col border-r border-app-border bg-white/88 px-4 py-5 backdrop-blur-xl">
      <button
        type="button"
        onClick={() => onViewChange("chat")}
        className="mb-6 flex shrink-0 items-center gap-3 rounded-2xl px-2 py-1 text-left transition hover:bg-app-hover"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-app-primary text-white shadow-soft">
          <span className="text-sm font-semibold">DW</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-app-text">DREAMWISH</p>
          <p className="text-xs text-app-muted">{t("sidebar.productSubtitle")}</p>
        </div>
      </button>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 app-scrollbar">
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const active = activeView === item.id;

          return (
            <motion.button
              key={item.id}
              type="button"
              whileTap={{ scale: 0.98 }}
              onClick={() => onViewChange(item.id)}
              className={`group flex h-10 w-full items-center gap-3 rounded-2xl px-3 text-sm font-medium transition ${
                active
                  ? "bg-app-hover text-app-primary"
                  : "text-slate-600 hover:bg-app-hover hover:text-app-primary"
              }`}
            >
              <Icon size={18} strokeWidth={active ? 2 : 1.8} />
              <span>{getNavLabel(item.id, language)}</span>
            </motion.button>
          );
        })}
      </nav>

      <div className="mt-4 shrink-0 space-y-3">
        {!paymentButton.hidden ? (
          <button
            type="button"
            onClick={() => {
              window.location.assign(paymentButton.checkoutPath);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-app bg-app-hover px-3 py-3 text-xs font-semibold text-app-primary shadow-soft transition hover:bg-violet-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-primary active:scale-[0.99]"
            aria-label={t("sidebar.upgradeAria")}
            title={t("sidebar.upgradeDescription")}
          >
            <Sparkles size={14} />
            {t("sidebar.upgrade")}
          </button>
        ) : null}
        <div className="rounded-app border border-app-border bg-white p-4 shadow-soft">
          <StorageStatus compact />
        </div>
        <button
          type="button"
          onClick={() => setCompanyOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-app border border-app-border bg-white px-3 py-3 text-xs font-semibold text-app-text shadow-soft transition hover:bg-app-hover hover:text-app-primary"
        >
          <Info size={14} />
          {t("sidebar.company")}
        </button>
      </div>

      {companyOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 px-4">
          <div className="w-[360px] rounded-app border border-app-border bg-white p-5 shadow-app">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-app-text">{t("sidebar.company")}</h2>
              <button
                type="button"
                onClick={() => setCompanyOpen(false)}
                className="rounded-2xl border border-app-border px-3 py-1 text-xs font-semibold text-app-muted transition hover:bg-app-hover hover:text-app-primary"
              >
                {t("common.close")}
              </button>
            </div>
            <dl className="space-y-3 text-sm">
              <InfoRow label={t("sidebar.businessNumber")} value="147-07-03187" />
              <InfoRow label={t("sidebar.commerceNumber")} value="2026-부산사상구-0185" />
              <InfoRow label={t("sidebar.companyName")} value="드림위시" />
              <InfoRow label={t("sidebar.phone")} value="051-916-1222" />
              <InfoRow label={t("sidebar.address")} value="부산 사상구 학장로 8-37, 202동 2504호" />
            </dl>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

async function refreshAccessState(localPaymentComplete: boolean) {
  try {
    const raw = window.localStorage.getItem(AUTH_SESSION_KEY);
    const session = raw ? (JSON.parse(raw) as { email?: string }) : null;
    if (!session?.email) return false;

    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: session.email })
    });
    const data = (await response.json()) as { access?: AccessState };
    if (data.access?.canUseApp) {
      window.localStorage.setItem(PAYMENT_STATUS_KEY, "true");
      return true;
    } else if (!localPaymentComplete) {
      window.localStorage.removeItem(PAYMENT_STATUS_KEY);
    }
    return false;
  } catch {
    if (!localPaymentComplete) window.localStorage.removeItem(PAYMENT_STATUS_KEY);
    return false;
  }
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-app-muted">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-app-text">{value}</dd>
    </div>
  );
}
