"use client";

import { ArrowUp, Bot, CalendarDays, FileUp, Mail, Menu, Mic, Sparkles, UsersRound, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { GuestAdSlot } from "@/components/ads/GuestAdSlot";
import { BrainLogo } from "@/components/brand/BrainLogo";
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
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.10),_transparent_36%),linear-gradient(to_bottom,#ffffff,#f8fafc)] text-slate-950">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2.5 sm:gap-3" aria-label="DREAMWISH 홈">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-blue-600 text-white shadow-lg shadow-violet-200">
              <BrainLogo className="h-6 w-6" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-extrabold tracking-tight">DreamWish</span>
              <span className="hidden text-[10px] font-semibold text-slate-500 sm:block">Better Decisions Powered by AI</span>
            </span>
          </Link>
          <nav aria-label="주요 메뉴" className="hidden items-center gap-5 text-sm font-semibold text-slate-600 md:flex">
            <Link className="transition hover:text-violet-700" href="/chat">AI Chat</Link>
            <Link className="transition hover:text-violet-700" href="/memory">Memory</Link>
            <Link className="transition hover:text-violet-700" href="/team">Team</Link>
            <Link className="transition hover:text-violet-700" href="/pricing">Pricing</Link>
          </nav>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Link
              href="/login"
              onClick={(event) => {
                event.preventDefault();
                onLoginRequest();
              }}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-950 px-3.5 text-xs font-bold text-white transition hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 sm:px-5 sm:text-sm"
            >
              Login
            </Link>
            <Link
              href="/signup"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-violet-600 px-3.5 text-xs font-bold text-white transition hover:bg-violet-700 sm:px-5 sm:text-sm"
            >
              Get Started
            </Link>
            <button
              type="button"
              aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-violet-300 hover:text-violet-700 md:hidden"
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
        {menuOpen ? (
          <nav
            aria-label="모바일 메뉴"
            className="border-t border-slate-200/70 bg-white/95 px-4 py-3 md:hidden"
          >
            {[
              ["AI Chat", "/chat"],
              ["Memory", "/memory"],
              ["Team", "/team"],
              ["Pricing", "/pricing"]
            ].map(([label, href]) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-violet-50 hover:text-violet-700"
              >
                {label}
              </Link>
            ))}
          </nav>
        ) : null}
      </header>

      <main className="mx-auto flex min-h-[calc(100dvh-9rem)] w-full max-w-6xl flex-col px-4 pb-8 pt-10 sm:px-6 sm:pt-14">
        <section aria-labelledby="hero-title" className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-extrabold tracking-wide text-violet-700">
              <Sparkles size={12} aria-hidden="true" />
              AI-DRIVEN DECISION INTELLIGENCE
            </p>
            <h1 id="hero-title" className="mt-5 text-[clamp(2rem,8vw,3rem)] font-extrabold leading-tight tracking-[-0.03em]">
              <span className="block text-slate-950">Better Decisions.</span>
              <span className="block bg-gradient-to-r from-violet-600 to-blue-600 bg-clip-text text-transparent">
                Powered by AI.
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-7 text-slate-600 sm:text-base">
              DreamWish는 AI가 질문을 이해하고, 필요한 정보를 조사하며, 여러 가능성을
              시뮬레이션하고, 팀의 의견과 과거의 기억을 연결해 더 나은 최종 결정을
              돕는 AI 의사결정 파트너입니다. 결정 이후에는 AI Agent가 웹사이트·앱·
              프로그램·이미지까지 직접 만들어 실행을 돕습니다.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onLoginRequest}
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-gradient-to-r from-violet-600 to-blue-600 px-7 text-sm font-bold text-white shadow-lg shadow-violet-200 transition hover:opacity-90"
              >
                무료로 시작하기 →
              </button>
              <a
                href="#how-it-works"
                className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-7 text-sm font-bold text-slate-700 transition hover:border-violet-300 hover:text-violet-700"
              >
                작동 방식 보기
              </a>
            </div>
            <p className="mt-4 text-xs font-medium text-slate-500">
              데이터는 사용자가 통제하며, 중요한 결정은 사용자의 최종 승인을 거칩니다.
            </p>
          </div>
          <div className="mx-auto w-full max-w-md" aria-hidden="true">
            <svg viewBox="0 0 400 340" className="h-auto w-full" role="img" aria-label="AI Chat, Deep Research, Team Intelligence, Simulation, Memory OS가 하나의 결정으로 수렴하는 Decision Core">
              <defs>
                <radialGradient id="core" cx="0.5" cy="0.45" r="0.6">
                  <stop offset="0" stopColor="#8b7cff" />
                  <stop offset="0.6" stopColor="#6d5df6" />
                  <stop offset="1" stopColor="#4f46e5" />
                </radialGradient>
                <linearGradient id="orbit" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#c7bfff" />
                  <stop offset="1" stopColor="#93c5fd" />
                </linearGradient>
              </defs>
              <ellipse cx="200" cy="170" rx="165" ry="70" fill="none" stroke="url(#orbit)" strokeOpacity="0.55" />
              <ellipse cx="200" cy="170" rx="120" ry="115" fill="none" stroke="url(#orbit)" strokeOpacity="0.4" transform="rotate(-18 200 170)" />
              <circle cx="200" cy="170" r="52" fill="url(#core)" opacity="0.16" />
              <circle cx="200" cy="170" r="36" fill="url(#core)" />
              <path d="M200 148 l7 15 16 2 -11.5 11 3 16 -14.5 -8 -14.5 8 3 -16 -11.5 -11 16 -2 z" fill="#ffffff" />
              <g fontFamily="Inter, 'Noto Sans KR', sans-serif" fontSize="11" fontWeight="700">
                <g><rect x="120" y="52" width="60" height="24" rx="12" fill="#ffffff" stroke="#e4defc" /><text x="150" y="68" textAnchor="middle" fill="#6d5df6">AI Chat</text></g>
                <g><rect x="268" y="70" width="98" height="24" rx="12" fill="#ffffff" stroke="#e4defc" /><text x="317" y="86" textAnchor="middle" fill="#6d5df6">Deep Research</text></g>
                <g><rect x="288" y="176" width="104" height="24" rx="12" fill="#ffffff" stroke="#e4defc" /><text x="340" y="192" textAnchor="middle" fill="#6d5df6">Team Intelligence</text></g>
                <g><rect x="230" y="272" width="80" height="24" rx="12" fill="#ffffff" stroke="#e4defc" /><text x="270" y="288" textAnchor="middle" fill="#6d5df6">Memory OS</text></g>
                <g><rect x="76" y="252" width="82" height="24" rx="12" fill="#ffffff" stroke="#e4defc" /><text x="117" y="268" textAnchor="middle" fill="#6d5df6">Simulation</text></g>
                <g><rect x="18" y="150" width="96" height="24" rx="12" fill="#ffffff" stroke="#c7bfff" /><text x="66" y="166" textAnchor="middle" fill="#4f46e5">Final Decision</text></g>
              </g>
              <g stroke="#c7bfff" strokeOpacity="0.7" strokeDasharray="2 4">
                <line x1="150" y1="76" x2="188" y2="140" /><line x1="310" y1="94" x2="228" y2="146" />
                <line x1="316" y1="188" x2="248" y2="176" /><line x1="266" y1="272" x2="216" y2="204" />
                <line x1="122" y1="252" x2="180" y2="202" /><line x1="98" y1="162" x2="152" y2="168" />
              </g>
            </svg>
          </div>
        </section>

        <section id="how-it-works" aria-label="의사결정 흐름" className="mt-16 rounded-[26px] border border-slate-200 bg-white p-6 shadow-[0_20px_65px_rgba(15,23,42,0.06)] sm:p-8">
          <h2 className="text-center text-lg font-extrabold text-slate-950">
            질문에서 결정, 그리고 성장까지 하나의 흐름으로
          </h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {[
              ["질문", "결정하고 싶은 문제를 자연어로 입력하세요"],
              ["AI 인터뷰", "AI가 목표·예산·조건·위험 수준을 질문합니다"],
              ["딥리서치", "설정한 범위와 깊이로 근거를 수집합니다"],
              ["팀 의견", "익명 설문으로 내부 의견을 반영합니다"],
              ["시뮬레이션", "낙관·기준·비관 시나리오를 비교합니다"],
              ["최종 결론", "추천안·반대 의견·리스크를 보고서로 제공합니다"],
              ["Memory 학습", "결정과 결과를 기억해 다음 판단에 활용합니다"]
            ].map(([title, description], index) => (
              <div key={title} className="text-center">
                <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-50 text-sm font-extrabold text-violet-700">
                  {index + 1}
                </span>
                <p className="mt-2 text-sm font-bold text-slate-900">{title}</p>
                <p className="mt-1 text-[11px] leading-4 text-slate-500">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section aria-label="핵심 기능" className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["AI Chat", "AI가 먼저 필요한 질문을 하고 답변으로 문제를 구조화합니다. 딥리서치·팀 설문·시뮬레이션·최종 보고서가 하나의 흐름으로 진행됩니다.", "/chat"],
            ["AI Agent", "만들고 싶은 것을 설명하면 AI가 웹사이트·앱·프로그램·이미지를 직접 생성합니다. 미리보기로 확인하고 수정 요청 후 파일로 내려받으세요.", "/chat"],
            ["Memory", "대화·조사·결정·교훈과 실제 결과를 연결합니다. AI가 저장 후보를 제안하고, 사용자가 승인한 정보만 확정 Memory가 됩니다.", "/memory"],
            ["Team", "AI가 설문을 만들고 익명 응답을 분석해 조직의 지지도·실행 가능성·반대 의견과 숨은 위험을 최종 결정에 반영합니다.", "/team"]
          ].map(([title, description, href]) => (
            <Link
              key={title}
              href={href}
              className="rounded-[22px] border border-slate-200 bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-violet-200"
            >
              <p className="text-base font-extrabold text-slate-950">{title}</p>
              <p className="mt-2 text-xs leading-5 text-slate-600">{description}</p>
              <p className="mt-3 text-xs font-bold text-violet-700">자세히 보기 →</p>
            </Link>
          ))}
        </section>

        <section aria-label="제품 미리보기" className="mt-10 rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_20px_65px_rgba(15,23,42,0.06)]">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[11px] font-extrabold text-slate-500">AI 인터뷰</p>
              <div className="mt-2 space-y-2">
                <p className="rounded-xl bg-white p-2.5 text-[11px] font-semibold text-slate-700">이 결정의 가장 중요한 목표는 무엇인가요?</p>
                <p className="ml-6 rounded-xl bg-violet-600 p-2.5 text-[11px] font-semibold text-white">여기에 답변이 이어집니다.</p>
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[11px] font-extrabold text-slate-500">진행 단계</p>
              <ul className="mt-2 space-y-1.5 text-[11px] font-semibold text-slate-600">
                <li>✓ 질문</li><li>✓ 인터뷰</li><li>◌ 딥리서치</li><li>◌ 팀 의견 수렴</li><li>◌ 시뮬레이션</li><li>◌ 최종 결론</li><li>◌ 메모리 기억 학습</li>
              </ul>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-[11px] font-extrabold text-slate-500">AI 분석 보고서</p>
              <ul className="mt-2 space-y-1.5 text-[11px] leading-4 text-slate-600">
                <li>· 핵심 결과가 여기에 정리됩니다.</li>
                <li>· 조사한 근거와 출처가 표시됩니다.</li>
                <li>· 시나리오별 차이를 확인할 수 있습니다.</li>
                <li>· 팀의 익명 의견이 반영됩니다.</li>
                <li>· 반대 의견과 주요 리스크가 표시됩니다.</li>
              </ul>
            </div>
          </div>
        </section>

        <section aria-labelledby="guest-chat-title" className="mx-auto mt-14 flex w-full max-w-4xl flex-1 flex-col">
          <div className="text-center">
            <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-violet-100 bg-white text-violet-600 shadow-sm">
              <Bot size={23} aria-hidden="true" />
            </span>
            <h2 id="guest-chat-title" className="mt-5 text-[clamp(1.5rem,6vw,2.25rem)] font-bold tracking-[-0.035em] text-slate-950">
              무엇을 도와드릴까요?
            </h2>
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

        <section aria-label="시작하기" className="mt-14 overflow-hidden rounded-[26px] bg-gradient-to-r from-slate-950 via-[#312e81] to-violet-700 p-8 text-center sm:p-10">
          <h2 className="text-xl font-extrabold text-white sm:text-2xl">
            지금의 질문을, 더 나은 결정으로 바꾸세요.
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-xs leading-6 text-violet-100 sm:text-sm">
            AI가 조사하고, 비교하고, 팀의 의견을 반영하여 실행 가능한 결론까지 도와드립니다.
          </p>
          <button
            type="button"
            onClick={onLoginRequest}
            className="mt-5 inline-flex h-12 items-center justify-center rounded-2xl bg-white px-8 text-sm font-extrabold text-violet-700 shadow-lg transition hover:bg-violet-50"
          >
            무료로 시작하기
          </button>
        </section>
      </main>

      {!restoringSession ? <GuestAdSlot /> : null}

      <footer className="border-t border-slate-200/80 bg-white/70">
        <div className="mx-auto max-w-6xl px-4 pt-5 sm:px-6">
          <nav className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-600" aria-label="주요 페이지">
            <Link href="/chat" className="hover:text-violet-700">AI Chat</Link>
            <Link href="/memory" className="hover:text-violet-700">Memory</Link>
            <Link href="/team" className="hover:text-violet-700">Team</Link>
            <Link href="/pricing" className="hover:text-violet-700">Pricing</Link>
            <Link href="/login" className="hover:text-violet-700">Login</Link>
            <Link href="/signup" className="hover:text-violet-700">Get Started</Link>
          </nav>
        </div>
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-slate-500 sm:px-6">
          <span>© {new Date().getFullYear()} DreamWish</span>
          <nav className="flex flex-wrap items-center gap-4" aria-label="정책">
            <Link href="/privacy" className="hover:text-slate-950">Privacy</Link>
            <Link href="/cookies" className="hover:text-slate-950">Cookies</Link>
            <Link href="/terms" className="hover:text-slate-950">Terms</Link>
            <Link href="/refunds" className="hover:text-slate-950">Refunds</Link>
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
