"use client";

import { ArrowUp, Bot, CalendarDays, FileUp, Mail, Mic, Sparkles, UsersRound } from "lucide-react";
import Link from "next/link";
import { GuestAdSlot } from "@/components/ads/GuestAdSlot";
import { openCookieSettings } from "@/components/consent/consent";

const EXAMPLE_PROMPTS = [
  { label: "오늘 일정을 정리해줘", icon: CalendarDays },
  { label: "회의를 요약해줘", icon: FileUp },
  { label: "프로젝트를 생성해줘", icon: Sparkles },
  { label: "Gmail을 확인해줘", icon: Mail },
  { label: "CRM 고객을 찾아줘", icon: UsersRound }
] as const;

type GuestChatHomeProps = {
  onLoginRequest: () => void;
  restoringSession?: boolean;
};

export function GuestChatHome({ onLoginRequest, restoringSession = false }: GuestChatHomeProps) {
  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.10),_transparent_36%),linear-gradient(to_bottom,#ffffff,#f8fafc)] text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3" aria-label="DREAMWISH 홈">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 text-white shadow-lg shadow-violet-200">
              <Sparkles size={17} aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-extrabold tracking-tight">DREAMWISH</span>
              <span className="block text-[10px] font-semibold text-slate-500">개인두뇌 AI</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={onLoginRequest}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
          >
            Login
          </button>
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100dvh-9rem)] w-full max-w-5xl flex-col px-4 pb-8 pt-8 sm:px-6 sm:pt-12">
        <section aria-labelledby="guest-chat-title" className="mx-auto flex w-full max-w-4xl flex-1 flex-col">
          <div className="text-center">
            <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-100 bg-white text-violet-600 shadow-sm">
              <Bot size={23} aria-hidden="true" />
            </span>
            <h1 id="guest-chat-title" className="mt-5 text-3xl font-bold tracking-[-0.035em] text-slate-950 sm:text-4xl">
              무엇을 도와드릴까요?
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">
              로그인하면 내 일정, 문서, 고객, 프로젝트와 기억을 연결한 AI를 바로 사용할 수 있습니다.
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {EXAMPLE_PROMPTS.map(({ label, icon: Icon }) => (
              <button
                key={label}
                type="button"
                onClick={onLoginRequest}
                className="group min-h-28 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-[0_8px_28px_rgba(15,23,42,0.045)] transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-[0_14px_34px_rgba(109,40,217,0.10)]"
              >
                <Icon size={18} className="text-violet-600" aria-hidden="true" />
                <span className="mt-5 block text-sm font-bold leading-5 text-slate-700 group-hover:text-violet-700">
                  {label}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-auto pt-8 sm:pt-12">
            <div className="rounded-[26px] border border-slate-200 bg-white p-3 shadow-[0_20px_65px_rgba(15,23,42,0.10)]">
              <input
                type="text"
                readOnly
                aria-disabled="true"
                aria-label="AI 메시지 입력"
                placeholder="로그인 후 AI를 사용할 수 있습니다."
                onClick={onLoginRequest}
                onFocus={onLoginRequest}
                className="h-12 w-full cursor-pointer bg-transparent px-3 text-sm font-medium text-slate-700 outline-none placeholder:text-slate-400"
              />
              <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                <div className="flex items-center gap-1">
                  <GuestControl label="파일 업로드" onClick={onLoginRequest}><FileUp size={18} /></GuestControl>
                  <GuestControl label="음성 입력" onClick={onLoginRequest}><Mic size={18} /></GuestControl>
                </div>
                <button
                  type="button"
                  aria-disabled="true"
                  aria-label="메시지 전송"
                  onClick={onLoginRequest}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-200 text-slate-500 transition hover:bg-violet-600 hover:text-white"
                >
                  <ArrowUp size={18} />
                </button>
              </div>
            </div>
            <p className="mt-3 text-center text-xs font-medium text-slate-400" aria-live="polite">
              {restoringSession ? "기존 로그인 정보를 확인하고 있습니다…" : "입력하거나 예시 질문을 선택하면 로그인 창이 열립니다."}
            </p>
          </div>
        </section>
      </main>

      {!restoringSession ? <GuestAdSlot /> : null}

      <footer className="border-t border-slate-200/80 bg-white/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-slate-500 sm:px-6">
          <span>© {new Date().getFullYear()} DREAMWISH</span>
          <nav className="flex flex-wrap items-center gap-4" aria-label="정책">
            <Link href="/privacy" className="hover:text-slate-950">Privacy</Link>
            <Link href="/cookies" className="hover:text-slate-950">Cookies</Link>
            <Link href="/terms" className="hover:text-slate-950">Terms</Link>
            <button type="button" onClick={openCookieSettings} className="hover:text-slate-950">쿠키 설정</button>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function GuestControl({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-disabled="true"
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-violet-50 hover:text-violet-600"
    >
      {children}
    </button>
  );
}
