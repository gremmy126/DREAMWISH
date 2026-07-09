import type { LocalDocument } from "@/src/lib/rag/rag.types";
import type { DocumentQualityIssue } from "./document-quality.types";

export function checkMetadata(document: LocalDocument): DocumentQualityIssue[] {
  const issues: DocumentQualityIssue[] = [];
  const raw = document.content;

  if (!raw.trim().startsWith("---")) {
    issues.push(issue(document, "missing_frontmatter", "error", "frontmatter가 없습니다."));
  }
  if (!raw.match(/^#\s+.+$/m)) {
    issues.push(issue(document, "missing_title", "error", "제목이 없습니다."));
  }
  if (!raw.includes("## 목적")) {
    issues.push(issue(document, "missing_purpose", "warning", "목적 섹션이 없습니다."));
  }
  if (!raw.includes("## 요약")) {
    issues.push(issue(document, "missing_summary", "warning", "요약 섹션이 없습니다."));
  }
  if (document.tags.length === 0) {
    issues.push(issue(document, "missing_tags", "warning", "태그가 없습니다."));
  }
  if (!raw.includes("## 업데이트 기록")) {
    issues.push(issue(document, "missing_update_log", "warning", "업데이트 기록 섹션이 없습니다."));
  }

  return issues;
}

function issue(
  document: LocalDocument,
  type: DocumentQualityIssue["type"],
  severity: DocumentQualityIssue["severity"],
  message: string
): DocumentQualityIssue {
  return {
    path: document.relativePath,
    title: document.title,
    type,
    severity,
    message
  };
}
