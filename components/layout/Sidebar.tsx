"use client";

import {
  Brain,
  Home,
  Info,
  MessageSquareText,
  UsersRound
} from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { StorageStatus } from "@/components/Common/StorageStatus";
import { BrainLogo } from "@/components/brand/BrainLogo";
import { UpgradeButton } from "@/components/billing/UpgradeButton";
import { SIDEBAR_NAV_ORDER, type ViewId } from "@/components/layout/types";
import { useAppLanguage } from "@/src/lib/i18n/use-app-language";
import { getNavLabel } from "@/src/lib/i18n/translations";

type SidebarProps = {
  activeView: ViewId;
  onViewChange: (view: ViewId) => void;
};

export { SIDEBAR_NAV_ORDER };

const primaryItems: Array<{
  id: ViewId;
  icon: typeof Home;
}> = [
  { id: "chat", icon: MessageSquareText },
  { id: "memory", icon: Brain },
  { id: "team", icon: UsersRound }
];

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const [companyOpen, setCompanyOpen] = useState(false);
  const { language, t } = useAppLanguage();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden h-dvh w-[248px] min-h-0 flex-col border-r border-app-border bg-white/88 px-4 py-5 backdrop-blur-xl md:flex">
      <button
        type="button"
        onClick={() => onViewChange("chat")}
        className="mb-6 flex shrink-0 items-center gap-3 rounded-2xl px-2 py-1 text-left transition hover:bg-app-hover"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-app-primary text-white shadow-soft">
          <BrainLogo className="h-7 w-7" />
        </div>
        <div>
          <p className="text-sm font-semibold text-app-text">DREAMWISH</p>
          <p className="text-xs text-app-muted">{t("sidebar.productSubtitle")}</p>
        </div>
      </button>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 app-scrollbar">
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const active =
            activeView === item.id ||
            (item.id === "memory" && activeView === "files");

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
        <UpgradeButton compact />
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
              <InfoRow label={t("sidebar.address")} value="부산 사상구 덕상로 8-37, 202동 2504호" />
            </dl>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-app-muted">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-app-text">{value}</dd>
    </div>
  );
}
