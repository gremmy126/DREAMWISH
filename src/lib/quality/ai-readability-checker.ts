import type { LocalDocument } from "@/src/lib/rag/rag.types";
import type { DocumentQualityIssue } from "./document-quality.types";

export function checkAIReadability(document: LocalDocument): DocumentQualityIssue[] {
  const issues: DocumentQualityIssue[] = [];
  const length = document.content.length;
  const headingCount = document.content.match(/^##\s+/gmu)?.length || 0;

  if (length > 12000) {
    issues.push({
      path: document.relativePath,
      title: document.title,
      severity: "info",
      type: "too_long",
      message: "문서가 길어 chunk 분할과 요약이 필요할 수 있습니다."
    });
  }
  if (length < 320) {
    issues.push({
      path: document.relativePath,
      title: document.title,
      severity: "warning",
      type: "too_short",
      message: "AI가 판단하기에 내용이 너무 짧습니다."
    });
  }
  if (headingCount < 3) {
    issues.push({
      path: document.relativePath,
      title: document.title,
      severity: "warning",
      type: "ai_readability",
      message: "섹션 구조가 부족해 AI가 맥락을 나누어 읽기 어렵습니다."
    });
  }

  return issues;
}
