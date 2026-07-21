"use client";

import { ChevronLeft, ChevronRight, Lock, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

export type RunnerQuestion = {
  id: string;
  type: "single_choice" | "multi_choice" | "yes_no" | "scale_1_5" | "open_text";
  prompt: string;
  description: string;
  options: string[];
  required: boolean;
  orderIndex: number;
};

export type RunnerAnswer = {
  questionId: string;
  selectedOptions?: string[];
  numericValue?: number;
  text?: string;
};

type SurveyRunnerProps = {
  title: string;
  description?: string;
  questions: RunnerQuestion[];
  submitting?: boolean;
  previewMode?: boolean;
  onSubmit: (answers: RunnerAnswer[]) => void | Promise<void>;
  onCancel?: () => void;
};

// Step-based respondent UI: one question per screen, progress indicator,
// previous/next, in-browser draft state, a confirm step, and the anonymity /
// no-personal-data notices. Layout is a single centered column so it stays
// usable on mobile widths.
export function SurveyRunner({
  title,
  description,
  questions,
  submitting = false,
  previewMode = false,
  onSubmit,
  onCancel
}: SurveyRunnerProps) {
  const ordered = useMemo(
    () => [...questions].sort((a, b) => a.orderIndex - b.orderIndex),
    [questions]
  );
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, RunnerAnswer>>({});
  const [validation, setValidation] = useState<string | null>(null);

  const confirmStep = step >= ordered.length;
  const question = confirmStep ? null : ordered[step];

  function updateAnswer(questionId: string, patch: Partial<RunnerAnswer>) {
    setValidation(null);
    setAnswers((previous) => ({
      ...previous,
      [questionId]: { ...previous[questionId], questionId, ...patch }
    }));
  }

  function hasValue(candidate: RunnerQuestion): boolean {
    const answer = answers[candidate.id];
    if (!answer) return false;
    if (candidate.type === "scale_1_5") return typeof answer.numericValue === "number";
    if (candidate.type === "open_text") return Boolean(answer.text?.trim());
    return Boolean(answer.selectedOptions?.length);
  }

  function goNext() {
    if (question && question.required && !hasValue(question)) {
      setValidation("필수 문항입니다. 응답 후 다음으로 이동하세요.");
      return;
    }
    setValidation(null);
    setStep((previous) => Math.min(previous + 1, ordered.length));
  }

  function submit() {
    const missing = ordered.filter((candidate) => candidate.required && !hasValue(candidate));
    if (missing.length) {
      setValidation("필수 문항에 아직 응답하지 않았습니다.");
      return;
    }
    void onSubmit(Object.values(answers).filter((answer) => answer.questionId));
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-4 rounded-app border border-app-border bg-app-hover/60 p-4 text-xs leading-5 text-app-muted">
        <p className="flex items-center gap-1.5 font-semibold text-app-primary">
          <ShieldCheck size={14} />
          익명 응답 안내
        </p>
        <p className="mt-1">
          이 설문은 검증된 익명 방식입니다. 응답은 계정과 분리되어 저장되며 관리자는 누가
          응답했는지 확인할 수 없습니다.
        </p>
        <p className="mt-1 flex items-center gap-1.5">
          <Lock size={12} />
          주관식에는 이름, 이메일, 전화번호, 사번 등 개인정보를 입력하지 마세요.
        </p>
      </div>

      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between text-xs text-app-muted">
          <span className="font-semibold text-app-text">{title}</span>
          <span>
            {Math.min(step + 1, ordered.length)} / {ordered.length}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-app-primary transition-all"
            style={{ width: `${(Math.min(step, ordered.length) / Math.max(1, ordered.length)) * 100}%` }}
          />
        </div>
      </div>

      {description && step === 0 ? (
        <p className="mb-4 text-sm leading-6 text-app-muted">{description}</p>
      ) : null}

      {question ? (
        <div className="rounded-app border border-app-border bg-app-card p-5 shadow-soft">
          <p className="text-sm font-semibold text-app-text">
            {question.prompt}
            {question.required ? <span className="ml-1 text-app-primary">*</span> : null}
          </p>
          {question.description ? (
            <p className="mt-1 text-xs leading-5 text-app-muted">{question.description}</p>
          ) : null}
          <div className="mt-4">
            <QuestionInput
              question={question}
              answer={answers[question.id]}
              onChange={(patch) => updateAnswer(question.id, patch)}
            />
          </div>
        </div>
      ) : (
        <div className="rounded-app border border-app-border bg-app-card p-5 shadow-soft">
          <p className="text-sm font-semibold text-app-text">제출 전 확인</p>
          <p className="mt-1 text-xs leading-5 text-app-muted">
            응답한 문항 {Object.keys(answers).length}개 / 전체 {ordered.length}개.
            제출하면 수정할 수 없으며, 응답은 익명으로 집계에만 사용됩니다.
          </p>
          <ul className="mt-3 space-y-2 text-xs text-app-muted">
            {ordered.map((candidate) => (
              <li key={candidate.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">{candidate.prompt}</span>
                <span className={hasValue(candidate) ? "font-semibold text-app-primary" : ""}>
                  {hasValue(candidate) ? "응답함" : candidate.required ? "미응답(필수)" : "건너뜀"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {validation ? (
        <p className="mt-3 text-xs font-semibold text-red-600">{validation}</p>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => (step === 0 ? onCancel?.() : setStep((previous) => previous - 1))}
          className="flex h-10 items-center gap-1 rounded-2xl border border-app-border bg-white px-4 text-xs font-semibold text-app-muted transition hover:bg-app-hover hover:text-app-primary"
        >
          <ChevronLeft size={14} />
          {step === 0 ? "닫기" : "이전"}
        </button>
        {confirmStep ? (
          <button
            type="button"
            disabled={submitting || previewMode}
            onClick={submit}
            className="flex h-10 items-center gap-1 rounded-2xl bg-app-primary px-5 text-xs font-semibold text-white shadow-soft transition hover:opacity-90 disabled:opacity-50"
          >
            {previewMode ? "미리보기 모드" : submitting ? "제출 중" : "익명으로 제출"}
          </button>
        ) : (
          <button
            type="button"
            onClick={goNext}
            className="flex h-10 items-center gap-1 rounded-2xl bg-app-primary px-5 text-xs font-semibold text-white shadow-soft transition hover:opacity-90"
          >
            다음
            <ChevronRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

function QuestionInput({
  question,
  answer,
  onChange
}: {
  question: RunnerQuestion;
  answer: RunnerAnswer | undefined;
  onChange: (patch: Partial<RunnerAnswer>) => void;
}) {
  if (question.type === "scale_1_5") {
    return (
      <div>
        <div className="flex items-center justify-between gap-2">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ numericValue: value })}
              className={`h-11 flex-1 rounded-2xl border text-sm font-semibold transition ${
                answer?.numericValue === value
                  ? "border-app-primary bg-app-primary text-white shadow-soft"
                  : "border-app-border bg-white text-app-muted hover:bg-app-hover hover:text-app-primary"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-app-muted">
          <span>전혀 아니다</span>
          <span>매우 그렇다</span>
        </div>
      </div>
    );
  }

  if (question.type === "open_text") {
    return (
      <textarea
        value={answer?.text || ""}
        onChange={(event) => onChange({ text: event.target.value })}
        rows={5}
        maxLength={4000}
        placeholder="개인정보 없이 의견을 자유롭게 작성하세요."
        className="w-full rounded-2xl border border-app-border bg-white p-3 text-sm leading-6 text-app-text outline-none transition focus:border-app-primary"
      />
    );
  }

  const multi = question.type === "multi_choice";
  const options = question.type === "yes_no" ? ["예", "아니오"] : question.options;
  const selected = answer?.selectedOptions || [];

  return (
    <div className="space-y-2">
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            onClick={() => {
              if (multi) {
                onChange({
                  selectedOptions: active
                    ? selected.filter((value) => value !== option)
                    : [...selected, option]
                });
              } else {
                onChange({ selectedOptions: [option] });
              }
            }}
            className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-medium transition ${
              active
                ? "border-app-primary bg-app-hover text-app-primary"
                : "border-app-border bg-white text-app-text hover:bg-app-hover"
            }`}
          >
            <span className="min-w-0">{option}</span>
            {multi ? (
              <span
                className={`ml-3 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[10px] font-bold ${
                  active ? "border-app-primary bg-app-primary text-white" : "border-app-border"
                }`}
              >
                {active ? "✓" : ""}
              </span>
            ) : (
              <span
                className={`ml-3 h-4 w-4 shrink-0 rounded-full border-2 ${
                  active ? "border-app-primary bg-app-primary" : "border-app-border"
                }`}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
