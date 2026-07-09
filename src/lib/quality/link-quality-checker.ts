import type { LocalDocument } from "@/src/lib/rag/rag.types";
import type { DocumentQualityIssue } from "./document-quality.types";

export function checkLinks(document: LocalDocument, documents: LocalDocument[]): DocumentQualityIssue[] {
  const issues: DocumentQualityIssue[] = [];
  const links = extractWikiLinks(document.content);
  const known = new Set(
    documents.flatMap((item) => [
      item.title,
      item.relativePath,
      item.relativePath.replace(/\.md$/u, ""),
      item.relativePath.split("/").pop()?.replace(/\.md$/u, "") || ""
    ])
  );

  if (links.length < 2) {
    issues.push({
      path: document.relativePath,
      title: document.title,
      severity: "warning",
      type: "low_links",
      message: "관련 문서 링크가 2개 미만입니다."
    });
  }

  for (const link of links) {
    if (!known.has(link)) {
      issues.push({
        path: document.relativePath,
        title: document.title,
        severity: "warning",
        type: "broken_link",
        message: `존재하지 않을 수 있는 내부 링크: [[${link}]]`
      });
    }
  }

  return issues;
}

export function extractWikiLinks(content: string) {
  return [...content.matchAll(/\[\[([^\]]+)\]\]/gu)].map((match) => match[1].trim());
}
