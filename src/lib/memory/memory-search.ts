import { listFileRecords } from "@/src/lib/files/file.repository";
import { listKnowledgeNotes } from "@/src/lib/knowledge/knowledge.repository";
import { tokenize } from "@/src/lib/memory/memory-embedding";
import { readMemoryDb } from "@/src/lib/memory/memory-repository";
import type {
  DeepThinkSearchResponse,
  MemorySearchResult,
  QuickMemorySearchResponse
} from "@/src/lib/memory/memory.types";

type SearchDocument = {
  id: string;
  title: string;
  body: string;
  sourceType: MemorySearchResult["sourceType"];
  path?: string;
  projectId: string | null;
  createdAt: string;
};

export async function quickMemorySearch(
  query: string,
  options: { ownerId?: string; projectId?: string | null; limit?: number } = {}
): Promise<QuickMemorySearchResponse> {
  const documents = options.ownerId
    ? await loadSearchDocuments(options.ownerId, options.projectId)
    : [];
  const queryTokens = tokenize(query);
  const results = documents
    .map((document) => toSearchResult(document, queryTokens))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, options.limit || 12);
  return { query, results };
}

export async function deepThinkSearch(
  query: string,
  options: { ownerId?: string; projectId?: string | null; limit?: number } = {}
): Promise<DeepThinkSearchResponse> {
  const quick = await quickMemorySearch(query, {
    ownerId: options.ownerId,
    projectId: options.projectId,
    limit: options.limit || 8
  });
  const documents = options.ownerId
    ? await loadSearchDocuments(options.ownerId, options.projectId)
    : [];
  const selected = quick.results
    .map((result) => documents.find((document) => document.id === result.sourceId))
    .filter((document): document is SearchDocument => Boolean(document));
  const evidence = selected.map((document) => `${document.title}: ${makeSnippet(document.body, tokenize(query))}`);
  const missingInformation = buildMissingInformation(query, selected);
  const contradictions = findContradictions(selected);
  return {
    query,
    summary: selected.length
      ? `${selected.length}개 로컬 자료를 근거로 요약했습니다: ${selected
          .slice(0, 3)
          .map((document) => document.title)
          .join(", ")}.`
      : "검색된 로컬 자료가 없습니다. 웹 검색 또는 파일 추가가 필요합니다.",
    sources: selected.map((document) => ({
      id: document.id,
      title: document.title,
      path: document.path
    })),
    evidence,
    missingInformation,
    contradictions,
    nextInformationNeeded:
      missingInformation.length > 0
        ? missingInformation
        : ["최신 외부 자료가 필요한 질문이면 웹 검색 결과를 Memory Candidate로 검토하세요."]
  };
}

async function loadSearchDocuments(
  ownerId: string,
  projectId?: string | null
): Promise<SearchDocument[]> {
  const [db, notes, files] = await Promise.all([
    readMemoryDb(),
    listKnowledgeNotes(ownerId, projectId),
    listFileRecords(ownerId, projectId)
  ]);
  const memories = db.memories.filter(
    (memory) =>
      (memory as typeof memory & { ownerId?: string }).ownerId === ownerId &&
      memory.status === "approved" &&
      (projectId === undefined || memory.projectId === projectId)
  );
  return [
    ...memories.map((memory) => ({
      id: `memory:${memory.id}`,
      title: memory.title,
      body: memory.content,
      sourceType: "memory" as const,
      sourceId: memory.id,
      path: memory.markdownPath,
      projectId: memory.projectId,
      createdAt: memory.approvedAt
    })),
    ...notes.map((note) => ({
      id: `knowledge:${note.id}`,
      title: note.title,
      body: note.body,
      sourceType: "knowledge" as const,
      path: undefined,
      projectId: note.projectId,
      createdAt: note.createdAt
    })),
    ...files.map((file) => ({
      id: `file:${file.id}`,
      title: file.name,
      body: file.textPreview,
      sourceType: "file" as const,
      path: undefined,
      projectId: file.projectId,
      createdAt: file.createdAt
    }))
  ];
}

function toSearchResult(document: SearchDocument, queryTokens: string[]): MemorySearchResult {
  const textTokens = tokenize(`${document.title} ${document.body}`);
  const overlap = queryTokens.filter((token) => textTokens.includes(token)).length;
  const freshness = Math.max(0, 1 - (Date.now() - new Date(document.createdAt).getTime()) / 86_400_000 / 90);
  const score = queryTokens.length === 0 ? 0 : overlap / queryTokens.length + freshness * 0.08;
  return {
    id: document.id,
    title: document.title,
    snippet: makeSnippet(document.body, queryTokens),
    score: Number(score.toFixed(4)),
    sourceType: document.sourceType,
    sourceId: document.id.replace(/^[^:]+:/u, ""),
    path: document.path,
    projectId: document.projectId
  };
}

function makeSnippet(text: string, queryTokens: string[]) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const lower = normalized.toLowerCase();
  const hit = queryTokens.find((token) => lower.includes(token));
  const start = hit ? Math.max(0, lower.indexOf(hit) - 80) : 0;
  return normalized.slice(start, start + 220);
}

function buildMissingInformation(query: string, documents: SearchDocument[]) {
  const missing: string[] = [];
  if (documents.length === 0) {
    missing.push("로컬 Memory, Knowledge, File에서 근거를 찾지 못했습니다.");
  }
  if (/(latest|최근|오늘|현재|가격|뉴스|법|정책)/iu.test(query)) {
    missing.push("시간에 따라 바뀌는 정보이므로 웹 검색 근거가 필요합니다.");
  }
  if (!documents.some((document) => /출처|source|http|https/iu.test(document.body))) {
    missing.push("명시적인 출처 링크가 부족합니다.");
  }
  return missing;
}

function findContradictions(documents: SearchDocument[]) {
  const contradictions: string[] = [];
  for (const document of documents) {
    if (/(하지 않는다|사용하지 않는다|do not|disable)/iu.test(document.body) && /(사용한다|enable|connect|연결)/iu.test(document.body)) {
      contradictions.push(`${document.title} 안에 실행/비실행 표현이 함께 있습니다.`);
    }
  }
  return contradictions;
}
