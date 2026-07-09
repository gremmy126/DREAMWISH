import { chunkDocuments, loadMarkdownDocuments } from "./document-loader";
import type { RagChunk } from "./rag.types";

export async function hybridSearch(query: string, limit = 8): Promise<RagChunk[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return [];

  const tokens = tokenize(trimmedQuery);
  const documents = await loadMarkdownDocuments();
  const chunks = chunkDocuments(documents);

  return chunks
    .map((chunk) => ({
      ...chunk,
      relevance: scoreChunk(chunk, tokens, trimmedQuery)
    }))
    .filter((chunk) => chunk.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, limit);
}

function tokenize(text: string) {
  const tokens = text
    .toLowerCase()
    .match(/[가-힣a-z0-9_]{2,}/giu);

  return Array.from(new Set(tokens || [text.toLowerCase()]));
}

function scoreChunk(chunk: RagChunk, tokens: string[], rawQuery: string) {
  const haystack = `${chunk.title}\n${chunk.path}\n${chunk.content}`.toLowerCase();
  const title = chunk.title.toLowerCase();
  const path = chunk.path.toLowerCase();
  const exactQuery = rawQuery.toLowerCase();
  let score = 0;

  if (haystack.includes(exactQuery)) score += 0.45;

  for (const token of tokens) {
    const escaped = escapeRegExp(token);
    const matches = haystack.match(new RegExp(escaped, "gu"))?.length || 0;
    if (matches > 0) score += Math.min(0.35, matches * 0.08);
    if (title.includes(token)) score += 0.22;
    if (path.includes(token)) score += 0.12;
  }

  const normalized = score / Math.max(1, Math.sqrt(tokens.length));
  return Number(Math.min(0.99, normalized).toFixed(2));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
