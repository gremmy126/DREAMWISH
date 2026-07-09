import { loadMarkdownDocuments } from "@/src/lib/rag/document-loader";
import { checkAIReadability } from "./ai-readability-checker";
import { detectDuplicates } from "./duplicate-detector";
import type { DocumentQualityReport } from "./document-quality.types";
import { checkLinks } from "./link-quality-checker";
import { checkMetadata } from "./metadata-checker";
import { detectOrphans } from "./orphan-detector";

export async function checkDocumentQuality(query?: string): Promise<DocumentQualityReport> {
  const documents = await loadMarkdownDocuments();
  const filtered = filterDocuments(documents, query);
  const issues = [
    ...filtered.flatMap((document) => checkMetadata(document)),
    ...filtered.flatMap((document) => checkLinks(document, documents)),
    ...filtered.flatMap((document) => checkAIReadability(document)),
    ...detectOrphans(filtered),
    ...detectDuplicates(filtered)
  ];

  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;

  return {
    checkedAt: new Date().toISOString(),
    totalDocuments: filtered.length,
    issues,
    summary: `문서 ${filtered.length}개 검사, 오류 ${errors}개, 경고 ${warnings}개`
  };
}

export function isQualityCommand(message: string) {
  return /품질검사|고립.*문서|링크.*부족|중복.*문서|frontmatter|읽기 어렵/u.test(message);
}

export function formatQualityReport(report: DocumentQualityReport) {
  if (report.issues.length === 0) {
    return `${report.summary}\n\n문서 품질 문제가 발견되지 않았습니다.`;
  }

  const lines = report.issues.slice(0, 20).map((issue) => {
    return `- [${issue.severity}] ${issue.path}: ${issue.message}`;
  });

  return [
    report.summary,
    "",
    "검사 결과",
    ...lines,
    report.issues.length > 20 ? `- 외 ${report.issues.length - 20}개 이슈` : "",
    "",
    "파일 수정은 사용자 승인 전에는 적용하지 않습니다."
  ]
    .filter(Boolean)
    .join("\n");
}

function filterDocuments(documents: Awaited<ReturnType<typeof loadMarkdownDocuments>>, query?: string) {
  const normalized = query?.trim().toLowerCase();
  if (!normalized) return documents;

  const fileName = normalized.match(/[a-z0-9_-]+\.md/iu)?.[0];
  if (fileName) {
    return documents.filter((document) => document.relativePath.toLowerCase().endsWith(fileName));
  }

  return documents;
}
