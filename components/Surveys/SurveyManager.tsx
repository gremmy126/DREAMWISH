"use client";

import { ClipboardList, Eye, Megaphone, Save, Sparkles, StopCircle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/Common/EmptyState";
import type { Survey } from "@/src/lib/surveys/survey.types";
import { SurveyBuilder, type BuilderQuestion } from "./SurveyBuilder";
import { SurveyResults, type SurveyResultsPayload } from "./SurveyResults";
import { SurveyRunner } from "./SurveyRunner";

type SurveyWithStats = Survey & {
  stats?: {
    eligibleCount: number;
    responseCount: number;
    responseRate: number;
    remainingDays: number | null;
  };
};

type SurveyManagerProps = {
  decisionId: string;
  // Prefills the target list (e.g. every Team member) when a draft has none.
  defaultTargetEmails?: string[];
};

const STATUS_LABELS: Record<string, string> = {
  draft: "초안",
  active: "진행 중",
  closed: "종료",
  archived: "보관"
};

// Admin-side survey management for a decision project: create, AI draft,
// build questions, preview, save draft, publish, close, and view aggregate
// results. Individual respondent status is intentionally unavailable.
export function SurveyManager({ decisionId, defaultTargetEmails = [] }: SurveyManagerProps) {
  const [surveys, setSurveys] = useState<SurveyWithStats[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SurveyWithStats | null>(null);
  const [results, setResults] = useState<SurveyResultsPayload | null>(null);
  const [targetsText, setTargetsText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/surveys", { cache: "no-store" });
      if (!response.ok) throw new Error("설문 목록을 불러오지 못했습니다.");
      const body = (await response.json()) as { surveys: SurveyWithStats[] };
      setSurveys((body.surveys || []).filter((survey) => survey.decisionId === decisionId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "설문 목록을 불러오지 못했습니다.");
    }
  }, [decisionId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const defaultTargetsKey = defaultTargetEmails.join("\n");

  useEffect(() => {
    const survey = surveys.find((candidate) => candidate.id === selectedId) || null;
    setDraft(survey ? structuredClone(survey) : null);
    setTargetsText(
      survey
        ? survey.targetMemberEmails.length
          ? survey.targetMemberEmails.join("\n")
          : defaultTargetsKey
        : ""
    );
    setResults(null);
    setPreviewing(false);
  }, [selectedId, surveys, defaultTargetsKey]);

  async function request(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
    const response = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...init
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(typeof body.error === "string" ? body.error : "요청을 처리하지 못했습니다.");
    }
    return body;
  }

  async function run(action: () => Promise<void>, successNotice?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      if (successNotice) setNotice(successNotice);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "요청을 처리하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  function createSurvey() {
    void run(async () => {
      const body = await request("/api/surveys", {
        method: "POST",
        body: JSON.stringify({
          title: newTitle.trim() || "새 조직 의견 설문",
          decisionId
        })
      });
      const survey = body.survey as SurveyWithStats;
      setCreating(false);
      setNewTitle("");
      await reload();
      setSelectedId(survey.id);
    }, "설문 초안을 만들었습니다.");
  }

  function saveDraft() {
    if (!draft) return;
    void run(async () => {
      await request(`/api/surveys/${draft.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: draft.title,
          description: draft.description,
          minimumResultCount: draft.minimumResultCount,
          employeeSignalWeight: draft.employeeSignalWeight,
          estimatedMinutes: draft.estimatedMinutes,
          opensAt: draft.opensAt,
          closesAt: draft.closesAt,
          targetMemberEmails: targetsText
            .split(/[\n,;]+/u)
            .map((email) => email.trim())
            .filter(Boolean),
          questions: draft.questions
        })
      });
      await reload();
    }, "임시저장했습니다.");
  }

  function applyAiDraft() {
    if (!draft) return;
    void run(async () => {
      const body = await request(`/api/surveys/${draft.id}/ai-draft`, { method: "POST" });
      await reload();
      setNotice(
        body.source === "ai"
          ? "AI 초안을 적용했습니다. 검토 후 직접 게시해야 합니다."
          : "기본 5문항 초안을 적용했습니다. 검토 후 직접 게시해야 합니다."
      );
    });
  }

  function publish() {
    if (!draft) return;
    void run(async () => {
      await request(`/api/surveys/${draft.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "publish" })
      });
      await reload();
    }, "설문을 게시했습니다.");
  }

  function close() {
    if (!draft) return;
    void run(async () => {
      await request(`/api/surveys/${draft.id}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "close" })
      });
      await reload();
    }, "설문을 종료했습니다.");
  }

  function loadResults() {
    if (!draft) return;
    void run(async () => {
      const body = await request(`/api/surveys/${draft.id}/results`);
      setResults(body.results as SurveyResultsPayload);
    });
  }

  if (!surveys.length && !creating) {
    return (
      <div>
        <EmptyState
          icon={ClipboardList}
          title="연결된 설문이 없습니다"
          description="이 결정에 대한 익명 의견수렴 설문을 만들어 조직의 목소리를 반영하세요."
        />
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="h-10 rounded-2xl bg-app-primary px-5 text-xs font-semibold text-white shadow-soft transition hover:opacity-90"
          >
            설문 만들기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? <p className="text-xs font-semibold text-red-600">{error}</p> : null}
      {notice ? (
        <p className="rounded-2xl border border-app-border bg-app-hover px-4 py-2.5 text-xs font-semibold text-app-primary">
          {notice}
        </p>
      ) : null}

      {creating ? (
        <div className="flex flex-wrap items-center gap-2 rounded-app border border-app-border bg-app-card p-4 shadow-soft">
          <input
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="설문 제목 (예: 신제품 출시 결정 의견수렴)"
            className="h-10 min-w-0 flex-1 rounded-2xl border border-app-border bg-white px-3 text-sm text-app-text outline-none transition focus:border-app-primary"
          />
          <button
            type="button"
            disabled={busy}
            onClick={createSurvey}
            className="h-10 rounded-2xl bg-app-primary px-4 text-xs font-semibold text-white shadow-soft transition hover:opacity-90 disabled:opacity-50"
          >
            만들기
          </button>
          <button
            type="button"
            onClick={() => setCreating(false)}
            className="h-10 rounded-2xl border border-app-border px-4 text-xs font-semibold text-app-muted transition hover:bg-app-hover"
          >
            취소
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {surveys.map((survey) => (
            <button
              key={survey.id}
              type="button"
              onClick={() => setSelectedId(survey.id)}
              className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
                selectedId === survey.id
                  ? "border-app-primary bg-app-hover text-app-primary"
                  : "border-app-border bg-white text-app-muted hover:bg-app-hover"
              }`}
            >
              <span className="max-w-[180px] truncate">{survey.title}</span>
              <span className="rounded-lg bg-white px-1.5 py-0.5 text-[10px] text-app-muted">
                {STATUS_LABELS[survey.status] || survey.status}
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-2xl border border-dashed border-app-border px-3 py-2 text-xs font-semibold text-app-muted transition hover:border-app-primary hover:text-app-primary"
          >
            + 새 설문
          </button>
        </div>
      )}

      {draft ? (
        <div className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-3 rounded-app border border-app-border bg-app-card p-4 shadow-soft">
              <label className="block text-xs font-semibold text-app-muted">
                설문 제목
                <input
                  disabled={draft.status !== "draft"}
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  className="mt-1 h-10 w-full rounded-2xl border border-app-border bg-white px-3 text-sm font-medium text-app-text outline-none transition focus:border-app-primary"
                />
              </label>
              <label className="block text-xs font-semibold text-app-muted">
                목적 설명
                <textarea
                  disabled={draft.status !== "draft"}
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  rows={3}
                  className="mt-1 w-full rounded-2xl border border-app-border bg-white p-3 text-sm text-app-text outline-none transition focus:border-app-primary"
                />
              </label>
              <label className="block text-xs font-semibold text-app-muted">
                대상 구성원 이메일 (줄바꿈 또는 쉼표로 구분)
                <textarea
                  disabled={draft.status !== "draft"}
                  value={targetsText}
                  onChange={(event) => setTargetsText(event.target.value)}
                  rows={3}
                  placeholder={"member1@company.com\nmember2@company.com"}
                  className="mt-1 w-full rounded-2xl border border-app-border bg-white p-3 text-xs text-app-text outline-none transition focus:border-app-primary"
                />
              </label>
            </div>
            <div className="space-y-3 rounded-app border border-app-border bg-app-card p-4 shadow-soft">
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-app-muted">
                  시작일
                  <input
                    type="date"
                    disabled={draft.status !== "draft"}
                    value={draft.opensAt ? draft.opensAt.slice(0, 10) : ""}
                    onChange={(event) =>
                      setDraft({ ...draft, opensAt: event.target.value || null })
                    }
                    className="mt-1 h-10 w-full rounded-2xl border border-app-border bg-white px-3 text-sm text-app-text"
                  />
                </label>
                <label className="block text-xs font-semibold text-app-muted">
                  마감일
                  <input
                    type="date"
                    disabled={draft.status !== "draft"}
                    value={draft.closesAt ? draft.closesAt.slice(0, 10) : ""}
                    onChange={(event) =>
                      setDraft({ ...draft, closesAt: event.target.value || null })
                    }
                    className="mt-1 h-10 w-full rounded-2xl border border-app-border bg-white px-3 text-sm text-app-text"
                  />
                </label>
                <label className="block text-xs font-semibold text-app-muted">
                  결과 공개 최소 인원
                  <input
                    type="number"
                    min={1}
                    disabled={draft.status !== "draft"}
                    value={draft.minimumResultCount}
                    onChange={(event) =>
                      setDraft({ ...draft, minimumResultCount: Number(event.target.value) || 5 })
                    }
                    className="mt-1 h-10 w-full rounded-2xl border border-app-border bg-white px-3 text-sm text-app-text"
                  />
                </label>
                <label className="block text-xs font-semibold text-app-muted">
                  예상 소요시간(분)
                  <input
                    type="number"
                    min={1}
                    disabled={draft.status !== "draft"}
                    value={draft.estimatedMinutes}
                    onChange={(event) =>
                      setDraft({ ...draft, estimatedMinutes: Number(event.target.value) || 5 })
                    }
                    className="mt-1 h-10 w-full rounded-2xl border border-app-border bg-white px-3 text-sm text-app-text"
                  />
                </label>
              </div>
              {draft.stats ? (
                <div className="grid grid-cols-2 gap-2 rounded-2xl bg-app-hover/60 p-3 text-xs text-app-muted sm:grid-cols-4">
                  <span>대상 {draft.stats.eligibleCount}명</span>
                  <span>응답 {draft.stats.responseCount}명</span>
                  <span>응답률 {Math.round(draft.stats.responseRate * 100)}%</span>
                  <span>
                    {draft.stats.remainingDays === null
                      ? "마감일 없음"
                      : `남은 기간 ${draft.stats.remainingDays}일`}
                  </span>
                </div>
              ) : null}
              <p className="text-[11px] leading-5 text-app-muted">
                익명 보호: 관리자에게는 집계 수치만 표시됩니다. 개인별 응답 여부와 제출
                시각은 어디에도 저장·표시되지 않습니다.
              </p>
            </div>
          </div>

          <SurveyBuilder
            questions={draft.questions as BuilderQuestion[]}
            disabled={draft.status !== "draft"}
            onChange={(questions) => setDraft({ ...draft, questions: questions as never })}
          />

          <div className="flex flex-wrap items-center gap-2">
            {draft.status === "draft" ? (
              <>
                <ActionButton icon={Sparkles} label="AI 초안 생성" onClick={applyAiDraft} disabled={busy} />
                <ActionButton icon={Save} label="임시저장" onClick={saveDraft} disabled={busy} />
                <ActionButton
                  icon={Eye}
                  label={previewing ? "미리보기 닫기" : "미리보기"}
                  onClick={() => setPreviewing((value) => !value)}
                  disabled={busy}
                />
                <ActionButton icon={Megaphone} label="게시" onClick={publish} disabled={busy} primary />
              </>
            ) : null}
            {draft.status === "active" ? (
              <ActionButton icon={StopCircle} label="설문 종료" onClick={close} disabled={busy} />
            ) : null}
            {draft.status !== "draft" ? (
              <ActionButton icon={ClipboardList} label="결과 보기" onClick={loadResults} disabled={busy} primary />
            ) : null}
          </div>

          {previewing ? (
            <div className="rounded-app border border-dashed border-app-primary/40 bg-app-hover/40 p-4">
              <p className="mb-3 text-center text-[11px] font-semibold text-app-primary">
                미리보기 — 실제 응답은 저장되지 않습니다
              </p>
              <SurveyRunner
                title={draft.title}
                description={draft.description}
                questions={draft.questions}
                previewMode
                onSubmit={() => undefined}
                onCancel={() => setPreviewing(false)}
              />
            </div>
          ) : null}

          {results ? <SurveyResults surveyId={draft.id} results={results} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  primary = false
}: {
  icon: typeof Save;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex h-10 items-center gap-1.5 rounded-2xl px-4 text-xs font-semibold shadow-soft transition disabled:opacity-50 ${
        primary
          ? "bg-app-primary text-white hover:opacity-90"
          : "border border-app-border bg-white text-app-text hover:bg-app-hover hover:text-app-primary"
      }`}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}
