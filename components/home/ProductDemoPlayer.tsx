"use client";

import { CheckCircle2, Pause, Play, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

// 랜딩용 제품 데모 "동영상": 결정 분석과 AI Agent의 실제 화면 흐름을
// 장면 단위로 자동 재생하는 스크립트형 플레이어. 영상 파일 대신 코드로
// 렌더링해 용량 없이 선명하고, prefers-reduced-motion(전역 규칙)에서는
// 전환 없이 최종 프레임이 즉시 표시된다.

type DemoScene = {
  id: string;
  chapter: "decision" | "agent";
  caption: string;
  durationMs: number;
};

const SCENES: DemoScene[] = [
  { id: "ask", chapter: "decision", caption: "질문을 입력하면 AI가 목표·예산·기간·위험 허용도를 먼저 확인합니다.", durationMs: 3400 },
  { id: "research", chapter: "decision", caption: "딥리서치가 시장·경쟁·내부 데이터에서 근거를 수집합니다.", durationMs: 3200 },
  { id: "simulate", chapter: "decision", caption: "낙관·기준·비관 시나리오를 나란히 시뮬레이션해 비교합니다.", durationMs: 3200 },
  { id: "decide", chapter: "decision", caption: "추천안과 반대 의견, 리스크가 하나의 결정 보고서로 정리됩니다.", durationMs: 3600 },
  { id: "brief", chapter: "agent", caption: "만들고 싶은 것을 말하면 AI Agent가 알맞은 디자인 스킬을 선택합니다.", durationMs: 3200 },
  { id: "generate", chapter: "agent", caption: "격리된 미리보기에서 결과물이 실시간으로 만들어집니다.", durationMs: 3400 },
  { id: "critique", chapter: "agent", caption: "AI가 디자인 계약(DESIGN.md) 기준으로 평가하고 개선점을 제안합니다.", durationMs: 3200 },
  { id: "approve", chapter: "agent", caption: "승인한 결과물만 보관함에 버전으로 저장됩니다.", durationMs: 3400 }
];

const CHAPTERS: Array<{ id: DemoScene["chapter"]; label: string; firstScene: number }> = [
  { id: "decision", label: "결정 분석", firstScene: 0 },
  { id: "agent", label: "AI Agent", firstScene: 4 }
];

export function ProductDemoPlayer() {
  const [scene, setScene] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(
      () => setScene((current) => (current + 1) % SCENES.length),
      SCENES[scene].durationMs
    );
    return () => window.clearTimeout(timer);
  }, [scene, playing]);

  const current = SCENES[scene];

  return (
    <section
      aria-roledescription="제품 데모"
      aria-label="DreamWish 제품 데모: 결정 분석과 AI Agent"
      className="w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.10)]"
    >
      {/* 브라우저 크롬 */}
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <span aria-hidden className="flex gap-1.5">
          <i className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <i className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <i className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        </span>
        <span className="mx-auto flex h-6 items-center rounded-md bg-white px-3 text-[10px] font-semibold text-slate-400">
          dreamwish.co.kr
        </span>
        <span className="w-10" aria-hidden />
      </div>

      {/* 장면 */}
      <div className="relative h-[300px] bg-slate-50/60 sm:h-[320px]">
        <div key={current.id} className="dw-anim-fade-up absolute inset-0 p-4 sm:p-5">
          {current.id === "ask" ? <SceneAsk /> : null}
          {current.id === "research" ? <SceneResearch /> : null}
          {current.id === "simulate" ? <SceneSimulate /> : null}
          {current.id === "decide" ? <SceneDecide /> : null}
          {current.id === "brief" ? <SceneBrief /> : null}
          {current.id === "generate" ? <SceneGenerate /> : null}
          {current.id === "critique" ? <SceneCritique /> : null}
          {current.id === "approve" ? <SceneApprove /> : null}
        </div>
      </div>

      {/* 컨트롤 바 */}
      <div className="border-t border-slate-200 px-4 py-3">
        <div className="flex gap-1" aria-hidden>
          {SCENES.map((item, index) => (
            <span key={item.id} className="h-1 flex-1 overflow-hidden rounded-full bg-slate-200">
              {index < scene ? (
                <span className="block h-full w-full bg-violet-600" />
              ) : index === scene ? (
                <span
                  key={`${scene}-progress`}
                  className="block h-full w-full bg-violet-600"
                  style={{
                    animation: `dw-grow-x ${item.durationMs}ms linear both`,
                    animationPlayState: playing ? "running" : "paused",
                    transformOrigin: "left center"
                  }}
                />
              ) : null}
            </span>
          ))}
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPlaying((value) => !value)}
            aria-label={playing ? "데모 일시정지" : "데모 재생"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white transition hover:bg-violet-700"
          >
            {playing ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
          </button>
          <button
            type="button"
            onClick={() => {
              setScene(0);
              setPlaying(true);
            }}
            aria-label="데모 처음부터"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:text-violet-700"
          >
            <RotateCcw size={13} />
          </button>
          <div className="flex shrink-0 rounded-xl border border-slate-200 p-0.5">
            {CHAPTERS.map((chapter) => (
              <button
                key={chapter.id}
                type="button"
                onClick={() => {
                  setScene(chapter.firstScene);
                  setPlaying(true);
                }}
                aria-pressed={current.chapter === chapter.id}
                className={`h-8 rounded-[10px] px-3 text-[11px] font-bold transition ${
                  current.chapter === chapter.id
                    ? "bg-violet-600 text-white"
                    : "text-slate-500 hover:text-violet-700"
                }`}
              >
                {chapter.label}
              </button>
            ))}
          </div>
          <p aria-live="polite" className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-500">
            {current.caption}
          </p>
        </div>
      </div>
    </section>
  );
}

// --- 장면들 (모두 장식용 목업 — 스크린리더에는 캡션이 내용을 전달한다) ---

function Bubble({
  role,
  children,
  delay = 0
}: {
  role: "user" | "ai";
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <div
      className={`dw-anim-fade-up flex ${role === "user" ? "justify-end" : "justify-start"}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <p
        className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-[12px] font-semibold leading-5 ${
          role === "user"
            ? "rounded-br-md bg-violet-600 text-white"
            : "rounded-tl-md border border-slate-200 bg-white text-slate-700 shadow-sm"
        }`}
      >
        {children}
      </p>
    </div>
  );
}

function PanelTitle({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <p
      className="dw-anim-fade-up text-[11px] font-extrabold tracking-wide text-slate-400"
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </p>
  );
}

function SceneAsk() {
  return (
    <div aria-hidden className="mx-auto flex h-full max-w-md flex-col justify-center gap-3">
      <Bubble role="user">신규 시장 진출과 기존 제품 강화, 어느 쪽이 좋을까요?</Bubble>
      <Bubble role="ai" delay={700}>
        좋은 질문이에요. 정확한 비교를 위해 몇 가지를 먼저 확인할게요.
      </Bubble>
      <div className="dw-anim-fade-up flex flex-wrap gap-1.5 pl-1" style={{ animationDelay: "1400ms" }}>
        {["목표", "예산", "기간", "위험 허용도"].map((chip) => (
          <span
            key={chip}
            className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[10.5px] font-bold text-violet-700"
          >
            {chip}
          </span>
        ))}
      </div>
    </div>
  );
}

function SceneResearch() {
  const rows = [
    { label: "시장 규모·성장률 리포트", width: "92%" },
    { label: "경쟁사 제품·가격 동향", width: "78%" },
    { label: "내부 매출·고객 데이터", width: "85%" }
  ];
  return (
    <div aria-hidden className="mx-auto flex h-full max-w-md flex-col justify-center gap-3">
      <PanelTitle>딥리서치 — 근거 수집</PanelTitle>
      {rows.map((row, index) => (
        <div
          key={row.label}
          className="dw-anim-fade-up rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
          style={{ animationDelay: `${300 + index * 500}ms` }}
        >
          <div className="flex items-center justify-between">
            <p className="text-[11.5px] font-bold text-slate-700">{row.label}</p>
            <CheckCircle2 size={13} className="text-emerald-600" />
          </div>
          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-100">
            <span
              className="dw-anim-grow-x block h-full rounded-full bg-violet-500"
              style={{ width: row.width, animationDelay: `${500 + index * 500}ms` }}
            />
          </span>
        </div>
      ))}
    </div>
  );
}

function SceneSimulate() {
  const bars = [
    { label: "낙관", height: "82%", tone: "bg-emerald-500" },
    { label: "기준", height: "58%", tone: "bg-violet-500" },
    { label: "비관", height: "30%", tone: "bg-amber-500" }
  ];
  return (
    <div aria-hidden className="mx-auto flex h-full max-w-md flex-col justify-center gap-3">
      <PanelTitle>시뮬레이션 — 시나리오 비교</PanelTitle>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex h-32 items-end justify-center gap-8">
          {bars.map((bar, index) => (
            <div key={bar.label} className="flex h-full w-14 flex-col items-center justify-end gap-1.5">
              <span className="flex h-full w-full items-end overflow-hidden rounded-t-lg bg-slate-100">
                <span
                  className={`dw-anim-grow-y block w-full rounded-t-lg ${bar.tone}`}
                  style={{ height: bar.height, animationDelay: `${300 + index * 350}ms` }}
                />
              </span>
              <span className="text-[10.5px] font-bold text-slate-500">{bar.label}</span>
            </div>
          ))}
        </div>
        <p className="dw-anim-fade-up mt-3 border-t border-slate-100 pt-2 text-[11px] font-semibold text-slate-500" style={{ animationDelay: "1500ms" }}>
          기준 시나리오에서도 손익분기 도달 — 최대 리스크는 초기 운영 비용
        </p>
      </div>
    </div>
  );
}

function SceneDecide() {
  return (
    <div aria-hidden className="mx-auto flex h-full max-w-md flex-col justify-center">
      <div className="dw-anim-fade-up rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-extrabold text-slate-900">결정 보고서</p>
          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">
            추천: 단계적 진출
          </span>
        </div>
        <ul className="mt-3 space-y-1.5 text-[11px] font-semibold leading-4 text-slate-600">
          {[
            "근거 — 리서치와 기준 시나리오가 진출을 지지",
            "반대 의견 — 팀 일부는 기존 제품 집중을 선호",
            "리스크 — 초기 운영 비용, 채용 일정"
          ].map((line, index) => (
            <li key={line} className="dw-anim-fade-up flex gap-1.5" style={{ animationDelay: `${400 + index * 350}ms` }}>
              <span className="text-violet-500">·</span>
              {line}
            </li>
          ))}
        </ul>
        <div className="dw-anim-fade-up mt-3 flex items-center justify-between border-t border-slate-100 pt-3" style={{ animationDelay: "1700ms" }}>
          <span className="flex items-center gap-1 text-[10.5px] font-bold text-slate-400">
            <Sparkles size={11} className="text-violet-500" />
            결정과 결과가 Memory에 학습됩니다
          </span>
          <span className="rounded-lg bg-slate-900 px-3 py-1.5 text-[10.5px] font-bold text-white">
            승인
          </span>
        </div>
      </div>
    </div>
  );
}

function SceneBrief() {
  return (
    <div aria-hidden className="mx-auto flex h-full max-w-md flex-col justify-center gap-3">
      <Bubble role="user">카페 브랜드 랜딩 페이지 만들어줘</Bubble>
      <Bubble role="ai" delay={700}>
        Landing Page Designer 스킬로 생성할게요. 브랜드 톤은 따뜻한 베이지로 제안합니다.
      </Bubble>
      <div className="dw-anim-fade-up flex gap-1.5 pl-1" style={{ animationDelay: "1500ms" }}>
        <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[10.5px] font-bold text-violet-700">
          Landing Page Designer
        </span>
        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10.5px] font-bold text-slate-500">
          sandbox 미리보기
        </span>
      </div>
    </div>
  );
}

function MiniSite({ dimmed = false }: { dimmed?: boolean }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${dimmed ? "opacity-50" : ""}`}>
      <div className="dw-anim-fade-up flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <span className="h-2 w-12 rounded bg-amber-800/70" />
        <span className="flex gap-1.5">
          <i className="h-2 w-8 rounded bg-slate-200" />
          <i className="h-2 w-8 rounded bg-slate-200" />
          <i className="h-2 w-10 rounded bg-amber-700/80" />
        </span>
      </div>
      <div className="px-3 py-3">
        <span className="dw-anim-fade-up block h-3 w-3/4 rounded bg-slate-800/80" style={{ animationDelay: "400ms" }} />
        <span className="dw-anim-fade-up mt-1.5 block h-2 w-1/2 rounded bg-slate-300" style={{ animationDelay: "600ms" }} />
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[0, 1, 2].map((card) => (
            <span
              key={card}
              className="dw-anim-fade-up block h-12 rounded-lg border border-slate-100 bg-amber-50"
              style={{ animationDelay: `${800 + card * 250}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SceneGenerate() {
  return (
    <div aria-hidden className="mx-auto flex h-full max-w-md flex-col justify-center gap-2">
      <PanelTitle>AI Agent — 생성 미리보기</PanelTitle>
      <MiniSite />
    </div>
  );
}

function SceneCritique() {
  return (
    <div aria-hidden className="mx-auto flex h-full max-w-md flex-col justify-center gap-2">
      <PanelTitle>AI 디자인 평가</PanelTitle>
      <div className="relative">
        <MiniSite dimmed />
        <div className="dw-anim-fade-up absolute inset-x-4 bottom-2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg" style={{ animationDelay: "500ms" }}>
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-extrabold text-slate-900">디자인 평가 — 82점</p>
            <span className="rounded-lg bg-violet-600 px-2 py-1 text-[10px] font-bold text-white">지적사항 반영</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">대비 개선</span>
            <span className="rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-bold text-sky-700">여백 리듬</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SceneApprove() {
  return (
    <div aria-hidden className="mx-auto flex h-full max-w-md flex-col justify-center gap-2">
      <PanelTitle>승인 · 저장</PanelTitle>
      <div className="relative">
        <MiniSite />
        <span className="dw-anim-fade-up absolute right-3 top-3 flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-bold text-white" style={{ animationDelay: "600ms" }}>
          <ShieldCheck size={11} />
          승인됨
        </span>
      </div>
      <p className="dw-anim-fade-up flex items-center gap-1.5 text-[11px] font-semibold text-slate-500" style={{ animationDelay: "1100ms" }}>
        <CheckCircle2 size={12} className="text-emerald-600" />
        보관함에 버전 3으로 저장되었습니다
      </p>
    </div>
  );
}
