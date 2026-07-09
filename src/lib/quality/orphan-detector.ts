import type { LocalDocument } from "@/src/lib/rag/rag.types";
import type { DocumentQualityIssue } from "./document-quality.types";
import { extractWikiLinks } from "./link-quality-checker";

export function detectOrphans(documents: LocalDocument[]): DocumentQualityIssue[] {
  const inbound = new Map<string, number>();

  for (const document of documents) {
    inbound.set(document.relativePath, 0);
  }

  for (const document of documents) {
    for (const link of extractWikiLinks(document.content)) {
      for (const target of documents) {
        if (
          target.title === link ||
          target.relativePath === link ||
          target.relativePath.endsWith(`${link}.md`)
        ) {
          inbound.set(target.relativePath, (inbound.get(target.relativePath) || 0) + 1);
        }
      }
    }
  }

  return documents
    .filter((document) => (inbound.get(document.relativePath) || 0) === 0)
    .map((document) => ({
      path: document.relativePath,
      title: document.title,
      severity: "info" as const,
      type: "orphan" as const,
      message: "다른 문서에서 들어오는 링크가 없습니다."
    }));
}
