import { readJsonStore, writeJsonStore } from "../local-db/json-store";
import type {
  ApprovedMemory,
  EmbeddingRecord,
  MemoryCandidate,
  MemoryChangePreview
} from "@/src/lib/memory/memory.types";

export type MemoryDb = {
  candidates: MemoryCandidate[];
  memories: ApprovedMemory[];
  embeddings: EmbeddingRecord[];
  changes: MemoryChangePreview[];
};

const EMPTY_DB: MemoryDb = {
  candidates: [],
  memories: [],
  embeddings: [],
  changes: []
};

export async function readMemoryDb(): Promise<MemoryDb> {
  const db = await readJsonStore<MemoryDb>("memory.json", EMPTY_DB);
  return {
    candidates: Array.isArray(db.candidates) ? db.candidates : [],
    memories: Array.isArray(db.memories) ? db.memories : [],
    embeddings: Array.isArray(db.embeddings) ? db.embeddings : [],
    changes: Array.isArray(db.changes) ? db.changes : []
  };
}

export function writeMemoryDb(db: MemoryDb) {
  return writeJsonStore("memory.json", db);
}

export async function upsertMemoryCandidate(candidate: MemoryCandidate) {
  const db = await readMemoryDb();
  const index = db.candidates.findIndex((item) => item.id === candidate.id);
  if (index >= 0) db.candidates[index] = candidate;
  else db.candidates.unshift(candidate);
  await writeMemoryDb(db);
  return candidate;
}

export async function addApprovedMemory(memory: ApprovedMemory, embedding: EmbeddingRecord) {
  const db = await readMemoryDb();
  db.memories.unshift(memory);
  db.embeddings.unshift(embedding);
  db.candidates = db.candidates.map((candidate) =>
    candidate.id === memory.id ? { ...candidate, status: "approved", updatedAt: memory.updatedAt } : candidate
  );
  await writeMemoryDb(db);
  return memory;
}

export async function upsertApprovedMemory(memory: ApprovedMemory, embedding: EmbeddingRecord) {
  const db = await readMemoryDb();
  db.memories = [memory, ...db.memories.filter((item) => item.id !== memory.id)];
  db.embeddings = [embedding, ...db.embeddings.filter((item) => item.memoryId !== memory.id)];
  db.candidates = db.candidates.map((candidate) =>
    candidate.id === memory.id ? { ...candidate, status: "approved", updatedAt: memory.updatedAt } : candidate
  );
  await writeMemoryDb(db);
  return memory;
}

export async function saveMemoryChangePreview(preview: MemoryChangePreview) {
  const db = await readMemoryDb();
  const index = db.changes.findIndex((item) => item.id === preview.id);
  if (index >= 0) db.changes[index] = preview;
  else db.changes.unshift(preview);
  await writeMemoryDb(db);
  return preview;
}
