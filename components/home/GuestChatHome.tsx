"use client";

import {
  ArrowRight,
  ArrowUp,
  BarChart3,
  Bot,
  BrainCircuit,
  CalendarDays,
  FileUp,
  Landmark,
  Mail,
  Menu,
  MessageSquareText,
  Mic,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Wand2,
  X
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { GuestAdSlot } from "@/components/ads/GuestAdSlot";
import { BrainLogo } from "@/components/brand/BrainLogo";
import { ProductDemoPlayer } from "@/components/home/ProductDemoPlayer";
import { openCookieSettings } from "@/components/consent/consent";

const EXAMPLE_PROMPTS = [
  { label: "오늘 일정을 정리해줘", icon: CalendarDays },
  { label: "회의를 요약해줘", icon: FileUp },
  { label: "프로젝트를 생성해줘", icon: Sparkles },
  { label: "Gmail을 확인해줘", icon: Mail },
  { label: "CRM 고객을 찾아줘", icon: UsersRound }
] as const;

const NAV_LINKS = [
  ["AI Chat", "/chat"],
  ["Memory", "/memory"],
  ["Team", "/team"],
  ["Pricing", "/pricing"]
] as const;

const DECISION_FLOW = [
  ["Ask", "질문", "결정하고 싶은 문제를 자연어로 입력합니다"],
  ["Analyze", "분석", "AI가 조건을 확인하고 근거를 조사합니다"],
  ["Compare", "비교", "선택지를 같은 기준으로 나란히 비교합니다"],
  ["Simulate", "시뮬레이션", "낙관·기준·비관 시나리오를 검증합니다"],
  ["Decide", "결정", "추천안·반대 의견·리스크를 보고서로 받습니다"],
  ["Remember", "기억", "결정과 결과가 Memory에 학습됩니다"]
] as const;

type GuestChatHomeProps = {
  onLoginRequest: () => void;
  restoringSession?: boolean;
};

export function GuestChatHome({ onLoginRequest, restoringSession = false }: GuestChatHomeProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-white text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label="DreamWish 홈">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white">
              <BrainLogo className="h-6 w-6" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-extrabold tracking-tight">DreamWish</span>
              <span className="hidden text-[10px] font-semibold text-slate-400 sm:block">
                Better Decisions Powered by AI
              </span>
            </span>
          </Link>
          <nav aria-label="주요 메뉴" className="hidden items-center gap-7 text-sm font-semibold text-slate-600 md:flex">
            {NAV_LINKS.map(([label, href]) => (
              <Link key={href} className="transition hover:text-slate-950" href={href}>
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/login"
              onClick={(event) => {
                event.preventDefault();
                onLoginRequest();
              }}
              className="hidden h-10 items-center justify-center rounded-xl px-4 text-sm font-bold text-slate-600 transition hover:text-slate-950 sm:inline-flex"
            >
              Login
            </Link>
            <Link
              href="/signup"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-900 px-4 text-xs font-bold text-white transition hover:bg-violet-700 sm:px-5 sm:text-sm"
            >
              시작하기
            </Link>
            <button
              type="button"
              aria-label={menuOpen ? "메뉴 닫기" : "메뉴 열기"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:text-slate-950 md:hidden"
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
        {menuOpen ? (
          <nav aria-label="모바일 메뉴" className="border-t border-slate-200 bg-white px-4 py-3 md:hidden">
            {[...NAV_LINKS, ["Login", "/login"] as const].map(([label, href]) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMenuOpen(false)}
                className="block rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
              >
                {label}
              </Link>
            ))}
          </nav>
        ) : null}
      </header>

      <main>
        {/* Hero + 제품 데모 */}
        <section aria-labelledby="hero-title" className="border-b border-slate-100">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:pb-20 lg:pt-20">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold tracking-wide text-slate-600">
                <Sparkles size={12} className="text-violet-600" aria-hidden="true" />
                AI 의사결정 플랫폼
              </p>
              <h1 id="hero-title" className="mt-5 text-[clamp(2rem,6vw,2.9rem)] font-extrabold leading-[1.15] tracking-[-0.03em] text-slate-950">
                복잡한 결정을,
                <br />
                확신 있는 실행으로.
              </h1>
              <p className="mt-5 max-w-xl text-[15px] leading-7 text-slate-600">
                DreamWish는 질문을 이해하고, 근거를 조사하고, 시나리오를 시뮬레이션해
                더 나은 결정을 돕습니다. 결정 이후에는 AI Agent가 웹사이트·앱·이미지 같은
                실행물을 직접 만들어 검토와 승인까지 한 흐름으로 이어줍니다.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={onLoginRequest}
                  className="inline-flex h-12 items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-6 text-sm font-bold text-white transition hover:bg-violet-700"
                >
                  무료로 시작하기
                  <ArrowRight size={15} aria-hidden="true" />
                </button>
                <a
                  href="#demo"
                  className="inline-flex h-12 items-center justify-center rounded-xl border border-slate-200 px-6 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:text-slate-950"
                >
                  제품 데모 보기
                </a>
              </div>
              <p className="mt-4 text-xs font-medium text-slate-400">
                데이터는 사용자가 통제하며, 중요한 실행은 항상 사용자의 승인을 거칩니다.
              </p>
            </div>
            <div id="demo" className="w-full scroll-mt-24">
              <ProductDemoPlayer />
            </div>
          </div>
        </section>

        {/* 의사결정 흐름 */}
        <section aria-labelledby="flow-title" className="border-b border-slate-100 bg-slate-50/60">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <h2 id="flow-title" className="text-center text-xl font-extrabold tracking-tight text-slate-950 sm:text-2xl">
              질문에서 실행까지, 하나의 흐름
            </h2>
            <ol className="mt-8 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {DECISION_FLOW.map(([en, ko, description], index) => (
                <li key={en} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-[10px] font-extrabold tracking-widest text-violet-600">
                    {String(index + 1).padStart(2, "0")} · {en.toUpperCase()}
                  </p>
                  <p className="mt-1.5 text-sm font-extrabold text-slate-900">{ko}</p>
                  <p className="mt-1 text-[11.5px] leading-4 text-slate-500">{description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 핵심 기능 */}
        <section aria-labelledby="features-title" className="border-b border-slate-100">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <div className="max-w-2xl">
              <h2 id="features-title" className="text-xl font-extrabold tracking-tight text-slate-950 sm:text-2xl">
                결정에 필요한 모든 것이 한곳에
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                흩어진 도구 대신, 조사·비교·팀 의견·기억·실행이 하나의 작업 공간에서 이어집니다.
              </p>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {[
                {
                  icon: BarChart3,
                  title: "결정 분석",
                  description:
                    "AI가 먼저 필요한 조건을 질문하고, 딥리서치·시나리오 시뮬레이션·반대 의견까지 담긴 결정 보고서를 만듭니다.",
                  href: "/chat"
                },
                {
                  icon: Wand2,
                  title: "AI Agent",
                  description:
                    "만들고 싶은 것을 설명하면 웹사이트·앱·프로그램·이미지를 생성합니다. 격리된 미리보기에서 확인하고 승인한 버전만 저장됩니다.",
                  href: "/chat"
                },
                {
                  icon: BrainCircuit,
                  title: "Memory",
                  description:
                    "대화·조사·결정·결과가 연결되어 쌓입니다. AI가 저장 후보를 제안하고, 사용자가 승인한 정보만 확정 기억이 됩니다.",
                  href: "/memory"
                },
                {
                  icon: UsersRound,
                  title: "Team",
                  description:
                    "익명 설문으로 팀의 진짜 의견을 모으고, 지지도와 숨은 위험을 분석해 최종 결정에 반영합니다.",
                  href: "/team"
                }
              ].map(({ icon: Icon, title, description, href }) => (
                <Link
                  key={title}
                  href={href}
                  className="group rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-violet-300"
                >
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 transition group-hover:bg-violet-50 group-hover:text-violet-700">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <p className="mt-4 text-base font-extrabold text-slate-950">{title}</p>
                  <p className="mt-2 text-[13px] leading-6 text-slate-600">{description}</p>
                  <p className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-violet-700">
                    자세히 보기
                    <ArrowRight size={12} aria-hidden="true" />
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* Design Agent */}
        <section aria-labelledby="design-agent-title" className="border-b border-slate-100 bg-slate-50/60">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold tracking-wide text-slate-600">
                <Wand2 size={12} className="text-violet-600" aria-hidden="true" />
                AI Design Agent
              </p>
              <h2 id="design-agent-title" className="mt-4 text-xl font-extrabold tracking-tight text-slate-950 sm:text-2xl">
                말하면 디자인이 됩니다
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                "카페 랜딩 페이지 만들어줘"라고 말하면 AI Agent가 디자인 스킬을 골라
                결과물을 생성합니다. 격리된 미리보기에서 확인하고, 디자인 계약(DESIGN.md)
                기준의 AI 평가를 받아 개선한 뒤, 승인한 결과물만 보관함에 버전으로 저장됩니다.
              </p>
              <ul className="mt-4 space-y-1.5 text-[13px] font-medium text-slate-600">
                <li className="flex gap-2"><span className="text-violet-600">·</span>생성 → 미리보기 → AI 평가 → 개선 → 승인 → 저장의 안전한 루프</li>
                <li className="flex gap-2"><span className="text-violet-600">·</span>DreamWish 디자인 시스템을 따르는 일관된 결과물</li>
                <li className="flex gap-2"><span className="text-violet-600">·</span>생성 코드는 보안 검사를 통과해야 미리보기에 표시</li>
              </ul>
            </div>
            <ol className="grid grid-cols-2 gap-3" aria-label="Design Agent 진행 단계">
              {[
                ["생성", "브리프에 맞는 디자인 스킬로 결과물 생성"],
                ["미리보기", "sandbox iframe에서 기기별 확인"],
                ["AI 평가", "디자인 계약 기준의 자동 크리틱"],
                ["승인·저장", "승인한 버전만 보관함에 기록"]
              ].map(([title, description], index) => (
                <li key={title} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <span className="text-[10px] font-extrabold tracking-widest text-violet-600">
                    STEP {index + 1}
                  </span>
                  <p className="mt-1.5 text-sm font-extrabold text-slate-900">{title}</p>
                  <p className="mt-1 text-[11.5px] leading-4 text-slate-500">{description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 보안 */}
        <section aria-labelledby="security-title" className="border-b border-slate-100">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 id="security-title" className="text-xl font-extrabold tracking-tight text-slate-950 sm:text-2xl">
              신뢰를 전제로 설계했습니다
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {[
                {
                  icon: ShieldCheck,
                  title: "사용자 승인 중심",
                  description:
                    "외부 실행·저장·적용은 항상 사용자의 확인을 거칩니다. AI가 임의로 운영 데이터를 바꾸지 않습니다."
                },
                {
                  icon: MessageSquareText,
                  title: "격리된 미리보기",
                  description:
                    "AI가 만든 코드는 sandbox iframe에서만 실행되고, 위험 패턴은 자동 보안 검사로 차단됩니다."
                },
                {
                  icon: Landmark,
                  title: "암호화와 감사 로그",
                  description:
                    "연동 토큰은 서버에서 암호화 저장되며, MCP 등 외부 호출은 감사 로그로 기록됩니다."
                }
              ].map(({ icon: Icon, title, description }) => (
                <div key={title} className="rounded-2xl border border-slate-200 bg-white p-6">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <p className="mt-4 text-sm font-extrabold text-slate-950">{title}</p>
                  <p className="mt-2 text-[13px] leading-6 text-slate-600">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 자주 묻는 질문 */}
        <section aria-labelledby="questions-title" className="border-b border-slate-100 bg-slate-50/60">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
            <h2 id="questions-title" className="text-center text-xl font-extrabold tracking-tight text-slate-950 sm:text-2xl">
              자주 묻는 질문
            </h2>
            <div className="mt-7 space-y-2">
              {[
                ["어떤 AI 모델을 사용하나요?", "관리자가 연결한 AI 공급자의 모델만 사용합니다. 설정에서 연결 상태를 확인할 수 있고, 연결되지 않은 모델은 표시되지 않습니다."],
                ["AI가 만든 결과물은 안전한가요?", "모든 생성 코드는 격리된 sandbox 미리보기에서만 실행되며, 부모 창 접근·쿠키 접근·추적 스크립트 같은 위험 패턴은 자동 검사로 차단됩니다."],
                ["내 데이터는 어떻게 관리되나요?", "데이터는 계정 단위로 격리 저장되며, Memory에 저장되는 정보는 사용자가 승인한 항목만 확정됩니다. 자세한 내용은 개인정보처리방침을 확인하세요."],
                ["요금제는 어떻게 되나요?", "Pricing 페이지에서 플랜별 기능과 결제 방식을 확인할 수 있습니다. 구독 관리와 환불 정책도 함께 안내합니다."]
              ].map(([question, answer]) => (
                <details key={question} className="group rounded-2xl border border-slate-200 bg-white">
                  <summary className="cursor-pointer list-none rounded-2xl px-5 py-4 text-sm font-bold text-slate-800 transition hover:text-violet-700">
                    {question}
                  </summary>
                  <p className="border-t border-slate-100 px-5 py-4 text-[13px] leading-6 text-slate-600">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* 게스트 체험 */}
        <section aria-labelledby="guest-chat-title">
          <div className="mx-auto flex w-full max-w-3xl flex-col px-4 py-16 sm:px-6">
            <div className="text-center">
              <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-violet-600">
                <Bot size={22} aria-hidden="true" />
              </span>
              <h2 id="guest-chat-title" className="mt-5 text-[clamp(1.5rem,5vw,2rem)] font-extrabold tracking-[-0.03em] text-slate-950">
                무엇을 도와드릴까요?
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">
                로그인하면 내 일정, 문서, 고객, 프로젝트와 기억을 연결한 AI를 바로 사용할 수 있습니다.
              </p>
            </div>

            <div className="mt-7 flex flex-wrap justify-center gap-2">
              {EXAMPLE_PROMPTS.map(({ label, icon: Icon }) => (
                <button
                  key={label}
                  type="button"
                  onClick={onLoginRequest}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-[12.5px] font-semibold text-slate-600 transition hover:border-violet-300 hover:text-violet-700"
                >
                  <Icon size={14} className="text-violet-600" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-7">
              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_16px_50px_rgba(15,23,42,0.08)]">
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
          </div>
        </section>

        {/* CTA */}
        <section aria-label="시작하기" className="bg-slate-950">
          <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6">
            <h2 className="text-xl font-extrabold tracking-tight text-white sm:text-2xl">
              지금의 질문을, 더 나은 결정으로 바꾸세요.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-400">
              AI가 조사하고, 비교하고, 팀의 의견을 반영하여 실행 가능한 결론까지 도와드립니다.
            </p>
            <button
              type="button"
              onClick={onLoginRequest}
              className="mt-6 inline-flex h-12 items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-8 text-sm font-bold text-white transition hover:bg-violet-500"
            >
              무료로 시작하기
              <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
        </section>
      </main>

      {!restoringSession ? <GuestAdSlot /> : null}

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-white">
                <BrainLogo className="h-5 w-5" />
              </span>
              <span className="text-sm font-extrabold text-slate-950">DreamWish</span>
            </div>
            <p className="mt-3 max-w-xs text-xs leading-5 text-slate-500">
              Better Decisions Powered by AI. 질문에서 결정, 실행까지 하나의 흐름으로.
            </p>
          </div>
          <nav aria-label="Product">
            <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Product</p>
            <ul className="mt-3 space-y-2 text-sm font-semibold text-slate-600">
              <li><Link className="transition hover:text-slate-950" href="/chat">AI Chat</Link></li>
              <li><Link className="transition hover:text-slate-950" href="/memory">Memory</Link></li>
              <li><Link className="transition hover:text-slate-950" href="/team">Team</Link></li>
              <li><Link className="transition hover:text-slate-950" href="/pricing">Pricing</Link></li>
            </ul>
          </nav>
          <nav aria-label="Company">
            <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Company</p>
            <ul className="mt-3 space-y-2 text-sm font-semibold text-slate-600">
              <li><Link className="transition hover:text-slate-950" href="/login">Login</Link></li>
              <li><Link className="transition hover:text-slate-950" href="/signup">Get Started</Link></li>
            </ul>
          </nav>
          <nav aria-label="Legal">
            <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Legal</p>
            <ul className="mt-3 space-y-2 text-sm font-semibold text-slate-600">
              <li><Link className="transition hover:text-slate-950" href="/privacy">개인정보처리방침</Link></li>
              <li><Link className="transition hover:text-slate-950" href="/cookies">쿠키 정책</Link></li>
              <li><Link className="transition hover:text-slate-950" href="/terms">이용약관</Link></li>
              <li><Link className="transition hover:text-slate-950" href="/refunds">환불 정책</Link></li>
              <li>
                <button type="button" onClick={openCookieSettings} className="font-semibold transition hover:text-slate-950">
                  쿠키 설정
                </button>
              </li>
            </ul>
          </nav>
        </div>
        <div className="border-t border-slate-100">
          <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-slate-400 sm:px-6">
            © {new Date().getFullYear()} DreamWish. All rights reserved.
          </p>
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
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-violet-600"
    >
      {children}
    </button>
  );
}
