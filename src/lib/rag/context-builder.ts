import type { BuiltContext, RagChunk } from "./rag.types";

const TOTAL_CONTEXT_BUDGET = 12000;
const PER_DOCUMENT_BUDGET = 2200;

export function buildRagContext(chunks: RagChunk[]): BuiltContext {
  const grouped = groupChunksByDocument(dedupeChunks(chunks));
  let used = 0;
  const contexts: string[] = [];
  const sources = [];

  for (const [index, group] of grouped.entries()) {
    if (used >= TOTAL_CONTEXT_BUDGET) break;

    const remaining = TOTAL_CONTEXT_BUDGET - used;
    const content = group.chunks
      .map((chunk) => chunk.content)
      .join("\n\n")
      .slice(0, Math.min(PER_DOCUMENT_BUDGET, remaining))
      .trim();

    if (!content) continue;

    const context = [
      `[Context ${index + 1}]`,
      `문서 제목: ${group.title}`,
      `문서 경로: ${group.path}`,
      `관련도: ${group.relevance.toFixed(2)}`,
      `수정일: ${group.updated || "알 수 없음"}`,
      "내용:",
      content
    ].join("\n");

    contexts.push(context);
    used += context.length;
    sources.push({
      title: group.title,
      path: group.path,
      relevance: group.relevance,
      updated: group.updated,
      preview: content.slice(0, 420)
    });
  }

  return {
    contextText: contexts.join("\n\n"),
    sources
  };
}

function dedupeChunks(chunks: RagChunk[]) {
  const seen = new Set<string>();
  const result: RagChunk[] = [];

  for (const chunk of chunks) {
    const key = `${chunk.path}:${chunk.content.slice(0, 160)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(chunk);
  }

  return result;
}

function groupChunksByDocument(chunks: RagChunk[]) {
  const groups = new Map<
    string,
    {
      title: string;
      path: string;
      updated: string | null;
      relevance: number;
      chunks: RagChunk[];
    }
  >();

  for (const chunk of chunks) {
    const existing = groups.get(chunk.path);

    if (!existing) {
      groups.set(chunk.path, {
        title: chunk.title,
        path: chunk.path,
        updated: chunk.updated,
        relevance: chunk.relevance,
        chunks: [chunk]
      });
      continue;
    }

    existing.relevance = Math.max(existing.relevance, chunk.relevance);
    existing.chunks.push(chunk);
  }

  return [...groups.values()].sort((a, b) => b.relevance - a.relevance);
}
