import fs from "node:fs/promises";
import path from "node:path";
import { getSecondBrainRoot, loadMarkdownDocuments } from "@/src/lib/rag/document-loader";
import { hybridSearchResults } from "@/src/lib/search/search.service";
import type { LocalDocument } from "@/src/lib/rag/rag.types";
import { externalConnectionTargets } from "./external-actions";
import type { SuggestedConnection } from "./connections.types";

export async function suggestConnectionsForQuery(query: string): Promise<SuggestedConnection[]> {
  const results = await hybridSearchResults(query, 10);
  const localSuggestions = results
    .filter((result) => result.matchedBy !== "recent")
    .slice(0, 6)
    .map((result, index) => ({
      sourceId: "query",
      targetId: result.documentId,
      targetTitle: result.title,
      targetPath: result.path,
      reason: `${result.matchedBy} 검색 점수와 현재 질문의 문맥이 유사합니다.`,
      strength: Number(Math.max(0.25, result.score - index * 0.02).toFixed(2)),
      relationType: result.matchedBy === "tag" ? "tag_relation" : "semantic_relation",
      targetType: "document" as const,
      status: "suggested" as const
    }));

  return [...localSuggestions, ...suggestExternalConnections(query)].slice(0, 8);
}

export async function suggestConnectionsForDocument(documentId: string) {
  const documents = await loadMarkdownDocuments();
  const source = documents.find((document) => document.relativePath === documentId);
  if (!source) return [];

  return documents
    .filter((document) => document.relativePath !== source.relativePath)
    .map((target) => ({
      target,
      strength: calculateConnectionStrength(source, target),
      reason: explainConnectionReason(source, target)
    }))
    .filter((item) => item.strength > 0.2)
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 8)
    .map((item) => ({
      sourceId: source.relativePath,
      targetId: item.target.relativePath,
      targetTitle: item.target.title,
      targetPath: item.target.relativePath,
      reason: item.reason,
      strength: item.strength,
      relationType: relationTypeForReason(item.reason),
      targetType: "document" as const,
      status: "suggested" as const
    }));
}

export async function suggestConnectionsForChat(sessionId: string) {
  return suggestConnectionsForQuery(sessionId);
}

export function calculateConnectionStrength(source: LocalDocument, target: LocalDocument) {
  let score = 0;
  const sourceFolder = source.relativePath.split("/")[0];
  const targetFolder = target.relativePath.split("/")[0];
  const sharedTags = source.tags.filter((tag) => target.tags.includes(tag));
  const sourceLinks = extractWikiLinks(source.content);

  if (sourceFolder && sourceFolder === targetFolder) score += 0.28;
  score += Math.min(0.36, sharedTags.length * 0.12);
  if (sourceLinks.some((link) => target.title.includes(link) || target.relativePath.includes(link))) {
    score += 0.28;
  }
  score += semanticOverlap(source.content, target.content) * 0.28;

  return Number(Math.min(0.99, score).toFixed(2));
}

export function explainConnectionReason(source: LocalDocument, target: LocalDocument) {
  const sharedTags = source.tags.filter((tag) => target.tags.includes(tag));
  const sourceFolder = source.relativePath.split("/")[0];
  const targetFolder = target.relativePath.split("/")[0];
  const sourceLinks = extractWikiLinks(source.content);

  if (sourceLinks.some((link) => target.title.includes(link) || target.relativePath.includes(link))) {
    return "문서 안의 명시적 내부 링크와 연결됩니다.";
  }
  if (sharedTags.length > 0) {
    return `공통 태그 ${sharedTags.slice(0, 3).join(", ")}로 연결됩니다.`;
  }
  if (sourceFolder && sourceFolder === targetFolder) {
    return `같은 폴더 ${sourceFolder} 안의 문서입니다.`;
  }
  return "본문 키워드가 의미적으로 유사합니다.";
}

export async function buildConnectionAcceptancePlan(input: {
  sourcePath: string;
  targetPath: string;
}) {
  const root = getSecondBrainRoot();
  const sourceFullPath = path.join(root, input.sourcePath);
  const targetTitle = path.basename(input.targetPath, ".md");
  const raw = await fs.readFile(sourceFullPath, "utf8");
  const updated = addRelatedLink(raw, targetTitle);

  return {
    sourcePath: input.sourcePath,
    targetPath: input.targetPath,
    targetLink: `[[${targetTitle}]]`,
    changed: raw !== updated,
    before: raw,
    after: updated
  };
}

export async function applyAcceptedConnection(input: {
  sourcePath: string;
  targetPath: string;
}) {
  const root = getSecondBrainRoot();
  const sourceFullPath = path.join(root, input.sourcePath);
  const plan = await buildConnectionAcceptancePlan(input);

  if (!plan.changed) return { applied: false, plan };

  const backupName = `${sourceFullPath}.backup.${timestamp()}.md`;
  await fs.copyFile(sourceFullPath, backupName);
  await fs.writeFile(sourceFullPath, plan.after, "utf8");
  return { applied: true, backupPath: backupName, plan };
}

function addRelatedLink(raw: string, targetTitle: string) {
  const link = `  - "[[${targetTitle}]]"`;
  if (raw.includes(`[[${targetTitle}]]`)) return raw;

  const frontmatterEnd = raw.startsWith("---") ? raw.indexOf("\n---", 3) : -1;
  if (frontmatterEnd > -1) {
    const head = raw.slice(0, frontmatterEnd);
    const tail = raw.slice(frontmatterEnd);

    if (head.includes("\nrelated:")) {
      return `${head.replace(/(\nrelated:\n(?:\s+- .+\n?)*)/u, `$1${link}\n`)}${tail}`;
    }

    return `${head}\nrelated:\n${link}${tail}`;
  }

  return raw.replace(
    /## 연결된 문서\s*\n/u,
    `## 연결된 문서\n- [[${targetTitle}]]\n`
  );
}

function relationTypeForReason(reason: string) {
  if (reason.includes("태그")) return "tag_relation";
  if (reason.includes("폴더")) return "folder_relation";
  if (reason.includes("내부 링크")) return "explicit_link";
  return "semantic_relation";
}

function suggestExternalConnections(query: string): SuggestedConnection[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];

  const suggestions: SuggestedConnection[] = [];

  for (const target of externalConnectionTargets) {
    const label = target.label.toLowerCase();
    const description = target.description.toLowerCase();
    const directMatch = terms.some(
      (term) =>
        label.includes(term) ||
        target.id.includes(term) ||
        description.includes(term) ||
        target.commandPrefix.toLowerCase().includes(term)
    );

    if (directMatch) {
      suggestions.push({
        sourceId: "query",
        targetId: target.id,
        targetTitle: target.label,
        targetPath: target.url,
        reason: directMatch
          ? `${target.label} matches this context and can be added as an app connection.`
          : target.description,
        strength: directMatch ? 0.86 : 0.54,
        relationType: "external_connection",
        targetType: target.targetType,
        externalTargetId: target.id,
        status: "suggested" as const
      });
    }
  }

  return suggestions.sort((a, b) => b.strength - a.strength).slice(0, 4);
}

function extractWikiLinks(content: string) {
  return [...content.matchAll(/\[\[([^\]]+)\]\]/gu)].map((match) => match[1]);
}

function semanticOverlap(a: string, b: string) {
  const aTerms = new Set(tokenize(a));
  const bTerms = new Set(tokenize(b));
  const overlap = [...aTerms].filter((term) => bTerms.has(term)).length;
  return Math.min(1, overlap / Math.max(8, aTerms.size));
}

function tokenize(text: string) {
  return text.toLowerCase().match(/[가-힣a-z0-9_]{2,}/giu) || [];
}

function timestamp() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours()
  )}${pad(now.getMinutes())}`;
}
