"use client";

import { Bell, Command, LogOut, Menu, Search, Settings, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { IconButton } from "@/components/Common/IconButton";
import { AUTH_SESSION_KEY } from "@/src/lib/auth/access-control";
import { AUTH_SESSION_CLEARED_EVENT } from "@/src/lib/auth/auth-events";
import { logoutFirebaseUser } from "@/src/lib/firebase/firebase-client";
import { useAppLanguage } from "@/src/lib/i18n/use-app-language";

export function Topbar({ onMenuOpen }: { onMenuOpen?: () => void } = {}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [account, setAccount] = useState<{ email: string; role: "admin" | "user" } | null>(null);
  const { t } = useAppLanguage();

  useEffect(() => {
    void fetch("/api/auth/me", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((body: { account?: { email?: string; role?: "admin" | "user" } } | null) => {
        if (body?.account?.email && body.account.role) {
          setAccount({ email: body.account.email, role: body.account.role });
          setEmail(body.account.email);
        }
      })
      .catch(() => undefined);
    try {
      const raw = window.localStorage.getItem(AUTH_SESSION_KEY);
      const session = raw ? (JSON.parse(raw) as { email?: string }) : null;
      setEmail(session?.email || "");
    } catch {
      setEmail("");
    }
  }, []);

  async function logout() {
    window.localStorage.removeItem(AUTH_SESSION_KEY);
    window.dispatchEvent(new Event(AUTH_SESSION_CLEARED_EVENT));
    await Promise.allSettled([
      logoutFirebaseUser(),
      fetch("/api/auth/logout", { method: "POST" })
    ]);
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-2 border-b border-app-border bg-app-bg/90 px-4 backdrop-blur-xl sm:gap-3 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        {onMenuOpen ? (
          <button
            type="button"
            onClick={onMenuOpen}
            aria-label="메뉴 열기"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-app-md border border-app-border bg-app-card text-app-muted transition hover:bg-app-hover hover:text-app-text md:hidden"
          >
            <Menu size={18} />
          </button>
        ) : null}
        <div className="flex h-10 w-full max-w-[520px] items-center gap-3 rounded-app-md border border-app-border bg-app-card px-3 transition focus-within:border-app-primary sm:px-4">
          <Search size={17} className="shrink-0 text-app-muted" />
          <input
            aria-label={t("topbar.searchAria")}
            className="min-w-0 flex-1 bg-transparent text-sm text-app-text outline-none placeholder:text-slate-400"
            placeholder={t("topbar.searchPlaceholder")}
          />
          <span className="hidden items-center gap-1 rounded-app-sm border border-app-border bg-app-bg px-2 py-1 text-xs font-medium text-app-muted sm:flex">
            <Command size={12} />
            K
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <IconButton label={t("topbar.notifications")}>
          <Bell size={17} />
        </IconButton>
        <div className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen((open) => !open)}
            className="flex h-10 w-10 items-center justify-center rounded-app-md border border-app-border bg-app-card text-app-muted transition hover:bg-app-hover hover:text-app-text"
            aria-label={t("topbar.profile")}
            title={t("topbar.profile")}
          >
            <UserRound size={17} />
          </button>
          {profileOpen ? (
            <div className="absolute right-0 top-12 z-30 w-56 rounded-app-lg border border-app-border bg-app-card p-2 shadow-app">
              <div className="border-b border-app-border px-3 py-2">
                <p className="text-[11px] font-semibold text-app-muted">{t("topbar.signedIn")}</p>
                <p className="mt-1 truncate text-xs font-semibold text-app-text">
                  {email || t("common.noAccount")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  window.dispatchEvent(
                    new CustomEvent("dreamwish:navigate", { detail: { view: "settings" } })
                  );
                }}
                className="mt-2 flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-xs font-semibold text-app-text transition hover:bg-app-hover hover:text-app-primary"
              >
                <Settings size={14} />
                {t("nav.settings")}
              </button>
              {account?.role === "admin" ? (
                <Link
                  href="/admin"
                  className="mt-2 flex min-h-10 w-full items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold text-app-primary transition hover:bg-app-hover"
                >
                  <ShieldCheck size={14} />
                  관리자 페이지
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => void logout()}
                className="mt-2 flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-xs font-semibold text-red-600 transition hover:bg-red-50"
              >
                <LogOut size={14} />
                {t("common.logout")}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
