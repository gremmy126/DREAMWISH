"use client";

import { BarChart3, Hourglass, MessageSquareQuote, Sparkles } from "lucide-react";
import { useState } from "react";
import type { SurveyAggregate } from "@/src/lib/surveys/survey-aggregation";
import type { DecisionEmployeeSignal, SurveyAiSummary } from "@/src/lib/surveys/survey.types";

export type SurveyResultsPayload =
  | {
      locked: true;
      status: string;
      responseCount: number;
      minimumResultCount: number;
    }
  | {
      locked: false;
      status: string;
      minimumResultCount: number;
      aggregate: SurveyAggregate;
      openAnswers: Array<{ questionId: string; text: string }>;
      needsReviewCount: number;
      signal: DecisionEmployeeSignal | null;
    };

type SurveyResultsProps = {
  surveyId: string;
  results: SurveyResultsPayload;
  onSignalUpdated?: (signal: DecisionEmployeeSignal | null) => void;
};

const CONFIDENCE_LABELS: Record<string, string> = {
  low: "낮음",
  medium: "보통",
  high: "높음"
};

export function SurveyResults({ surveyId, results, onSignalUpdated }: SurveyResultsProps) {
  const [summary, setSummary] = useState<SurveyAiSummary | null>(null);
  const [aiFailed, setAiFailed] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  if (results.locked) {
    return (
      <div className="rounded-app border border-app-border bg-app-card p-6 text-center shadow-soft">
        <Hourglass size={20} className="mx-auto text-app-primary" />
        <p className="mt-2 text-sm font-semibold text-app-text">결과 대기 상태</p>
        <p className="mt-1 text-xs leading-5 text-app-muted">
          현재 응답 {results.responseCount}명 — 결과 공개에는 최소{" "}
          {results.minimumResultCount}명이 필요합니다. 익명성 보호를 위해 개별 문항
          결과와 주관식 답변, AI 요약은 공개되지 않습니다.
        </p>
      </div>
    );
  }

  const { aggregate, openAnswers, signal } = results;

  async function runAiSummary() {
    setAiLoading(true);
    setAiFailed(false);
    try {
      const response = await fetch(`/api/surveys/${surveyId}/summary`, { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as {
        aiFailed?: boolean;
        summary?: SurveyAiSummary | null;
        signal?: DecisionEmployeeSignal | null;
      };
      if (!response.ok || body.aiFailed || !body.summary) {
        setAiFailed(true);
        return;
      }
      setSummary(body.summary);
      if (body.signal !== undefined) onSignalUpdated?.(body.signal ?? null);
    } catch {
      setAiFailed(true);
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <ScoreCard label="대상 인원" value={String(aggregate.eligibleCount)} />
        <ScoreCard label="응답자 수" value={String(aggregate.responseCount)} />
        <ScoreCard label="응답률" value={`${Math.round(aggregate.responseRate * 100)}%`} />
        <ScoreCard
          label="Employee Signal"
          value={aggregate.employeeSignalScore === null ? "—" : `${aggregate.employeeSignalScore}점`}
          highlight
        />
        <ScoreCard
          label="신뢰 수준"
          value={CONFIDENCE_LABELS[aggregate.confidenceLevel] || aggregate.confidenceLevel}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <ScoreCard label="지지 점수" value={formatScore(aggregate.criterionScores.support)} />
        <ScoreCard label="기대 효과" value={formatScore(aggregate.criterionScores.impact)} />
        <ScoreCard label="실행 가능성" value={formatScore(aggregate.criterionScores.feasibility)} />
        <ScoreCard label="위험 우려" value={formatScore(aggregate.criterionScores.risk)} />
        <ScoreCard label="의견 일치도" value={formatScore(aggregate.consensusScore)} />
      </div>

      {aggregate.questionAggregates
        .filter((question) => question.type === "scale_1_5" && question.distribution)
        .map((question) => (
          <div key={question.questionId} className="rounded-app border border-app-border bg-app-card p-4 shadow-soft">
            <p className="text-xs font-semibold text-app-text">{question.prompt}</p>
            <div className="mt-3 space-y-1.5">
              {(["1", "2", "3", "4", "5"] as const).map((score) => {
                const count = question.distribution?.[score] || 0;
                const total = question.answerCount || 1;
                return (
                  <div key={score} className="flex items-center gap-2 text-[11px] text-app-muted">
                    <span className="w-4 text-right font-semibold">{score}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-app-primary/80"
                        style={{ width: `${(count / total) * 100}%` }}
                      />
                    </div>
                    <span className="w-8">{count}명</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-app-muted">
              평균 {question.average ?? "—"} · 정규화 {question.normalizedScore ?? "—"}점 · 일치도{" "}
              {question.consensusScore ?? "—"}
            </p>
          </div>
        ))}

      {aggregate.riskRanking.length ? (
        <div className="rounded-app border border-app-border bg-app-card p-4 shadow-soft">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-app-text">
            <BarChart3 size={14} className="text-app-primary" />
            위험요소 순위
          </p>
          <ol className="mt-2 space-y-1.5">
            {aggregate.riskRanking.map((risk, index) => (
              <li key={risk.option} className="flex items-center justify-between gap-3 text-xs text-app-muted">
                <span className="min-w-0 truncate">
                  {index + 1}. {risk.option}
                </span>
                <span className="font-semibold text-app-text">{risk.count}명</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {openAnswers.length ? (
        <div className="rounded-app border border-app-border bg-app-card p-4 shadow-soft">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-app-text">
            <MessageSquareQuote size={14} className="text-app-primary" />
            주요 의견 (비식별 처리, 무작위 순서)
          </p>
          <ul className="mt-2 space-y-2">
            {openAnswers.slice(0, 30).map((answer, index) => (
              <li key={index} className="rounded-2xl bg-app-hover/60 px-3 py-2 text-xs leading-5 text-app-text">
                {answer.text}
              </li>
            ))}
          </ul>
          {results.needsReviewCount ? (
            <p className="mt-2 text-[11px] text-app-muted">
              비식별 처리 검토가 필요한 응답 {results.needsReviewCount}건은 공개되지 않았습니다.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-app border border-app-border bg-app-card p-4 shadow-soft">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-app-text">
            <Sparkles size={14} className="text-app-primary" />
            AI 요약
          </p>
          <button
            type="button"
            disabled={aiLoading}
            onClick={() => void runAiSummary()}
            className="h-8 rounded-2xl bg-app-primary px-3 text-[11px] font-semibold text-white shadow-soft transition hover:opacity-90 disabled:opacity-50"
          >
            {aiLoading ? "생성 중" : "AI 요약 생성"}
          </button>
        </div>
        {aiFailed ? (
          <p className="mt-2 text-[11px] text-app-muted">
            AI 요약 생성에 실패했습니다. 위의 통계 결과는 정상적으로 제공됩니다.
          </p>
        ) : null}
        {summary || signal?.generatedSummary ? (
          <div className="mt-3 space-y-3 text-xs leading-5 text-app-text">
            <p>{summary?.summary || signal?.generatedSummary}</p>
            <SummaryList title="주요 찬성 이유" items={summary?.top_support_reasons || signal?.topSupportReasons || []} />
            <SummaryList title="핵심 우려" items={summary?.top_concerns || signal?.topConcerns || []} />
            <SummaryList title="소수 의견" items={summary?.minority_views || signal?.minorityViews || []} />
            {summary ? (
              <>
                <SummaryList title="대안 제안" items={summary.alternative_suggestions} />
                <SummaryList title="실행 장애물" items={summary.execution_blockers} />
                <SummaryList title="경영진 확인사항" items={summary.questions_for_management} />
                {summary.confidence_note ? (
                  <p className="text-[11px] text-app-muted">{summary.confidence_note}</p>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ScoreCard({
  label,
  value,
  highlight = false
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-app border p-3 shadow-soft ${
        highlight ? "border-app-primary/50 bg-app-hover" : "border-app-border bg-app-card"
      }`}
    >
      <p className="text-[11px] font-semibold text-app-muted">{label}</p>
      <p className={`mt-1 text-lg font-bold ${highlight ? "text-app-primary" : "text-app-text"}`}>
        {value}
      </p>
    </div>
  );
}

function SummaryList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold text-app-muted">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function formatScore(value: number | null): string {
  return value === null ? "—" : `${value}점`;
}
