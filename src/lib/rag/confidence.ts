import type { AnswerConfidence } from "@/src/lib/chat/chat.types";
import type { RagChunk } from "./rag.types";

export function calculateConfidence(chunks: RagChunk[]): AnswerConfidence {
  if (chunks.length === 0) {
    return {
      level: "none",
      score: 0,
      reason: "근거 없음: 로컬 문서에서 관련 내용을 찾지 못했습니다."
    };
  }

  const average =
    chunks.reduce((sum, chunk) => sum + chunk.relevance, 0) / chunks.length;
  const score = Number(average.toFixed(2));

  if (chunks.length >= 5 && average >= 0.8) {
    return { level: "high", score, reason: "높음: 문서 근거 충분" };
  }

  if (chunks.length >= 3 && average >= 0.6) {
    return { level: "medium", score, reason: "중간: 일부 문서 근거 있음" };
  }

  return { level: "low", score, reason: "낮음: 문서 근거 부족" };
}
