"use client";

import { RefreshCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Job = { id: string; jobType: string; attempt: number; maxAttempts: number; deadLetterReason: string; safePayload: unknown; updatedAt: string };
type Audit = { id?: string; action?: string; createdAt?: string; actorAccountId?: string; targetAccountId?: string | null; safeMetadata?: unknown };

export function AdminOperations({ initialView }: { initialView: "dlq" | "audit" }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [events, setEvents] = useState<Audit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    const response = await fetch(initialView === "dlq" ? "/api/admin/automation/dlq" : "/api/admin/audit-log", { cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as { jobs?: Job[]; administratorEvents?: Audit[]; error?: string };
    if (!response.ok) throw new Error(body.error || "운영 데이터를 불러오지 못했습니다.");
    setJobs(body.jobs || []);
    setEvents(body.administratorEvents || []);
  }, [initialView]);
  useEffect(() => { void load().catch((caught) => setError(caught.message)); }, [load]);

  async function requeue(jobId: string) {
    if (!window.confirm("이 Job을 새 실행과 새 승인 흐름으로 다시 실행할까요?")) return;
    setBusy(jobId);
    try {
      const response = await fetch("/api/admin/automation/dlq", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId }) });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || "재실행에 실패했습니다.");
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "재실행에 실패했습니다."); } finally { setBusy(null); }
  }

  return <section className="rounded-[22px] border border-app-border bg-app-card p-5 shadow-soft"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">{initialView === "dlq" ? "Dead Letter Queue" : "Append-only 감사 로그"}</h2><p className="mt-1 text-xs text-app-muted">{initialView === "dlq" ? "민감정보가 마스킹된 실패 작업을 확인하고 새 실행으로 재등록합니다." : "관리자 작업의 실행자, 대상, 변경 내용을 수정 불가능한 기록으로 확인합니다."}</p></div><button type="button" onClick={() => void load()} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-app-border" aria-label="새로고침"><RefreshCcw size={16} /></button></div>{error ? <p className="mt-4 rounded-2xl bg-red-50 p-3 text-xs text-red-700">{error}</p> : null}<div className="mt-5 space-y-3">{initialView === "dlq" ? jobs.map((job) => <article key={job.id} className="rounded-2xl border border-app-border p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start"><div className="min-w-0 flex-1"><p className="text-xs font-bold">{job.jobType} · {job.id}</p><p className="mt-1 text-[10px] text-app-muted">시도 {job.attempt}/{job.maxAttempts} · {new Date(job.updatedAt).toLocaleString("ko-KR")}</p><p className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-700">{job.deadLetterReason}</p><pre className="app-scrollbar mt-3 max-h-44 overflow-auto rounded-xl bg-slate-950 p-3 text-[10px] text-slate-200">{JSON.stringify(job.safePayload, null, 2)}</pre></div><button type="button" disabled={busy === job.id} onClick={() => void requeue(job.id)} className="min-h-11 rounded-2xl bg-app-primary px-4 text-xs font-bold text-white disabled:opacity-50">새 실행 생성</button></div></article>) : events.map((event, index) => <article key={event.id || index} className="rounded-2xl border border-app-border p-4"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-app-hover px-2 py-1 text-[10px] font-bold text-app-primary">{event.action || "event"}</span><span className="text-[10px] text-app-muted">{event.createdAt ? new Date(event.createdAt).toLocaleString("ko-KR") : "—"}</span></div><p className="mt-3 text-xs">실행자 {event.actorAccountId || "—"} · 대상 {event.targetAccountId || "—"}</p><pre className="mt-3 overflow-auto rounded-xl bg-slate-50 p-3 text-[10px]">{JSON.stringify(event.safeMetadata || {}, null, 2)}</pre></article>)}{(initialView === "dlq" ? jobs.length === 0 : events.length === 0) && !error ? <p className="py-14 text-center text-sm text-app-muted">표시할 기록이 없습니다.</p> : null}</div></section>;
}

