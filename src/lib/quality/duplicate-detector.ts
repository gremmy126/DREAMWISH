import type { LocalDocument } from "@/src/lib/rag/rag.types";
import type { DocumentQualityIssue } from "./document-quality.types";

export function detectDuplicates(documents: LocalDocument[]): DocumentQualityIssue[] {
  const issues: DocumentQualityIssue[] = [];

  for (let left = 0; left < documents.length; left += 1) {
    for (let right = left + 1; right < documents.length; right += 1) {
      const score = similarity(documents[left].content, documents[right].content);
      if (score > 0.72) {
        issues.push({
          path: documents[left].relativePath,
          title: documents[left].title,
          severity: "info",
          type: "duplicate_possible",
          message: `${documents[right].relativePath} 문서와 중복 가능성이 있습니다.`
        });
      }
    }
  }

  return issues;
}

function similarity(a: string, b: string) {
  const left = new Set(tokenize(a));
  const right = new Set(tokenize(b));
  const overlap = [...left].filter((term) => right.has(term)).length;
  const union = new Set([...left, ...right]).size;
  return union ? overlap / union : 0;
}

function tokenize(text: string) {
  return text.toLowerCase().match(/[가-힣a-z0-9_]{3,}/giu) || [];
}
