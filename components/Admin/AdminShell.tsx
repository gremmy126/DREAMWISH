"use client";

import Link from "next/link";
import {
  BadgePercent,
  ChevronLeft,
  ClipboardList,
  Database,
  LayoutDashboard,
  Menu,
  Settings2,
  ShieldCheck,
  TicketCheck,
  WalletCards,
  Users,
  X
} from "lucide-react";
import { useState } from "react";
import { AdminOverview } from "./AdminOverview";
import { AdminOperations } from "./AdminOperations";
import { AdminSystemStatus } from "./AdminSystemStatus";
import { AdminUsers } from "./AdminUsers";
import { AdminCoupons } from "./AdminCoupons";
import { AdminAccessGrants } from "./AdminAccessGrants";
import { AdminBillingPanel } from "./AdminBillingPanel";

type AdminSection =
  | "dashboard"
  | "users"
  | "access"
  | "coupons"
  | "billing"
  | "dlq"
  | "audit"
  | "system";

const NAVIGATION: Array<{
  id: AdminSection;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { id: "dashboard", label: "대시보드", icon: LayoutDashboard },
  { id: "users", label: "사용자", icon: Users },
  { id: "access", label: "구독·이용권", icon: TicketCheck },
  { id: "coupons", label: "쿠폰", icon: BadgePercent },
  { id: "billing", label: "결제", icon: WalletCards },
  { id: "dlq", label: "DLQ", icon: Database },
  { id: "audit", label: "감사 로그", icon: ClipboardList },
  { id: "system", label: "시스템", icon: Settings2 }
];

export function AdminShell({ account }: { account: { email: string; name: string | null } }) {
  const [section, setSection] = useState<AdminSection>("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);

  function navigate(next: AdminSection) {
    setSection(next);
    setMobileOpen(false);
  }

  return (
    <div className="min-h-[100dvh] bg-app-bg text-app-text">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[260px] border-r border-app-border bg-app-card lg:block">
        <AdminNavigation account={account} section={section} onNavigate={navigate} />
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="관리자 메뉴 닫기"
            className="absolute inset-0 bg-slate-950/35"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative h-[100dvh] w-[min(86vw,320px)] bg-app-card shadow-app">
            <button
              type="button"
              aria-label="관리자 메뉴 닫기"
              onClick={() => setMobileOpen(false)}
              className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-app-border"
            >
              <X size={18} />
            </button>
            <AdminNavigation account={account} section={section} onNavigate={navigate} />
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-[260px]">
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-app-border bg-app-bg/90 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="관리자 메뉴 열기"
              onClick={() => setMobileOpen(true)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-app-border bg-app-card lg:hidden"
            >
              <Menu size={19} />
            </button>
            <div className="min-w-0">
              <p className="truncate text-[10px] font-extrabold uppercase tracking-widest text-app-primary">
                Admin Console
              </p>
              <h1 className="truncate text-base font-extrabold tracking-tight sm:text-lg">
                {NAVIGATION.find((item) => item.id === section)?.label}
              </h1>
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-2xl border border-app-border bg-app-card px-3 text-xs font-bold shadow-soft transition hover:bg-app-hover sm:px-4"
          >
            <ChevronLeft size={15} />
            <span className="hidden sm:inline">서비스로 돌아가기</span>
            <span className="sm:hidden">서비스</span>
          </Link>
        </header>

        <main className="mx-auto w-full max-w-[1540px] p-4 sm:p-6">
          {section === "dashboard" ? <AdminOverview /> : null}
          {section === "users" ? <AdminUsers /> : null}
          {section === "access" ? <AdminAccessGrants /> : null}
          {section === "coupons" ? <AdminCoupons /> : null}
          {section === "billing" ? <AdminBillingPanel /> : null}
          {section === "dlq" ? <AdminOperations initialView="dlq" /> : null}
          {section === "audit" ? <AdminOperations initialView="audit" /> : null}
          {section === "system" ? <AdminSystemStatus /> : null}
        </main>
      </div>
    </div>
  );
}

function AdminNavigation({
  account,
  section,
  onNavigate
}: {
  account: { email: string; name: string | null };
  section: AdminSection;
  onNavigate: (section: AdminSection) => void;
}) {
  return (
    <div className="flex h-full flex-col p-4">
      <div className="flex min-h-[72px] items-center gap-3 px-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-app-primary text-white">
          <ShieldCheck size={21} />
        </span>
        <div>
          <p className="text-sm font-extrabold tracking-tight">DreamWish</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-app-muted">Admin Console</p>
        </div>
      </div>
      <nav className="app-scrollbar mt-5 flex-1 space-y-1 overflow-y-auto">
        {NAVIGATION.map((item) => {
          const Icon = item.icon;
          const active = item.id === section;
          return (
            <button
              type="button"
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`relative flex min-h-11 w-full items-center gap-3 rounded-app-md px-3 text-left text-sm transition ${
                active
                  ? "bg-app-primary-soft font-semibold text-app-primary"
                  : "font-medium text-app-muted hover:bg-app-hover hover:text-app-text"
              }`}
            >
              <Icon size={17} />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="rounded-2xl border border-app-border bg-app-bg p-3">
        <p className="truncate text-xs font-bold">{account.name || "관리자"}</p>
        <p className="mt-1 truncate text-[10px] text-app-muted">{account.email}</p>
      </div>
    </div>
  );
}

