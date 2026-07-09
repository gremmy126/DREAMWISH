import type { AnswerVerification } from "@/src/lib/chat/chat.types";
import type { SourceDocument } from "@/src/lib/chat/chat.types";

const UNKNOWN_ANSWER = "현재 로컬 문서 안에서는 이 내용을 확인할 수 없습니다.";

export function verifyAnswer(answer: string, sources: SourceDocument[]): AnswerVerification {
  if (sources.length === 0) {
    return {
      supportedClaims: [],
      weakClaims: [],
      unsupportedClaims: answer.includes(UNKNOWN_ANSWER) ? [] : splitClaims(answer),
      warning: answer.includes(UNKNOWN_ANSWER)
        ? null
        : "로컬 문서에서 확인되지 않은 내용이 포함될 수 있습니다."
    };
  }

  const sourceText = sources.map((source) => source.preview).join("\n").toLowerCase();
  const supportedClaims: string[] = [];
  const weakClaims: string[] = [];
  const unsupportedClaims: string[] = [];

  for (const claim of splitClaims(answer)) {
    const tokens = tokenize(claim);
    const matches = tokens.filter((token) => sourceText.includes(token)).length;
    const ratio = tokens.length > 0 ? matches / tokens.length : 0;

    if (ratio >= 0.45) supportedClaims.push(claim);
    else if (ratio >= 0.2) weakClaims.push(claim);
    else unsupportedClaims.push(claim);
  }

  return {
    supportedClaims,
    weakClaims,
    unsupportedClaims,
    warning:
      unsupportedClaims.length > 0
        ? "로컬 문서에서 확인되지 않은 내용이 포함될 수 있습니다."
        : weakClaims.length > 0
          ? "일부 내용은 문서 근거가 약합니다."
          : "문서 근거 충분"
  };
}

function splitClaims(answer: string) {
  return answer
    .split(/(?<=[.!?。！？])\s+|\n+/u)
    .map((claim) => claim.replace(/^[-*\d.\s]+/u, "").trim())
    .filter((claim) => claim.length > 12)
    .slice(0, 12);
}

function tokenize(text: string) {
  return Array.from(
    new Set(text.toLowerCase().match(/[가-힣a-z0-9_]{2,}/giu) || [])
  ).slice(0, 20);
}
