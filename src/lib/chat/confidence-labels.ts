import type { AnswerConfidence } from "./chat.types";

export function getConfidenceBadgeLabel(level: AnswerConfidence["level"]) {
  if (level === "high") return "로컬 문서 근거 충분";
  if (level === "medium") return "일부 로컬 문서 근거";
  if (level === "low") return "로컬 문서 근거 부족";
  return "일반 AI 답변";
}
