"use client";

import {
  AppWindow,
  Bot,
  Code2,
  Download,
  Globe2,
  Image as ImageIcon,
  Loader2,
  RefreshCcw,
  Send,
  Sparkles,
  TerminalSquare
} from "lucide-react";
import { useMemo, useState } from "react";
import type { AgentBuildKind } from "@/src/lib/agent/agent-build";

type BuildRecord = {
  id: string;
  kind: AgentBuildKind;
  prompt: string;
  code: string;
  createdAt: string;
};

const KIND_OPTIONS: Array<{
  id: AgentBuildKind;
  label: string;
  description: string;
  icon: typeof Globe2;
  placeholder: string;
}> = [
  {
    id: "website",
    label: "웹사이트",
    description: "랜딩·소개·포트폴리오 페이지",
    icon: Globe2,
    placeholder: "예: 카페 브랜드를 위한 다크 테마 랜딩 페이지를 만들어줘. 메뉴·위치·예약 섹션 포함."
  },
  {
    id: "app",
    label: "앱",
    description: "할 일·계산기 등 인터랙티브 앱",
    icon: AppWindow,
    placeholder: "예: 로컬 저장이 되는 할 일 관리 앱을 만들어줘. 마감일과 우선순위 기능 포함."
  },
  {
    id: "program",
    label: "프로그램",
    description: "스크립트·자동화 코드",
    icon: TerminalSquare,
    placeholder: "예: 폴더 안의 CSV 파일을 합쳐 요약 통계를 출력하는 Node.js 스크립트를 만들어줘."
  },
  {
    id: "image",
    label: "이미지",
    description: "로고·일러스트·다이어그램(SVG)",
    icon: ImageIcon,
    placeholder: "예: 보라색 그라데이션의 별 모양 AI 로고를 만들어줘. 미니멀한 스타일로."
  }
];

const DOWNLOAD_META: Record<AgentBuildKind, { file: string; mime: string }> = {
  website: { file: "website.html", mime: "text/html;charset=utf-8" },
  app: { file: "app.html", mime: "text/html;charset=utf-8" },
  program: { file: "program.js", mime: "text/plain;charset=utf-8" },
  image: { file: "image.svg", mime: "image/svg+xml;charset=utf-8" }
};

// AI Agent 스튜디오 — 자연어 설명만으로 웹사이트/앱/프로그램/이미지를
// 생성하고, 미리보기·수정·다운로드까지 제공한다. AI Chat 안의 세 번째
// 모드로 동작한다(메인 내비게이션은 SEO를 위해 6개 메뉴로 유지).
export function AgentStudio() {
  const [kind, setKind] = useState<AgentBuildKind>("website");
  const [prompt, setPrompt] = useState("");
  const [feedback, setFeedback] = useState("");
  const [current, setCurrent] = useState<BuildRecord | null>(null);
  const [historyList, setHistoryList] = useState<BuildRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);

  const activeOption = KIND_OPTIONS.find((option) => option.id === kind) || KIND_OPTIONS[0];

  const svgDataUrl = useMemo(() => {
    if (!current || current.kind !== "image") return null;
    return `data:image/svg+xml;utf8,${encodeURIComponent(current.code)}`;
  }, [current]);

  async function build(refine: boolean) {
    const text = refine ? feedback.trim() : prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/ai/agent-build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          refine && current
            ? {
                kind: current.kind,
                prompt: current.prompt,
                previousCode: current.code,
                feedback: text
              }
            : { kind, prompt: text }
        )
      });
      const body = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        code?: string;
        kind?: AgentBuildKind;
        error?: string;
      };
      if (!response.ok || !body.ok || !body.code) {
        throw new Error(body.error || "생성에 실패했습니다.");
      }
      const record: BuildRecord = {
        id: `${Date.now()}`,
        kind: body.kind || kind,
        prompt: refine && current ? current.prompt : text,
        code: body.code,
        createdAt: new Date().toISOString()
      };
      setCurrent(record);
      setHistoryList((previous) => [record, ...previous].slice(0, 10));
      if (refine) setFeedback("");
      setShowCode(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!current) return;
    const meta = DOWNLOAD_META[current.kind];
    const blob = new Blob([current.code], { type: meta.mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = meta.file;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="space-y-4">
        <section className="rounded-app border border-app-border bg-white p-5 shadow-soft">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-app-hover text-app-primary">
              <Bot size={18} />
            </span>
            <div>
              <h2 className="text-sm font-extrabold text-app-text">AI Agent 스튜디오</h2>
              <p className="text-[11px] text-app-muted">
                만들고 싶은 것을 설명하면 AI가 바로 만들어 드립니다.
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {KIND_OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = option.id === kind;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setKind(option.id)}
                  className={`rounded-2xl border p-3 text-left transition ${
                    active
                      ? "border-app-primary bg-app-hover"
                      : "border-app-border bg-white hover:border-app-primary/40"
                  }`}
                >
                  <Icon size={16} className={active ? "text-app-primary" : "text-app-muted"} />
                  <p className="mt-1.5 text-xs font-bold text-app-text">{option.label}</p>
                  <p className="mt-0.5 text-[10px] leading-3.5 text-app-muted">
                    {option.description}
                  </p>
                </button>
              );
            })}
          </div>

          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={activeOption.placeholder}
            rows={4}
            className="mt-4 w-full resize-none rounded-2xl border border-app-border bg-white p-3 text-xs leading-5 text-app-text outline-none focus:border-app-primary"
          />
          <button
            type="button"
            disabled={busy || !prompt.trim()}
            onClick={() => void build(false)}
            className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-2xl bg-app-primary text-xs font-bold text-white shadow-soft transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {busy ? "생성 중…" : `${activeOption.label} 생성하기`}
          </button>
          {error ? (
            <p className="mt-3 rounded-2xl bg-red-50 p-3 text-[11px] leading-4 text-red-600">
              {error}
            </p>
          ) : null}
        </section>

        {current ? (
          <section className="rounded-app border border-app-border bg-white p-5 shadow-soft">
            <p className="text-xs font-bold text-app-text">수정 요청</p>
            <div className="mt-2 flex items-center gap-2 rounded-2xl border border-app-border bg-white px-3 py-2">
              <input
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing) void build(true);
                }}
                placeholder="예: 배경을 밝은 색으로 바꾸고 버튼을 더 크게…"
                className="h-8 min-w-0 flex-1 bg-transparent text-xs text-app-text outline-none placeholder:text-slate-400"
              />
              <button
                type="button"
                disabled={busy || !feedback.trim()}
                onClick={() => void build(true)}
                aria-label="수정 요청 보내기"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-app-primary text-white transition hover:opacity-90 disabled:opacity-40"
              >
                <Send size={13} />
              </button>
            </div>
          </section>
        ) : null}

        {historyList.length > 1 ? (
          <section className="rounded-app border border-app-border bg-white p-5 shadow-soft">
            <p className="text-xs font-bold text-app-text">이번 세션 생성 기록</p>
            <div className="mt-2 space-y-1.5">
              {historyList.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => setCurrent(record)}
                  className={`w-full truncate rounded-xl px-3 py-2 text-left text-[11px] font-semibold transition ${
                    current?.id === record.id
                      ? "bg-app-hover text-app-primary"
                      : "text-app-muted hover:bg-app-hover"
                  }`}
                >
                  [{KIND_OPTIONS.find((option) => option.id === record.kind)?.label}]{" "}
                  {record.prompt.slice(0, 40)}
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <section className="flex h-[calc(100dvh-220px)] min-h-[480px] flex-col rounded-app border border-app-border bg-white shadow-soft">
        <div className="flex items-center justify-between gap-3 border-b border-app-border px-5 py-3">
          <p className="text-xs font-bold text-app-text">미리보기</p>
          {current ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCode((value) => !value)}
                className="flex h-8 items-center gap-1.5 rounded-xl border border-app-border bg-white px-3 text-[11px] font-semibold text-app-muted transition hover:bg-app-hover hover:text-app-primary"
              >
                <Code2 size={12} />
                {showCode ? "미리보기 보기" : "코드 보기"}
              </button>
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(current.code)}
                className="flex h-8 items-center gap-1.5 rounded-xl border border-app-border bg-white px-3 text-[11px] font-semibold text-app-muted transition hover:bg-app-hover hover:text-app-primary"
              >
                <RefreshCcw size={12} />
                코드 복사
              </button>
              <button
                type="button"
                onClick={download}
                className="flex h-8 items-center gap-1.5 rounded-xl bg-app-primary px-3 text-[11px] font-bold text-white transition hover:opacity-90"
              >
                <Download size={12} />
                다운로드
              </button>
            </div>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-auto app-scrollbar">
          {!current ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-3xl bg-app-hover text-app-primary">
                <Bot size={26} />
              </span>
              <p className="text-sm font-bold text-app-text">아직 생성된 결과물이 없습니다</p>
              <p className="max-w-sm text-xs leading-5 text-app-muted">
                왼쪽에서 종류를 고르고 만들고 싶은 것을 설명해 보세요. 웹사이트·앱은 바로
                미리보기로 열리고, 코드는 파일로 다운로드할 수 있습니다.
              </p>
            </div>
          ) : showCode || current.kind === "program" ? (
            <pre className="h-full overflow-auto whitespace-pre-wrap break-words bg-slate-950 p-5 text-[11px] leading-5 text-slate-100">
              {current.code}
            </pre>
          ) : current.kind === "image" && svgDataUrl ? (
            <div className="flex h-full items-center justify-center bg-slate-50 p-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={svgDataUrl}
                alt={current.prompt.slice(0, 80)}
                className="max-h-full max-w-full rounded-2xl bg-white shadow-soft"
              />
            </div>
          ) : (
            <iframe
              title="AI Agent 미리보기"
              sandbox="allow-scripts"
              srcDoc={current.code}
              className="h-full w-full border-0 bg-white"
            />
          )}
        </div>
      </section>
    </div>
  );
}
