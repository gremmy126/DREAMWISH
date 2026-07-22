"use client";

import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Loader2,
  Pause,
  Play,
  ShieldCheck,
  Square,
  Telescope,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readApiResponse } from "@/src/lib/api/api-response";
import type { ChatSessionRecord } from "@/src/lib/chat/chat.types";

type ResearchSource = {
  id: string;
  url: string;
  title: string;
  domain: string;
  sourceType: "web" | "internal";
  fetched: boolean;
  official: boolean;
  credibilityScore: number;
  accessedAt: string;
};

type ResearchJobView = {
  id: string;
  query: string;
  mode: string;
  status: string;
  progress: number;
  currentStep: string;
  progressEvents: Array<{ at: string; step: string; message: string }>;
  report: string | null;
  sources: ResearchSource[];
  error: string | null;
  usage: { searches: number; pagesFetched: number; aiCalls: number };
  resumable: boolean;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  settings: { maxDurationMs: number };
};

const ACTIVE_STATUSES = new Set([
  "queued",
  "planning",
  "searching",
  "reading",
  "analyzing",
  "verifying",
  "writing"
]);

const STATUS_LABELS: Record<string, string> = {
  queued: "대기 중",
  planning: "계획 수립",
  searching: "웹 검색",
  reading: "출처 열람",
  analyzing: "분석",
  verifying: "검증",
  writing: "보고서 작성",
  completed: "완료",
  failed: "실패",
  cancelled: "중단됨",
  paused: "일시정지"
};

const MODE_OPTIONS = [
  { id: "standard", label: "일반 검색", hint: "약 3분 · 출처 10개" },
  { id: "deep", label: "심층 검색", hint: "약 10분 · 출처 20개" },
  { id: "deepest", label: "매우 깊은 검색", hint: "약 30분 · 출처 30개" },
  { id: "custom", label: "사용자 지정", hint: "직접 설정" }
] as const;

const TIME_OPTIONS = [1, 3, 5, 10, 20, 30, 60, 120] as const;

export function DeepResearchDock({
  currentQuery,
  sessionId,
  onSession
}: {
  currentQuery: string;
  sessionId?: string;
  onSession: (session: ChatSessionRecord) => void;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [jobs, setJobs] = useState<ResearchJobView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [memoryMutatingId, setMemoryMutatingId] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<(typeof MODE_OPTIONS)[number]["id"]>("standard");
  const [minutes, setMinutes] = useState<number>(3);
  const [customMinutes, setCustomMinutes] = useState("");
  const [maxQueries, setMaxQueries] = useState("10");
  const [maxPages, setMaxPages] = useState("15");
  const [minSources, setMinSources] = useState("4");
  const [includeCrm, setIncludeCrm] = useState(false);
  const [includeErp, setIncludeErp] = useState(false);
  const [includeLocalDocs, setIncludeLocalDocs] = useState(false);
  const [preferOfficial, setPreferOfficial] = useState(true);
  const [preferRecent, setPreferRecent] = useState(true);
  const [reportLength, setReportLength] = useState<"short" | "medium" | "long">("medium");

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadJobs = useCallback(async () => {
    if (!sessionId) {
      setJobs([]);
      return;
    }
    try {
      const response = await fetch(
        `/api/ai/deep-research?sessionId=${encodeURIComponent(sessionId)}`,
        { cache: "no-store" }
      );
      const data = await readApiResponse<{ jobs: ResearchJobView[] }>(response);
      setJobs(data.jobs || []);
    } catch {
      // Job list is a background convenience; keep the chat usable on failure.
    }
  }, [sessionId]);

  useEffect(() => {
    setJobs([]);
    void loadJobs();
  }, [loadJobs]);

  const hasActive = useMemo(() => jobs.some((job) => ACTIVE_STATUSES.has(job.status)), [jobs]);

  useEffect(() => {
    if (!hasActive) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }
    pollRef.current = setInterval(() => void loadJobs(), 2_500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [hasActive, loadJobs]);

  useEffect(() => {
    if (panelOpen && !query.trim() && currentQuery.trim()) setQuery(currentQuery);
    // Prefill only when the panel opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelOpen]);

  async function startResearch() {
    const trimmed = query.trim();
    if (!trimmed || starting) return;
    setStarting(true);
    setError(null);
    try {
      const effectiveMinutes =
        mode === "custom" && /^\d+$/u.test(customMinutes) ? parseInt(customMinutes, 10) : minutes;
      const response = await fetch("/api/ai/deep-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: trimmed,
          chatSessionId: sessionId,
          settings: {
            mode,
            maxDurationMs: effectiveMinutes * 60_000,
            maxSearchQueries: parseIntOr(maxQueries, 10),
            maxPages: parseIntOr(maxPages, 15),
            minSources: parseIntOr(minSources, 4),
            includeCrm,
            includeErp,
            includeLocalDocs,
            preferOfficial,
            preferRecent,
            reportLength,
            resultLanguage: "ko"
          }
        })
      });
      const data = await readApiResponse<{
        job: ResearchJobView;
        session: ChatSessionRecord;
      }>(response);
      setPanelOpen(false);
      setQuery("");
      setJobs((current) => [data.job, ...current.filter((job) => job.id !== data.job.id)]);
      onSession(data.session);
      window.dispatchEvent(
        new CustomEvent("dreamwish:research-started", { detail: { jobId: data.job.id } })
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "심층 조사를 시작하지 못했습니다.");
    } finally {
      setStarting(false);
    }
  }

  async function jobAction(jobId: string, action: "cancel" | "pause" | "resume") {
    setError(null);
    try {
      const response = await fetch(`/api/ai/deep-research/${jobId}/${action}`, { method: "POST" });
      await readApiResponse(response);
      await loadJobs();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "요청이 실패했습니다.");
    }
  }

  async function approveJobMemory(jobId: string) {
    if (memoryMutatingId) return;
    setMemoryMutatingId(jobId);
    setError(null);
    try {
      const response = await fetch(`/api/ai/deep-research/${jobId}/approve-memory`, {
        method: "POST"
      });
      const data = await readApiResponse<{ job: ResearchJobView }>(response);
      setJobs((current) =>
        current.map((job) => (job.id === data.job.id ? data.job : job))
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "메모리에 저장하지 못했습니다.");
    } finally {
      setMemoryMutatingId(null);
    }
  }

  return (
    <div className="space-y-2">
      {jobs.slice(0, 3).map((job) => (
        <ResearchJobCard
          key={job.id}
          job={job}
          memoryBusy={memoryMutatingId === job.id}
          onAction={jobAction}
          onApproveMemory={approveJobMemory}
        />
      ))}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPanelOpen((open) => !open)}
          className={`inline-flex items-center gap-1.5 rounded-2xl px-3 py-2 text-xs font-semibold transition ${
            panelOpen
              ? "bg-app-primary text-white"
              : "border border-app-border bg-app-card text-app-muted hover:bg-app-hover hover:text-app-primary"
          }`}
          aria-expanded={panelOpen}
        >
          <Telescope size={13} />
          Deep Research
        </button>
        {hasActive ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-app-primary">
            <Loader2 size={11} className="animate-spin" />
            조사가 백그라운드에서 진행 중입니다. 페이지를 닫아도 계속됩니다.
          </span>
        ) : null}
      </div>

      {panelOpen ? (
        <div className="rounded-app border border-app-border bg-app-card p-4 shadow-app">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-app-text">심층 조사 설정</p>
            <button
              type="button"
              onClick={() => setPanelOpen(false)}
              aria-label="닫기"
              className="rounded-xl border border-app-border p-1.5 text-app-muted"
            >
              <X size={13} />
            </button>
          </div>

          <textarea
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            rows={2}
            className="mt-3 w-full resize-none rounded-2xl border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text outline-none focus:border-app-primary"
            placeholder="깊이 조사할 질문을 입력하세요"
          />

          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            {MODE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setMode(option.id)}
                className={`rounded-2xl border px-3 py-2 text-left transition ${
                  mode === option.id
                    ? "border-app-primary bg-app-hover"
                    : "border-app-border bg-app-card hover:border-app-primary/50"
                }`}
              >
                <p className="text-xs font-semibold text-app-text">{option.label}</p>
                <p className="mt-0.5 text-[10px] text-app-muted">{option.hint}</p>
              </button>
            ))}
          </div>

          <div className="mt-3">
            <p className="text-[11px] font-semibold text-app-muted">
              최대 검색 시간 (근거가 충분하면 더 일찍 끝납니다)
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {TIME_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setMinutes(option);
                    setCustomMinutes("");
                  }}
                  className={`rounded-xl px-2.5 py-1.5 text-xs font-semibold transition ${
                    minutes === option && !customMinutes
                      ? "bg-app-primary text-white"
                      : "border border-app-border bg-app-card text-app-muted"
                  }`}
                >
                  {option}분
                </button>
              ))}
              <input
                value={customMinutes}
                onChange={(event) => setCustomMinutes(event.target.value)}
                inputMode="numeric"
                placeholder="직접 입력(분)"
                className="w-24 rounded-xl border border-app-border bg-app-card px-2.5 py-1.5 text-xs text-app-text outline-none focus:border-app-primary"
              />
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <NumberField label="최대 검색 횟수" value={maxQueries} onChange={setMaxQueries} />
            <NumberField label="최대 방문 페이지" value={maxPages} onChange={setMaxPages} />
            <NumberField label="출처 최소 개수" value={minSources} onChange={setMinSources} />
          </div>

          <div className="mt-3 flex flex-wrap gap-3">
            <Toggle label="내부 CRM 데이터 포함" checked={includeCrm} onChange={setIncludeCrm} />
            <Toggle label="내부 ERP 데이터 포함" checked={includeErp} onChange={setIncludeErp} />
            <Toggle label="로컬 문서 포함" checked={includeLocalDocs} onChange={setIncludeLocalDocs} />
            <Toggle label="공식 자료 우선" checked={preferOfficial} onChange={setPreferOfficial} />
            <Toggle label="최신 자료 우선" checked={preferRecent} onChange={setPreferRecent} />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-[11px] font-semibold text-app-muted">
              보고서 길이
              <select
                value={reportLength}
                onChange={(event) => setReportLength(event.target.value as typeof reportLength)}
                className="rounded-xl border border-app-border bg-app-card px-2 py-1.5 text-xs text-app-text outline-none"
              >
                <option value="short">짧게</option>
                <option value="medium">보통</option>
                <option value="long">길게</option>
              </select>
            </label>
            <button
              type="button"
              disabled={!query.trim() || starting}
              onClick={() => void startResearch()}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-app-primary px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
            >
              {starting ? <Loader2 size={13} className="animate-spin" /> : <Telescope size={13} />}
              심층 조사 시작
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ResearchJobCard({
  job,
  memoryBusy,
  onAction,
  onApproveMemory
}: {
  job: ResearchJobView;
  memoryBusy: boolean;
  onAction: (jobId: string, action: "cancel" | "pause" | "resume") => Promise<void>;
  onApproveMemory: (jobId: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const active = ACTIVE_STATUSES.has(job.status);
  const memoryApproved = job.progressEvents.some(
    (event) => event.step === "memory-approved"
  );
  const statusLabel = STATUS_LABELS[job.status] || job.status;
  const budgetMinutes = Math.round(job.settings.maxDurationMs / 60_000);

  function exportMarkdown() {
    if (!job.report) return;
    const blob = new Blob([job.report], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `deep-research-${job.id.slice(0, 8)}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-app border border-app-border bg-app-card p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Telescope size={14} className="shrink-0 text-app-primary" />
          <p className="truncate text-xs font-semibold text-app-text" title={job.query}>
            {job.query}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              job.status === "completed"
                ? "bg-emerald-100 text-emerald-700"
                : job.status === "failed" || job.status === "cancelled"
                  ? "bg-red-100 text-red-700"
                  : job.status === "paused"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-app-hover text-app-primary"
            }`}
          >
            {statusLabel}
          </span>
          {job.status === "completed" && job.report ? (
            <button
              type="button"
              disabled={memoryBusy || memoryApproved}
              onClick={() => void onApproveMemory(job.id)}
              className="inline-flex items-center gap-1 rounded-lg border border-app-border bg-app-card px-2 py-1.5 text-[10px] font-semibold text-app-primary transition hover:bg-app-hover disabled:cursor-default disabled:text-emerald-700 disabled:opacity-100"
              aria-label={memoryApproved ? "메모리 승인 완료" : "메모리 승인"}
              title={memoryApproved ? "메모리 승인 완료" : "메모리 승인"}
            >
              {memoryBusy ? (
                <Loader2 size={11} className="animate-spin" />
              ) : memoryApproved ? (
                <CheckCircle2 size={11} />
              ) : (
                <ShieldCheck size={11} />
              )}
              {memoryApproved ? "승인 완료" : "메모리 승인"}
            </button>
          ) : null}
          {active ? (
            <>
              <IconAction label="일시정지" onClick={() => void onAction(job.id, "pause")}>
                <Pause size={12} />
              </IconAction>
              <IconAction label="중단" onClick={() => void onAction(job.id, "cancel")}>
                <Square size={12} />
              </IconAction>
            </>
          ) : null}
          {job.status === "paused" ? (
            <>
              <IconAction label="계속" onClick={() => void onAction(job.id, "resume")}>
                <Play size={12} />
              </IconAction>
              <IconAction label="중단" onClick={() => void onAction(job.id, "cancel")}>
                <Square size={12} />
              </IconAction>
            </>
          ) : null}
          {job.status === "failed" ? (
            <IconAction label="다시 시도 (체크포인트에서 이어서)" onClick={() => void onAction(job.id, "resume")}>
              <Play size={12} />
            </IconAction>
          ) : null}
          {job.report ? (
            <IconAction label="Markdown 내보내기" onClick={exportMarkdown}>
              <Download size={12} />
            </IconAction>
          ) : null}
          <IconAction
            label={expanded ? "접기" : "자세히"}
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </IconAction>
        </div>
      </div>

      {active || job.status === "paused" ? (
        <div className="mt-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-app-primary transition-all"
              style={{ width: `${Math.max(2, job.progress)}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-app-muted" aria-live="polite">
            {job.currentStep} · 검색 {job.usage.searches}회 · 페이지 {job.usage.pagesFetched}개 ·
            예산 {budgetMinutes}분
          </p>
        </div>
      ) : null}

      {job.error ? (
        <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-[11px] text-red-700">{job.error}</p>
      ) : null}

      {expanded ? (
        <div className="mt-3 space-y-3 border-t border-app-border pt-3">
          {job.progressEvents.length > 0 ? (
            <div>
              <p className="text-[11px] font-semibold text-app-muted">진행 기록</p>
              <ul className="mt-1 space-y-0.5">
                {job.progressEvents.slice(-6).map((event, index) => (
                  <li key={index} className="text-[11px] text-app-muted">
                    {new Date(event.at).toLocaleTimeString("ko-KR")} · {event.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {job.report ? (
            <div>
              <p className="text-[11px] font-semibold text-app-muted">보고서</p>
              <pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap rounded-2xl bg-app-bg p-3 text-xs leading-5 text-app-text">
                {job.report}
              </pre>
            </div>
          ) : null}

          {job.sources.length > 0 ? (
            <div>
              <button
                type="button"
                onClick={() => setShowSources((open) => !open)}
                className="text-[11px] font-semibold text-app-primary"
              >
                출처 {job.sources.length}개 {showSources ? "접기" : "보기"}
              </button>
              {showSources ? (
                <ul className="mt-1.5 space-y-1">
                  {job.sources.map((source) => (
                    <li key={source.id} className="flex items-center gap-1.5 text-[11px]">
                      {source.sourceType === "web" ? (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-w-0 items-center gap-1 text-app-primary hover:underline"
                        >
                          <ExternalLink size={10} className="shrink-0" />
                          <span className="truncate">{source.title || source.url}</span>
                        </a>
                      ) : (
                        <span className="truncate text-app-text">{source.title}</span>
                      )}
                      <span className="shrink-0 text-app-muted">
                        {source.domain}
                        {source.official ? " · 공식" : ""}
                        {source.fetched ? "" : " · 미열람"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function IconAction({
  label,
  onClick,
  children
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-lg border border-app-border bg-app-card p-1.5 text-app-muted transition hover:text-app-primary"
    >
      {children}
    </button>
  );
}

function NumberField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-semibold text-app-muted">
      {label}
      <input
        value={value}
        inputMode="numeric"
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border border-app-border bg-app-card px-2.5 py-1.5 text-xs text-app-text outline-none focus:border-app-primary"
      />
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold text-app-muted">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-3.5 w-3.5 accent-[var(--app-primary,#7c3aed)]"
      />
      {label}
    </label>
  );
}

function parseIntOr(value: string, fallback: number) {
  return /^\d+$/u.test(value.trim()) ? parseInt(value, 10) : fallback;
}
