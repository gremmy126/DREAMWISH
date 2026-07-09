"use client";

import { Bell, Command, Search, UserRound } from "lucide-react";
import { IconButton } from "@/components/Common/IconButton";
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher";

export function Topbar() {
  return (
    <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between bg-app-bg/88 px-6 backdrop-blur-xl">
      <div className="flex h-11 w-[520px] items-center gap-3 rounded-2xl border border-app-border bg-white px-4 shadow-soft">
        <Search size={18} className="text-slate-400" />
        <input
          aria-label="검색 또는 명령 입력"
          className="min-w-0 flex-1 bg-transparent text-sm text-app-text outline-none placeholder:text-slate-400"
          placeholder="DREAMWISH에서 검색하거나 명령을 입력..."
        />
        <span className="flex items-center gap-1 rounded-xl border border-app-border bg-app-bg px-2 py-1 text-xs font-medium text-slate-500">
          <Command size={12} />
          K
        </span>
      </div>

      <div className="flex items-center gap-3">
        <LanguageSwitcher />
        <IconButton label="알림">
          <Bell size={17} />
        </IconButton>
        <IconButton label="프로필">
          <UserRound size={17} />
        </IconButton>
      </div>
    </header>
  );
}
