"use client";

import Link from "next/link";
import {
  Activity,
  BadgePercent,
  Bot,
  ChevronLeft,
  ClipboardList,
  Database,
  KeyRound,
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
  | "automation"
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
  { id: "automation", label: "자동화", icon: Bot },
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
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[260px] border-r border-app-border bg-white lg:block">
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
          <aside className="relative h-[100dvh] w-[min(86vw,320px)] bg-white shadow-app">
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
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="관리자 메뉴 열기"
              onClick={() => setMobileOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-app-border bg-white lg:hidden"
            >
              <Menu size={19} />
            </button>
            <div>
              <p className="text-xs font-semibold text-app-primary">DREAMWISH CONTROL CENTER</p>
              <h1 className="text-lg font-bold">{NAVIGATION.find((item) => item.id === section)?.label}</h1>
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-app-border bg-white px-4 text-xs font-bold shadow-soft transition hover:bg-app-hover"
          >
            <ChevronLeft size={15} />
            서비스로 돌아가기
          </Link>
        </header>

        <main className="mx-auto w-full max-w-[1540px] p-4 sm:p-6">
          {section === "dashboard" ? <AdminOverview /> : null}
          {section === "users" ? <AdminUsers /> : null}
          {section === "access" ? <AdminAccessGrants /> : null}
          {section === "coupons" ? <AdminCoupons /> : null}
          {section === "billing" ? <AdminBillingPanel /> : null}
          {section === "automation" ? <AutomationPanel /> : null}
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
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-app-primary text-white shadow-soft">
          <ShieldCheck size={21} />
        </span>
        <div>
          <p className="text-sm font-black tracking-tight">DREAMWISH</p>
          <p className="text-[10px] font-bold text-app-muted">ADMINISTRATION</p>
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
              className={`flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 text-left text-sm font-semibold transition ${
                active ? "bg-app-hover text-app-primary" : "text-slate-600 hover:bg-slate-50"
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

function AutomationPanel() {
  return <Placeholder icon={Activity} title="자동화 운영" description="실행·승인 대기·실패 상태를 확인합니다. Dead Letter Queue와 감사 로그는 각각 전용 메뉴에서 관리합니다." />;
}

function Placeholder({ icon: Icon, title, description }: { icon: typeof Activity; title: string; description: string }) {
  return (
    <section className="rounded-[22px] border border-app-border bg-white p-6 shadow-soft">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-app-hover text-app-primary"><Icon size={21} /></span>
      <h2 className="mt-5 text-lg font-bold">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-app-muted">{description}</p>
    </section>
  );
}
