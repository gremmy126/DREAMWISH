"use client";

import {
  CheckCircle2,
  Clock3,
  ExternalLink,
  GripVertical,
  History,
  Loader2,
  PlayCircle,
  ShieldCheck,
  Telescope,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConnectedContextWorkspace } from "@/components/context/ConnectedContextWorkspace";
import { SurfaceCard } from "@/components/Common/SurfaceCard";
import { readApiResponse } from "@/src/lib/api/api-response";

type ResearchSourceView = {
  id: string;
  url: string;
  title: string;
  domain: string;
  snippet: string;
  sourceType: "web" | "internal";
  fetched: boolean;
  official: boolean;
  credibilityScore: number;
  accessedAt: string;
  publishedAt: string | null;
};

type ResearchVideoView = {
  id: string;
  url: string;
  title: string;
  channel: string | null;
  description: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  durationLabel: string | null;
  relatedQuery: string;
};

type ResearchJobView = {
  id: string;
  query: string;
  status: string;
  progress: number;
  currentStep: string;
  progressEvents: Array<{ at: string; step: string; message: string }>;
  report: string | null;
  reportSections: {
    summary: string;
    findings: string;
    conclusion: string;
    followUp: string;
  } | null;
  sources: ResearchSourceView[];
  videos: ResearchVideoView[];
  usedQueries: string[];
  citedSourceIds: string[];
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

const ACTIVE = new Set(["queued", "planning", "searching", "reading", "analyzing", "verifying", "writing"]);
const WIDTH_KEY = "dreamwish.research.panel.width";

export function ResearchWorkspace({ query, sessionId }: { query: string; sessionId?: string }) {
  const [view, setView] = useState<"context" | "research">("context");
  const [jobs, setJobs] = useState<ResearchJobView[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [width, setWidth] = useState<number>(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const loadJobs = useCallback(async () => {
    try {
      const response = await fetch("/api/ai/deep-research?limit=20", { cache: "no-store" });
      const data = await readApiResponse<{ jobs: ResearchJobView[] }>(response);
      setJobs(data.jobs || []);
    } catch {
      // Panel is a passive viewer; keep chat usable when listing fails.
    }
  }, []);

  useEffect(() => {
    void loadJobs();
    const saved = Number(window.localStorage.getItem(WIDTH_KEY));
    if (Number.isFinite(saved) && saved >= 320 && saved <= 900) setWidth(saved);
  }, [loadJobs]);

  useEffect(() => {
    const handleStarted = (event: Event) => {
      const detail = (event as CustomEvent<{ jobId?: string }>).detail;
      setView("research");
      if (window.innerWidth < 1280) setMobileOpen(true);
      if (detail?.jobId) setSelectedJobId(detail.jobId);
      void loadJobs();
    };
    window.addEventListener("dreamwish:research-started", handleStarted);
    return () => window.removeEventListener("dreamwish:research-started", handleStarted);
  }, [loadJobs]);

  const hasActive = useMemo(() => jobs.some((job) => ACTIVE.has(job.status)), [jobs]);

  useEffect(() => {
    if (!hasActive || view !== "research") return;
    const timer = setInterval(() => void loadJobs(), 3_000);
    return () => clearInterval(timer);
  }, [hasActive, view, loadJobs]);

  const selectedJob =
    jobs.find((job) => job.id === selectedJobId) || jobs[0] || null;

  async function approveMemory(jobId: string) {
    const response = await fetch(`/api/ai/deep-research/${jobId}/approve-memory`, {
      method: "POST"
    });
    const data = await readApiResponse<{ job: ResearchJobView }>(response);
    setJobs((current) =>
      current.map((job) => (job.id === data.job.id ? data.job : job))
    );
  }

  function startResize(event: React.PointerEvent) {
    const startWidth = width || containerRef.current?.getBoundingClientRect().width || 420;
    dragRef.current = { startX: event.clientX, startWidth };
    const move = (moveEvent: PointerEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startX - moveEvent.clientX;
      const next = Math.max(320, Math.min(900, dragRef.current.startWidth + delta));
      setWidth(next);
    };
    const up = () => {
      if (dragRef.current) {
        window.localStorage.setItem(WIDTH_KEY, String(Math.round(width || 420)));
      }
      dragRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const panelBody =
    view === "context" ? (
      <ConnectedContextWorkspace query={query} />
    ) : (
      <ResearchPanel
        jobs={jobs}
        selectedJob={selectedJob}
        onSelect={setSelectedJobId}
        onApproveMemory={approveMemory}
        onClose={() => {
          setView("context");
          setMobileOpen(false);
        }}
      />
    );

  return (
    <>
      <div
        ref={containerRef}
        className="hidden min-h-0 min-w-0 xl:flex xl:flex-col"
        style={width ? { width, justifySelf: "end" } : undefined}
      >
        <div className="mb-2 flex items-center gap-1">
          <button
            type="button"
            onPointerDown={startResize}
            aria-label="패널 너비 조절"
            title="드래그하여 너비 조절"
            className="cursor-col-resize rounded-lg border border-app-border bg-white p-1 text-app-muted"
          >
            <GripVertical size={12} />
          </button>
          <TabButton active={view === "context"} onClick={() => setView("context")}>
            컨텍스트
          </TabButton>
          <TabButton active={view === "research"} onClick={() => setView("research")}>
            <Telescope size={12} />
            조사 보고서
            {hasActive ? <Loader2 size={11} className="animate-spin" /> : null}
          </TabButton>
        </div>
        <div className="min-h-0 flex-1">{panelBody}</div>
      </div>

      <div className="xl:hidden">
        <button
          type="button"
          onClick={() => {
            setView("research");
            setMobileOpen(true);
            void loadJobs();
          }}
          className="inline-flex items-center gap-1.5 rounded-2xl border border-app-border bg-white px-3 py-2 text-xs font-semibold text-app-muted"
        >
          <Telescope size={13} />
          조사 보고서 열기
        </button>
        {mobileOpen ? (
          <div className="fixed inset-0 z-50 flex flex-col bg-white" role="dialog" aria-label="조사 보고서">
            <div className="flex items-center justify-between border-b border-app-border px-4 py-3">
              <p className="text-sm font-semibold text-app-text">조사 보고서</p>
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setMobileOpen(false)}
                className="rounded-xl border border-app-border p-1.5 text-app-muted"
              >
                <X size={14} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3">
              <ResearchPanel
                jobs={jobs}
                selectedJob={selectedJob}
                onSelect={setSelectedJobId}
                onApproveMemory={approveMemory}
                onClose={() => setMobileOpen(false)}
              />
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

function ResearchPanel({
  jobs,
  selectedJob,
  onSelect,
  onApproveMemory,
  onClose
}: {
  jobs: ResearchJobView[];
  selectedJob: ResearchJobView | null;
  onSelect: (id: string) => void;
  onApproveMemory: (jobId: string) => Promise<void>;
  onClose: () => void;
}) {
  const [highlightedSourceId, setHighlightedSourceId] = useState<string | null>(null);
  const [memorySaving, setMemorySaving] = useState(false);
  const [memoryError, setMemoryError] = useState<string | null>(null);

  if (jobs.length === 0) {
    return (
      <SurfaceCard className="flex min-h-[300px] flex-col items-center justify-center p-6 text-center">
        <Telescope size={26} className="text-app-primary" />
        <p className="mt-3 text-sm font-semibold text-app-text">저장된 Deep Research 기록이 없습니다.</p>
        <p className="mt-1 text-xs leading-5 text-app-muted">
          채팅 입력창 아래 Deep Research 버튼으로 조사를 시작하면 이곳에 진행 상황과 보고서가 표시됩니다.
        </p>
      </SurfaceCard>
    );
  }

  const job = selectedJob!;
  const active = ACTIVE.has(job.status);
  const memoryApproved = job.progressEvents.some(
    (event) => event.step === "memory-approved"
  );
  const durationLabel = buildDuration(job.startedAt, job.completedAt);

  async function saveToMemory() {
    if (memorySaving || memoryApproved) return;
    setMemorySaving(true);
    setMemoryError(null);
    try {
      await onApproveMemory(job.id);
    } catch (caught) {
      setMemoryError(
        caught instanceof Error ? caught.message : "메모리에 저장하지 못했습니다."
      );
    } finally {
      setMemorySaving(false);
    }
  }

  function jumpToCitation(citationNumber: number) {
    const sourceId = job.citedSourceIds[citationNumber - 1];
    if (!sourceId) return;
    setHighlightedSourceId(sourceId);
    document
      .getElementById(`research-source-${sourceId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <SurfaceCard className="flex min-h-0 flex-col overflow-hidden p-0">
      <div className="flex items-center justify-between gap-2 border-b border-app-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <History size={14} className="shrink-0 text-app-primary" />
          <select
            value={job.id}
            onChange={(event) => onSelect(event.target.value)}
            aria-label="조사 기록 선택"
            className="min-w-0 flex-1 truncate rounded-xl border border-app-border bg-white px-2 py-1.5 text-xs text-app-text outline-none"
          >
            {jobs.map((item) => (
              <option key={item.id} value={item.id}>
                {item.query.slice(0, 40)} ({statusLabel(item.status)})
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          aria-label="패널 닫기"
          onClick={onClose}
          className="shrink-0 rounded-lg border border-app-border p-1.5 text-app-muted hover:text-app-primary"
        >
          <X size={13} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4 app-scrollbar">
        <section>
          <h3 className="text-xs font-bold text-app-muted">조사 요약</h3>
          <p className="mt-1.5 break-words text-sm font-semibold leading-5 text-app-text">{job.query}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-app-muted">
            <div>상태: <span className="font-semibold text-app-text">{statusLabel(job.status)}</span></div>
            <div>소요: <span className="font-semibold text-app-text">{durationLabel}</span></div>
            {job.startedAt ? <div>시작: {formatTime(job.startedAt)}</div> : null}
            {job.completedAt ? <div>완료: {formatTime(job.completedAt)}</div> : null}
          </dl>
          {job.status === "completed" && job.report ? (
            <div className="mt-3">
              {memoryApproved ? (
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700">
                  <CheckCircle2 size={13} />
                  메모리에 저장됨
                </span>
              ) : (
                <button
                  type="button"
                  disabled={memorySaving}
                  onClick={() => void saveToMemory()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-app-primary px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50"
                >
                  {memorySaving ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <ShieldCheck size={13} />
                  )}
                  메모리에 승인 저장
                </button>
              )}
              {memoryError ? (
                <p className="mt-2 text-[11px] text-red-700">{memoryError}</p>
              ) : null}
            </div>
          ) : null}
          {job.usedQueries.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {job.usedQueries.slice(0, 8).map((usedQuery) => (
                <span key={usedQuery} className="rounded-lg bg-app-bg px-2 py-0.5 text-[10px] text-app-muted">
                  {usedQuery}
                </span>
              ))}
            </div>
          ) : null}
        </section>

        {active ? (
          <section aria-live="polite">
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-app-primary transition-all"
                style={{ width: `${Math.max(2, job.progress)}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-app-muted">{job.currentStep}</p>
            <ul className="mt-2 space-y-1">
              {job.progressEvents.slice(-6).map((event, index) => (
                <li key={index} className="flex items-center gap-1.5 text-[11px] text-app-muted">
                  <Clock3 size={10} className="shrink-0" />
                  {new Date(event.at).toLocaleTimeString("ko-KR")} · {event.message}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {job.reportSections?.summary ? (
          <ReportSection title="핵심 요약" body={job.reportSections.summary} onCite={jumpToCitation} />
        ) : null}
        {job.reportSections?.findings ? (
          <ReportSection title="주요 발견사항" body={job.reportSections.findings} onCite={jumpToCitation} />
        ) : null}
        {job.reportSections?.conclusion ? (
          <ReportSection title="결론" body={job.reportSections.conclusion} onCite={jumpToCitation} />
        ) : null}
        {job.reportSections?.followUp ? (
          <ReportSection title="추가 확인이 필요한 내용" body={job.reportSections.followUp} onCite={jumpToCitation} />
        ) : null}

        {job.sources.length > 0 ? (
          <section>
            <h3 className="text-xs font-bold text-app-muted">출처 및 관련 링크 ({job.sources.length})</h3>
            <ul className="mt-2 space-y-2">
              {job.sources.map((source) => (
                <li
                  key={source.id}
                  id={`research-source-${source.id}`}
                  className={`rounded-xl border bg-app-bg p-2.5 transition ${
                    highlightedSourceId === source.id
                      ? "border-app-primary ring-2 ring-app-primary/25"
                      : "border-app-border"
                  }`}
                >
                  {source.sourceType === "web" ? (
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs font-semibold text-app-primary hover:underline"
                    >
                      <ExternalLink size={11} className="shrink-0" />
                      <span className="min-w-0 truncate">{source.title || source.url}</span>
                    </a>
                  ) : (
                    <p className="text-xs font-semibold text-app-text">{source.title}</p>
                  )}
                  {source.snippet ? (
                    <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-app-muted">{source.snippet}</p>
                  ) : null}
                  <p className="mt-1 text-[10px] text-app-muted">
                    {source.domain}
                    {source.official ? " · 공식" : ""}
                    {source.publishedAt ? ` · 게시 ${source.publishedAt.slice(0, 10)}` : ""}
                    {` · 접근 ${source.accessedAt.slice(0, 10)}`}
                    {` · 신뢰도 ${Math.round(source.credibilityScore * 100)}`}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {job.videos.length > 0 ? (
          <section>
            <h3 className="text-xs font-bold text-app-muted">참고 영상 ({job.videos.length})</h3>
            <div className="mt-2 space-y-2">
              {job.videos.map((video) => (
                <a
                  key={video.id}
                  href={video.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex gap-2.5 rounded-xl border border-app-border bg-app-bg p-2.5 transition hover:border-app-primary/60"
                >
                  {video.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={video.thumbnailUrl}
                      alt=""
                      className="h-14 w-24 shrink-0 rounded-lg object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="flex h-14 w-24 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                      <PlayCircle size={18} className="text-app-muted" />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-xs font-semibold leading-4 text-app-text">{video.title}</span>
                    {video.description ? (
                      <span className="mt-0.5 line-clamp-1 block text-[10px] text-app-muted">{video.description}</span>
                    ) : null}
                    <span className="mt-0.5 block text-[10px] text-app-muted">
                      {video.channel ? `${video.channel} · ` : ""}
                      {video.durationLabel ? `${video.durationLabel} · ` : ""}
                      {video.publishedAt ? `게시 ${video.publishedAt.slice(0, 10)} · ` : ""}
                      관련 검색: {video.relatedQuery}
                    </span>
                  </span>
                </a>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </SurfaceCard>
  );
}

function ReportSection({
  title,
  body,
  onCite
}: {
  title: string;
  body: string;
  onCite: (citationNumber: number) => void;
}) {
  const parts = body.split(/(\[\d{1,2}\])/gu);
  return (
    <section>
      <h3 className="text-xs font-bold text-app-muted">{title}</h3>
      <p className="mt-1.5 whitespace-pre-wrap break-words text-xs leading-5 text-app-text">
        {parts.map((part, index) => {
          const match = part.match(/^\[(\d{1,2})\]$/u);
          if (!match) return <span key={index}>{part}</span>;
          const citationNumber = Number(match[1]);
          return (
            <button
              key={index}
              type="button"
              onClick={() => onCite(citationNumber)}
              aria-label={`출처 ${citationNumber} 보기`}
              className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded bg-app-hover px-1 align-text-top text-[9px] font-bold text-app-primary hover:bg-app-primary hover:text-white"
            >
              {citationNumber}
            </button>
          );
        })}
      </p>
    </section>
  );
}

function TabButton({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
        active ? "bg-app-primary text-white" : "border border-app-border bg-white text-app-muted"
      }`}
    >
      {children}
    </button>
  );
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    queued: "대기",
    planning: "계획",
    searching: "검색",
    reading: "열람",
    analyzing: "분석",
    verifying: "검증",
    writing: "작성",
    completed: "완료",
    failed: "실패",
    cancelled: "중단",
    paused: "일시정지"
  };
  return labels[status] || status;
}

function buildDuration(startedAt: string | null, completedAt: string | null) {
  if (!startedAt) return "-";
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.round((end - new Date(startedAt).getTime()) / 1000));
  if (seconds < 60) return `${seconds}초`;
  return `${Math.floor(seconds / 60)}분 ${seconds % 60}초`;
}

function formatTime(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
