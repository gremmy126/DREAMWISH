import type { SourceDocument } from "../chat/chat.types";
import { createLocalVector, tokenize } from "./memory-embedding";
import { readMemoryDb } from "./memory-repository";
import type { ApprovedMemory } from "./memory.types";

const MAX_MEMORIES = 6;
const MIN_SCORE = 0.25;
const MAX_CONTEXT_CHARACTERS = 2400;

export type ApprovedMemoryContext = {
  status: "used" | "empty" | "degraded";
  contextText: string;
  memories: Array<{ id: string; score: number; title: string }>;
  sources: SourceDocument[];
};

export async function buildApprovedMemoryContext(
  ownerId: string,
  query: string
): Promise<ApprovedMemoryContext> {
  const normalizedOwnerId = ownerId.trim();
  const normalizedQuery = query.trim();
  if (!normalizedOwnerId || !normalizedQuery) return emptyContext();

  const db = await readMemoryDb();
  const queryTokens = tokenize(normalizedQuery);
  const queryVector = createLocalVector(normalizedQuery);
  const ranked = db.memories
    .filter(
      (memory) => memory.ownerId === normalizedOwnerId && memory.status === "approved"
    )
    .map((memory) => ({ memory, score: scoreMemory(memory, queryTokens, queryVector) }))
    .filter((item) => item.score >= MIN_SCORE)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_MEMORIES);

  if (ranked.length === 0) return emptyContext();

  const selected: typeof ranked = [];
  const blocks: string[] = [];
  let usedCharacters = 0;
  for (const item of ranked) {
    const block = `[memory:${item.memory.id}] ${item.memory.title}\n${item.memory.content}`;
    const remaining = MAX_CONTEXT_CHARACTERS - usedCharacters;
    if (remaining <= 0) break;
    const boundedBlock = block.slice(0, remaining);
    if (!boundedBlock.trim()) continue;
    blocks.push(boundedBlock);
    selected.push(item);
    usedCharacters += boundedBlock.length + (blocks.length > 1 ? 2 : 0);
  }

  return {
    status: selected.length > 0 ? "used" : "empty",
    contextText: blocks.join("\n\n").slice(0, MAX_CONTEXT_CHARACTERS),
    memories: selected.map(({ memory, score }) => ({
      id: memory.id,
      score,
      title: memory.title
    })),
    sources: selected.map(({ memory, score }) => ({
      title: memory.title,
      path: `memory://${memory.id}`,
      relevance: score,
      updated: memory.updatedAt || memory.approvedAt,
      preview: memory.preview || memory.content.slice(0, 180)
    }))
  };
}

function scoreMemory(
  memory: ApprovedMemory,
  queryTokens: string[],
  queryVector: number[]
) {
  const memoryText = [
    memory.title,
    memory.content,
    ...(memory.tags || []),
    ...(memory.relatedConcepts || [])
  ].join(" ");
  const memoryTokens = new Set(tokenize(memoryText));
  const overlap = queryTokens.length
    ? queryTokens.filter((token) => memoryTokens.has(token)).length / queryTokens.length
    : 0;
  const vectorScore = cosineSimilarity(queryVector, createLocalVector(memoryText));
  const recencyScore = Math.max(
    0,
    1 - (Date.now() - new Date(memory.updatedAt || memory.approvedAt).getTime()) / 86_400_000 / 180
  );
  const score = overlap * 0.5 + vectorScore * 0.25 + memory.importance * 0.15 + recencyScore * 0.1;
  return Number(Math.min(1, score).toFixed(4));
}

function cosineSimilarity(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }
  if (!leftMagnitude || !rightMagnitude) return 0;
  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function emptyContext(): ApprovedMemoryContext {
  return { status: "empty", contextText: "", memories: [], sources: [] };
}
