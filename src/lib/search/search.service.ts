import { chunkDocuments, loadMarkdownDocuments } from "@/src/lib/rag/document-loader";
import type { LocalDocument, RagChunk } from "@/src/lib/rag/rag.types";
import type { SearchMatchType, SearchResult } from "./search.types";

export async function keywordSearch(query: string, limit = 10) {
  const terms = tokenize(query);
  const chunks = chunkDocuments(await loadMarkdownDocuments());

  return chunksToResults(
    chunks
      .map((chunk) => ({
        chunk,
        score: terms.reduce((sum, term) => sum + countMatches(chunk, term), 0)
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => ({ ...item.chunk, relevance: normalize(item.score, 10) })),
    "keyword",
    limit
  );
}

export async function vectorSearch(query: string, limit = 10) {
  const queryVector = termVector(tokenize(query));
  const chunks = chunkDocuments(await loadMarkdownDocuments());

  return chunksToResults(
    chunks
      .map((chunk) => ({
        chunk,
        score: cosineSimilarity(queryVector, termVector(tokenize(chunk.content)))
      }))
      .filter((item) => item.score > 0.08)
      .sort((a, b) => b.score - a.score)
      .map((item) => ({ ...item.chunk, relevance: Number(item.score.toFixed(2)) })),
    "vector",
    limit
  );
}

export async function tagSearch(query: string, limit = 10) {
  const terms = tokenize(query);
  const documents = await loadMarkdownDocuments();

  return documentsToResults(
    documents
      .map((document) => ({
        document,
        score: document.tags.filter((tag) =>
          terms.some((term) => tag.toLowerCase().includes(term))
        ).length
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => ({ document: item.document, score: normalize(item.score, 5) })),
    "tag",
    limit
  );
}

export async function pathSearch(query: string, limit = 10) {
  const terms = tokenize(query);
  const documents = await loadMarkdownDocuments();

  return documentsToResults(
    documents
      .map((document) => ({
        document,
        score: terms.filter((term) => document.relativePath.toLowerCase().includes(term)).length
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => ({ document: item.document, score: normalize(item.score, 5) })),
    "path",
    limit
  );
}

export async function recentSearch(_query: string, limit = 10) {
  const documents = await loadMarkdownDocuments();

  return documentsToResults(
    documents
      .filter((document) => document.updated)
      .sort((a, b) => (b.updated || "").localeCompare(a.updated || ""))
      .map((document, index) => ({
        document,
        score: Number(Math.max(0.1, 0.95 - index * 0.04).toFixed(2))
      })),
    "recent",
    limit
  );
}

export async function exactTitleSearch(query: string, limit = 10) {
  const normalizedQuery = query.trim().toLowerCase();
  const documents = await loadMarkdownDocuments();

  return documentsToResults(
    documents
      .map((document) => {
        const title = document.title.toLowerCase();
        const score =
          title === normalizedQuery
            ? 1
            : title.includes(normalizedQuery)
              ? 0.82
              : normalizedQuery.includes(title)
                ? 0.62
                : 0;
        return { document, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score),
    "title",
    limit
  );
}

export async function hybridSearchResults(query: string, limit = 12) {
  const groups = await Promise.all([
    exactTitleSearch(query, limit),
    keywordSearch(query, limit),
    vectorSearch(query, limit),
    tagSearch(query, limit),
    pathSearch(query, limit),
    recentSearch(query, Math.max(3, Math.floor(limit / 3)))
  ]);

  const ranked = new Map<string, SearchResult>();

  for (const result of groups.flat()) {
    const existing = ranked.get(result.documentId);
    if (!existing || result.score > existing.score) {
      ranked.set(result.documentId, result);
    }
  }

  return [...ranked.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

function chunksToResults(
  chunks: RagChunk[],
  matchedBy: SearchMatchType,
  limit: number
): SearchResult[] {
  return chunks.slice(0, limit).map((chunk) => ({
    documentId: chunk.path,
    title: chunk.title,
    path: chunk.path,
    snippet: makeSnippet(chunk.content),
    score: chunk.relevance,
    matchedBy,
    sourceType: "local",
    updatedAt: chunk.updated || ""
  }));
}

function documentsToResults(
  items: Array<{ document: LocalDocument; score: number }>,
  matchedBy: SearchMatchType,
  limit: number
): SearchResult[] {
  return items.slice(0, limit).map(({ document, score }) => ({
    documentId: document.relativePath,
    title: document.title,
    path: document.relativePath,
    snippet: makeSnippet(document.content),
    score,
    matchedBy,
    sourceType: "local",
    updatedAt: document.updated || ""
  }));
}

function tokenize(text: string) {
  return Array.from(new Set(text.toLowerCase().match(/[가-힣a-z0-9_]{2,}/giu) || []));
}

function countMatches(chunk: RagChunk, term: string) {
  const haystack = `${chunk.title} ${chunk.path} ${chunk.content}`.toLowerCase();
  return haystack.match(new RegExp(escapeRegExp(term), "gu"))?.length || 0;
}

function termVector(terms: string[]) {
  const vector = new Map<string, number>();
  for (const term of terms) vector.set(term, (vector.get(term) || 0) + 1);
  return vector;
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>) {
  let dot = 0;
  let aMag = 0;
  let bMag = 0;

  for (const value of a.values()) aMag += value * value;
  for (const value of b.values()) bMag += value * value;
  for (const [term, value] of a.entries()) dot += value * (b.get(term) || 0);

  if (!aMag || !bMag) return 0;
  return dot / (Math.sqrt(aMag) * Math.sqrt(bMag));
}

function normalize(value: number, max: number) {
  return Number(Math.min(0.99, value / max).toFixed(2));
}

function makeSnippet(content: string) {
  return content.replace(/\s+/g, " ").trim().slice(0, 360);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
