"use client";

import { Bell, Command, LogOut, Search, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { IconButton } from "@/components/Common/IconButton";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";
import { AUTH_SESSION_KEY } from "@/src/lib/auth/access-control";
import { AUTH_SESSION_CLEARED_EVENT } from "@/src/lib/auth/auth-events";
import { logoutFirebaseUser } from "@/src/lib/firebase/firebase-client";
import { useAppLanguage } from "@/src/lib/i18n/use-app-language";

export function Topbar() {
  const [profileOpen, setProfileOpen] = useState(false);
  const [email, setEmail] = useState("");
  const { t } = useAppLanguage();

  useEffect(() => {
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
    <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between bg-app-bg/88 px-6 backdrop-blur-xl">
      <div className="flex h-11 w-[520px] items-center gap-3 rounded-2xl border border-app-border bg-white px-4 shadow-soft">
        <Search size={18} className="text-slate-400" />
        <input
          aria-label={t("topbar.searchAria")}
          className="min-w-0 flex-1 bg-transparent text-sm text-app-text outline-none placeholder:text-slate-400"
          placeholder={t("topbar.searchPlaceholder")}
        />
        <span className="flex items-center gap-1 rounded-xl border border-app-border bg-app-bg px-2 py-1 text-xs font-medium text-slate-500">
          <Command size={12} />
          K
        </span>
      </div>

      <div className="flex items-center gap-3">
        <LanguageSwitcher />
        <IconButton label={t("topbar.notifications")}>
          <Bell size={17} />
        </IconButton>
        <div className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen((open) => !open)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-app-border bg-white text-slate-500 shadow-soft transition hover:bg-app-hover hover:text-app-primary"
            aria-label={t("topbar.profile")}
            title={t("topbar.profile")}
          >
            <UserRound size={17} />
          </button>
          {profileOpen ? (
            <div className="absolute right-0 top-12 z-30 w-56 rounded-app border border-app-border bg-white p-2 shadow-app">
              <div className="border-b border-app-border px-3 py-2">
                <p className="text-[11px] font-semibold text-app-muted">{t("topbar.signedIn")}</p>
                <p className="mt-1 truncate text-xs font-semibold text-app-text">
                  {email || t("common.noAccount")}
                </p>
              </div>
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
