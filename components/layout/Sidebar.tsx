"use client";

import {
  Brain,
  Home,
  Info,
  MessageSquareText,
  UsersRound,
  X
} from "lucide-react";
import Link from "next/link";
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
  mobileOpen?: boolean;
  onMobileClose?: () => void;
};

export { SIDEBAR_NAV_ORDER };

// SEO: 사이드바 메뉴는 실제 <a href>로 렌더링되어 크롤러가 /chat·/memory·/team
// 을 탐색할 수 있다. 클릭 시에는 SPA 방식으로 전환된다.
const primaryItems: Array<{
  id: ViewId;
  href: string;
  icon: typeof Home;
}> = [
  { id: "chat", href: "/chat", icon: MessageSquareText },
  { id: "memory", href: "/memory", icon: Brain },
  { id: "team", href: "/team", icon: UsersRound }
];

export function Sidebar({
  activeView,
  onViewChange,
  mobileOpen = false,
  onMobileClose
}: SidebarProps) {
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden h-dvh w-[248px] min-h-0 flex-col border-r border-app-border bg-app-card/90 px-4 py-5 backdrop-blur-xl md:flex">
        <SidebarContent activeView={activeView} onViewChange={onViewChange} />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="메뉴 닫기"
            className="absolute inset-0 bg-slate-950/35"
            onClick={onMobileClose}
          />
          <aside className="relative flex h-dvh w-[min(84vw,300px)] min-h-0 flex-col bg-app-card px-4 py-5 shadow-app">
            <button
              type="button"
              aria-label="메뉴 닫기"
              onClick={onMobileClose}
              className="absolute right-3 top-5 flex h-10 w-10 items-center justify-center rounded-2xl border border-app-border text-app-muted transition hover:bg-app-hover"
            >
              <X size={17} />
            </button>
            <SidebarContent
              activeView={activeView}
              onViewChange={(view) => {
                onViewChange(view);
                onMobileClose?.();
              }}
            />
          </aside>
        </div>
      ) : null}
    </>
  );
}

function SidebarContent({ activeView, onViewChange }: SidebarProps) {
  const [companyOpen, setCompanyOpen] = useState(false);
  const { language, t } = useAppLanguage();

  return (
    <>
      <button
        type="button"
        onClick={() => onViewChange("chat")}
        className="mb-6 flex shrink-0 items-center gap-3 rounded-2xl px-2 py-1 text-left transition hover:bg-app-hover"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-app-primary text-white">
          <BrainLogo className="h-7 w-7" />
        </div>
        <div>
          <p className="text-sm font-extrabold tracking-tight text-app-text">DreamWish</p>
          <p className="text-xs text-app-muted">{t("sidebar.productSubtitle")}</p>
        </div>
      </button>

      <nav className="min-h-0 flex-1 overflow-y-auto pr-1 app-scrollbar">
        <p className="mb-2 px-3 text-[10px] font-extrabold uppercase tracking-widest text-app-muted">
          Workspace
        </p>
        <div className="space-y-0.5">
          {primaryItems.map((item) => {
            const Icon = item.icon;
            const active =
              activeView === item.id ||
              (item.id === "memory" && activeView === "files");

            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={active ? "page" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  onViewChange(item.id);
                }}
                className={`group relative flex h-10 w-full items-center gap-3 rounded-app-md px-3 text-sm transition ${
                  active
                    ? "bg-app-primary-soft font-semibold text-app-primary"
                    : "font-medium text-app-muted hover:bg-app-hover hover:text-app-text"
                }`}
              >
                <span
                  aria-hidden
                  className={`absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-app-primary transition-opacity ${
                    active ? "opacity-100" : "opacity-0"
                  }`}
                />
                <Icon size={18} strokeWidth={active ? 2 : 1.8} />
                <span>{getNavLabel(item.id, language)}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="mt-4 shrink-0 space-y-3">
        <UpgradeButton compact />
        <div className="rounded-app-lg border border-app-border bg-app-card p-4">
          <StorageStatus compact />
        </div>
        <button
          type="button"
          onClick={() => setCompanyOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-app-md border border-app-border bg-app-card px-3 py-2.5 text-xs font-semibold text-app-muted transition hover:bg-app-hover hover:text-app-text"
        >
          <Info size={14} />
          {t("sidebar.company")}
        </button>
      </div>

      {companyOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4">
          <div className="w-full max-w-[360px] rounded-app border border-app-border bg-app-card p-5 shadow-overlay">
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
    </>
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
