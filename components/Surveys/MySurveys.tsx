"use client";

import { CalendarClock, CheckCircle2, ClipboardList, Timer } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { EmptyState } from "@/components/Common/EmptyState";
import { SurveyRunner, type RunnerAnswer, type RunnerQuestion } from "./SurveyRunner";

type MemberSurvey = {
  organizationId: string;
  surveyId: string;
  title: string;
  description: string;
  status: "active" | "closed";
  closesAt: string | null;
  estimatedMinutes: number;
  questionCount: number;
  myState: "pending" | "completed" | "closed";
};

type MemberSurveyView = {
  organizationId: string;
  surveyId: string;
  title: string;
  description: string;
  questions: RunnerQuestion[];
};

// "내 설문": pending / completed / closed surveys for the signed-in member.
// Starting a response asks the server to verify eligibility and issue the
// anonymous token; the token stays in memory and is sent in the POST body.
export function MySurveys() {
  const [surveys, setSurveys] = useState<MemberSurvey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<{ view: MemberSurveyView; token: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/surveys/member", { cache: "no-store" });
      if (!response.ok) throw new Error("설문 목록을 불러오지 못했습니다.");
      const body = (await response.json()) as { surveys: MemberSurvey[] };
      setSurveys(body.surveys || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "설문 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function startResponse(survey: MemberSurvey) {
    setNotice(null);
    try {
      const [viewResponse, tokenResponse] = await Promise.all([
        fetch(
          `/api/surveys/member/view?organizationId=${encodeURIComponent(survey.organizationId)}&surveyId=${encodeURIComponent(survey.surveyId)}`,
          { cache: "no-store" }
        ),
        fetch("/api/surveys/member/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId: survey.organizationId,
            surveyId: survey.surveyId
          })
        })
      ]);
      const viewBody = (await viewResponse.json().catch(() => ({}))) as {
        survey?: MemberSurveyView;
        error?: string;
      };
      const tokenBody = (await tokenResponse.json().catch(() => ({}))) as {
        token?: string;
        error?: string;
      };
      if (!viewResponse.ok || !viewBody.survey) {
        throw new Error(viewBody.error || "설문을 불러오지 못했습니다.");
      }
      if (!tokenResponse.ok || !tokenBody.token) {
        throw new Error(tokenBody.error || "응답 토큰을 발급받지 못했습니다.");
      }
      setActive({ view: viewBody.survey, token: tokenBody.token });
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "응답을 시작하지 못했습니다.");
    }
  }

  async function submit(answers: RunnerAnswer[]) {
    if (!active) return;
    setSubmitting(true);
    setNotice(null);
    try {
      const response = await fetch("/api/surveys/member/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: active.view.organizationId,
          surveyId: active.view.surveyId,
          token: active.token,
          answers
        })
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || "응답을 저장하지 못했습니다.");
      setActive(null);
      setNotice("응답이 익명으로 제출되었습니다. 참여해 주셔서 감사합니다.");
      await reload();
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "응답을 저장하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  if (active) {
    return (
      <div>
        {notice ? (
          <p className="mb-3 text-xs font-semibold text-red-600">{notice}</p>
        ) : null}
        <SurveyRunner
          title={active.view.title}
          description={active.view.description}
          questions={active.view.questions}
          submitting={submitting}
          onSubmit={submit}
          onCancel={() => setActive(null)}
        />
      </div>
    );
  }

  const pending = surveys.filter((survey) => survey.myState === "pending");
  const completed = surveys.filter((survey) => survey.myState === "completed");
  const closed = surveys.filter((survey) => survey.myState === "closed");

  return (
    <div className="space-y-5">
      {notice ? (
        <p className="rounded-2xl border border-app-border bg-app-hover px-4 py-3 text-xs font-semibold text-app-primary">
          {notice}
        </p>
      ) : null}
      {error ? <p className="text-xs font-semibold text-red-600">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-app-muted">불러오는 중…</p>
      ) : !surveys.length ? (
        <EmptyState
          icon={ClipboardList}
          title="배정된 설문이 없습니다"
          description="조직 관리자가 결정 프로젝트 설문을 게시하면 여기에 표시됩니다."
        />
      ) : (
        <>
          <SurveyGroup title="응답 대기" surveys={pending} onStart={startResponse} startable />
          <SurveyGroup title="응답 완료" surveys={completed} />
          <SurveyGroup title="마감된 설문" surveys={closed} />
        </>
      )}
    </div>
  );
}

function SurveyGroup({
  title,
  surveys,
  onStart,
  startable = false
}: {
  title: string;
  surveys: MemberSurvey[];
  onStart?: (survey: MemberSurvey) => void;
  startable?: boolean;
}) {
  if (!surveys.length) return null;
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-app-muted">{title}</p>
      <div className="space-y-2">
        {surveys.map((survey) => (
          <div
            key={`${survey.organizationId}:${survey.surveyId}`}
            className="flex flex-wrap items-center justify-between gap-3 rounded-app border border-app-border bg-app-card p-4 shadow-soft"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-app-text">{survey.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-app-muted">
                <span className="flex items-center gap-1">
                  <Timer size={12} />약 {survey.estimatedMinutes}분 · {survey.questionCount}문항
                </span>
                {survey.closesAt ? (
                  <span className="flex items-center gap-1">
                    <CalendarClock size={12} />
                    마감 {new Date(survey.closesAt).toLocaleDateString("ko-KR")}
                  </span>
                ) : null}
              </div>
            </div>
            {startable && onStart ? (
              <button
                type="button"
                onClick={() => onStart(survey)}
                className="h-9 rounded-2xl bg-app-primary px-4 text-xs font-semibold text-white shadow-soft transition hover:opacity-90"
              >
                응답 시작
              </button>
            ) : (
              <span className="flex items-center gap-1 text-xs font-semibold text-app-muted">
                <CheckCircle2 size={14} className="text-app-primary" />
                {survey.myState === "completed" ? "응답 완료" : "마감됨"}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
