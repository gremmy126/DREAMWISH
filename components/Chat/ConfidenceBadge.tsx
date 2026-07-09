import type { AnswerConfidence } from "@/src/lib/chat/chat.types";

type ConfidenceBadgeProps = {
  confidence: AnswerConfidence | null;
};

const labelByLevel = {
  high: "문서 근거 충분",
  medium: "일부 문서 근거 있음",
  low: "문서 근거 부족",
  none: "로컬 문서에서 확인 불가"
};

const colorByLevel = {
  high: "border-emerald-200 bg-emerald-50 text-emerald-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-orange-200 bg-orange-50 text-orange-700",
  none: "border-slate-200 bg-slate-50 text-slate-600"
};

export function ConfidenceBadge({ confidence }: ConfidenceBadgeProps) {
  if (!confidence) return null;

  return (
    <span
      title={confidence.reason}
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${colorByLevel[confidence.level]}`}
    >
      {labelByLevel[confidence.level]} · {Math.round(confidence.score * 100)}%
    </span>
  );
}
