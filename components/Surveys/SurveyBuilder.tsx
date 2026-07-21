"use client";

import { GripVertical, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import type { SurveyCriterion, SurveyQuestionType } from "@/src/lib/surveys/survey.types";

export type BuilderQuestion = {
  id: string;
  type: SurveyQuestionType;
  prompt: string;
  description: string;
  options: string[];
  required: boolean;
  orderIndex: number;
  decisionCriterion: SurveyCriterion | null;
  scoreDirection: "positive" | "negative";
  weight: number;
};

const TYPE_LABELS: Record<SurveyQuestionType, string> = {
  single_choice: "단일 선택",
  multi_choice: "복수 선택",
  yes_no: "예/아니오",
  scale_1_5: "1~5점 척도",
  open_text: "주관식"
};

const CRITERION_LABELS: Record<SurveyCriterion, string> = {
  support: "지지도",
  impact: "기대 효과",
  feasibility: "실행 가능성",
  risk: "위험"
};

type SurveyBuilderProps = {
  questions: BuilderQuestion[];
  onChange: (questions: BuilderQuestion[]) => void;
  disabled?: boolean;
};

// Question builder: add / edit / delete / drag-reorder. Order is derived from
// array position; orderIndex is normalized on every change.
export function SurveyBuilder({ questions, onChange, disabled = false }: SurveyBuilderProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  function commit(next: BuilderQuestion[]) {
    onChange(next.map((question, index) => ({ ...question, orderIndex: index })));
  }

  function addQuestion() {
    commit([
      ...questions,
      {
        id: `q-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        type: "scale_1_5",
        prompt: "",
        description: "",
        options: [],
        required: true,
        orderIndex: questions.length,
        decisionCriterion: null,
        scoreDirection: "positive",
        weight: 1
      }
    ]);
  }

  function updateQuestion(index: number, patch: Partial<BuilderQuestion>) {
    commit(questions.map((question, i) => (i === index ? { ...question, ...patch } : question)));
  }

  function removeQuestion(index: number) {
    commit(questions.filter((_, i) => i !== index));
  }

  function moveQuestion(from: number, to: number) {
    if (to < 0 || to >= questions.length || from === to) return;
    const next = [...questions];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    commit(next);
  }

  return (
    <div className="space-y-3">
      {questions.map((question, index) => (
        <div
          key={question.id}
          draggable={!disabled}
          onDragStart={() => setDragIndex(index)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => {
            if (dragIndex !== null) moveQuestion(dragIndex, index);
            setDragIndex(null);
          }}
          className={`rounded-app border bg-app-card p-4 shadow-soft transition ${
            dragIndex === index ? "border-app-primary opacity-70" : "border-app-border"
          }`}
        >
          <div className="flex items-start gap-3">
            <button
              type="button"
              disabled={disabled}
              className="mt-2 cursor-grab text-app-muted disabled:cursor-default"
              aria-label="드래그하여 순서 변경"
            >
              <GripVertical size={16} />
            </button>
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-xl bg-app-hover px-2 py-1 text-[11px] font-semibold text-app-primary">
                  Q{index + 1}
                </span>
                <select
                  disabled={disabled}
                  value={question.type}
                  onChange={(event) =>
                    updateQuestion(index, {
                      type: event.target.value as SurveyQuestionType,
                      options:
                        event.target.value === "single_choice" || event.target.value === "multi_choice"
                          ? question.options.length
                            ? question.options
                            : ["선택지 1", "선택지 2"]
                          : []
                    })
                  }
                  className="h-8 rounded-xl border border-app-border bg-white px-2 text-xs font-medium text-app-text"
                >
                  {Object.entries(TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <select
                  disabled={disabled}
                  value={question.decisionCriterion || ""}
                  onChange={(event) =>
                    updateQuestion(index, {
                      decisionCriterion: (event.target.value || null) as SurveyCriterion | null
                    })
                  }
                  className="h-8 rounded-xl border border-app-border bg-white px-2 text-xs font-medium text-app-text"
                >
                  <option value="">평가 기준 없음</option>
                  {Object.entries(CRITERION_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      기준: {label}
                    </option>
                  ))}
                </select>
                {question.type === "scale_1_5" ? (
                  <select
                    disabled={disabled}
                    value={question.scoreDirection}
                    onChange={(event) =>
                      updateQuestion(index, {
                        scoreDirection: event.target.value as "positive" | "negative"
                      })
                    }
                    className="h-8 rounded-xl border border-app-border bg-white px-2 text-xs font-medium text-app-text"
                  >
                    <option value="positive">높을수록 긍정</option>
                    <option value="negative">높을수록 부정(역산)</option>
                  </select>
                ) : null}
                <label className="flex items-center gap-1.5 text-xs font-medium text-app-muted">
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={question.required}
                    onChange={(event) => updateQuestion(index, { required: event.target.checked })}
                  />
                  필수
                </label>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    disabled={disabled || index === 0}
                    onClick={() => moveQuestion(index, index - 1)}
                    className="rounded-lg border border-app-border px-2 py-1 text-[11px] text-app-muted transition hover:bg-app-hover disabled:opacity-40"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={disabled || index === questions.length - 1}
                    onClick={() => moveQuestion(index, index + 1)}
                    className="rounded-lg border border-app-border px-2 py-1 text-[11px] text-app-muted transition hover:bg-app-hover disabled:opacity-40"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => removeQuestion(index)}
                    className="rounded-lg border border-app-border px-2 py-1 text-red-500 transition hover:bg-red-50 disabled:opacity-40"
                    aria-label="문항 삭제"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
              <input
                disabled={disabled}
                value={question.prompt}
                onChange={(event) => updateQuestion(index, { prompt: event.target.value })}
                placeholder="질문을 입력하세요"
                className="h-10 w-full rounded-2xl border border-app-border bg-white px-3 text-sm text-app-text outline-none transition focus:border-app-primary"
              />
              {question.type === "single_choice" || question.type === "multi_choice" ? (
                <div className="space-y-2">
                  {question.options.map((option, optionIndex) => (
                    <div key={optionIndex} className="flex items-center gap-2">
                      <input
                        disabled={disabled}
                        value={option}
                        onChange={(event) => {
                          const options = [...question.options];
                          options[optionIndex] = event.target.value;
                          updateQuestion(index, { options });
                        }}
                        className="h-9 flex-1 rounded-xl border border-app-border bg-white px-3 text-xs text-app-text outline-none transition focus:border-app-primary"
                      />
                      <button
                        type="button"
                        disabled={disabled || question.options.length <= 2}
                        onClick={() =>
                          updateQuestion(index, {
                            options: question.options.filter((_, i) => i !== optionIndex)
                          })
                        }
                        className="text-app-muted transition hover:text-red-500 disabled:opacity-40"
                        aria-label="선택지 삭제"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      updateQuestion(index, {
                        options: [...question.options, `선택지 ${question.options.length + 1}`]
                      })
                    }
                    className="flex items-center gap-1 text-xs font-semibold text-app-primary transition hover:opacity-80"
                  >
                    <Plus size={13} />
                    선택지 추가
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={addQuestion}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-app border border-dashed border-app-border bg-white text-xs font-semibold text-app-muted transition hover:border-app-primary hover:text-app-primary disabled:opacity-50"
      >
        <Plus size={14} />
        문항 추가
      </button>
    </div>
  );
}
