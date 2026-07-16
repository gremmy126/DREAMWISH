import {
  readJsonStore,
  withJsonStoreLock,
  writeJsonStore
} from "../local-db/json-store";
import {
  listLatestOwnerDocuments,
  mutateOwnerDocument,
  readOwnerDocument
} from "../db/owner-document-store";
import { hasPostgresStorage } from "../db/postgres";
import type {
  ApprovedMemory,
  EmbeddingRecord,
  MemoryCaptureJob,
  MemoryCandidate,
  MemoryChangePreview
} from "./memory.types";

export type MemoryDb = {
  candidates: MemoryCandidate[];
  memories: ApprovedMemory[];
  quarantinedMemories: unknown[];
  embeddings: EmbeddingRecord[];
  changes: MemoryChangePreview[];
  captureJobs: MemoryCaptureJob[];
};

const EMPTY_DB: MemoryDb = {
  candidates: [],
  memories: [],
  quarantinedMemories: [],
  embeddings: [],
  changes: [],
  captureJobs: []
};

const MEMORY_NAMESPACE = "memory-state";

export async function readMemoryDb(ownerId?: string): Promise<MemoryDb> {
  if (hasPostgresStorage()) {
    if (ownerId) {
      return normalizeMemoryDb(
        await readOwnerDocument(ownerId, MEMORY_NAMESPACE, EMPTY_DB)
      );
    }
    const documents = await listLatestOwnerDocuments<MemoryDb>(MEMORY_NAMESPACE);
    return normalizeMemoryDb(
      documents.reduce<MemoryDb>((merged, document) => {
        const current = normalizeMemoryDb(document.payload);
        merged.candidates.push(...current.candidates);
        merged.memories.push(...current.memories);
        merged.quarantinedMemories.push(...current.quarantinedMemories);
        merged.embeddings.push(...current.embeddings);
        merged.changes.push(...current.changes);
        merged.captureJobs.push(...current.captureJobs);
        return merged;
      }, cloneEmptyDb())
    );
  }

  return normalizeMemoryDb(
    await readJsonStore<MemoryDb>("memory.json", EMPTY_DB)
  );
}

function normalizeMemoryDb(db: Partial<MemoryDb>): MemoryDb {
  const normalizedMemories: ApprovedMemory[] = [];
  const newlyQuarantined: unknown[] = [];
  if (Array.isArray(db.memories)) {
    for (const rawMemory of db.memories as unknown[]) {
      const memory = normalizeApprovedMemory(rawMemory);
      if (memory) normalizedMemories.push(memory);
      else newlyQuarantined.push(rawMemory);
    }
  }
  return {
    candidates: Array.isArray(db.candidates) ? db.candidates.map(normalizeCandidate) : [],
    memories: normalizedMemories,
    quarantinedMemories: deduplicateJsonValues([
      ...(Array.isArray(db.quarantinedMemories) ? db.quarantinedMemories : []),
      ...newlyQuarantined
    ]),
    embeddings: Array.isArray(db.embeddings) ? [...db.embeddings] : [],
    changes: Array.isArray(db.changes) ? db.changes.map(normalizeChangePreview) : [],
    captureJobs: Array.isArray(db.captureJobs) ? db.captureJobs.map(normalizeCaptureJob) : []
  };
}

function cloneEmptyDb(): MemoryDb {
  return structuredClone(EMPTY_DB);
}

function normalizeCandidate(candidate: MemoryCandidate): MemoryCandidate {
  return {
    ...candidate,
    sourceSessionId: normalizeNullableString(candidate.sourceSessionId),
    sourceMessageIds: normalizeStringArray(candidate.sourceMessageIds),
    version: normalizeVersion(candidate.version)
  };
}

function normalizeApprovedMemory(rawMemory: unknown): ApprovedMemory | null {
  if (!isRecord(rawMemory)) return null;
  if (rawMemory.status !== "approved" && rawMemory.status !== "forgotten") return null;
  const memory = rawMemory as ApprovedMemory;
  return {
    ...memory,
    sourceSessionId: normalizeNullableString(memory.sourceSessionId),
    sourceMessageIds: normalizeStringArray(memory.sourceMessageIds),
    version: normalizeVersion(memory.version),
    status: memory.status
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deduplicateJsonValues(values: unknown[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = JSON.stringify(value);
    if (key === undefined || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeChangePreview(preview: MemoryChangePreview): MemoryChangePreview {
  return { ...preview, version: normalizeVersion(preview.version) };
}

function normalizeCaptureJob(job: MemoryCaptureJob): MemoryCaptureJob {
  return {
    ...job,
    sourceSessionId:
      typeof job.sourceSessionId === "string" ? job.sourceSessionId : "",
    sourceMessageIds: normalizeStringArray(job.sourceMessageIds),
    attempts:
      Number.isInteger(job.attempts) && job.attempts >= 0 ? job.attempts : 0,
    lastErrorCode:
      typeof job.lastErrorCode === "string" ? job.lastErrorCode : null
  };
}

function normalizeVersion(value: number) {
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function normalizeNullableString(value: string | null) {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeStringArray(value: string[]) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function writeMemoryDb(db: MemoryDb) {
  return writeJsonStore("memory.json", db);
}

export async function mutateMemoryDb<T>(
  mutate: (db: MemoryDb) => T | Promise<T>,
  ownerId?: string
): Promise<T> {
  if (hasPostgresStorage()) {
    if (!ownerId?.trim()) {
      throw new Error("ownerId is required for durable memory mutations.");
    }
    return mutateOwnerDocument(
      ownerId,
      MEMORY_NAMESPACE,
      cloneEmptyDb(),
      async (stored) => {
        const db = normalizeMemoryDb(stored);
        const result = await mutate(db);
        Object.assign(stored, db);
        return result;
      }
    );
  }

  return withJsonStoreLock("memory.json", async () => {
    const db = await readMemoryDb();
    const result = await mutate(db);
    await writeMemoryDb(db);
    return result;
  });
}

export async function upsertMemoryCandidate(candidate: MemoryCandidate) {
  return mutateMemoryDb((db) => {
    const index = db.candidates.findIndex(
      (item) => item.id === candidate.id && item.ownerId === candidate.ownerId
    );
    if (index >= 0) db.candidates[index] = candidate;
    else db.candidates.unshift(candidate);
    return candidate;
  }, candidate.ownerId);
}

export async function upsertMemoryCaptureJob(job: MemoryCaptureJob) {
  return mutateMemoryDb((db) => {
    const index = db.captureJobs.findIndex(
      (item) => item.id === job.id && item.ownerId === job.ownerId
    );
    if (index >= 0) db.captureJobs[index] = job;
    else db.captureJobs.unshift(job);
    return job;
  }, job.ownerId);
}

export async function addApprovedMemory(memory: ApprovedMemory, embedding: EmbeddingRecord) {
  return mutateMemoryDb((db) => {
    db.memories = [
      memory,
      ...db.memories.filter(
        (item) => item.id !== memory.id || item.ownerId !== memory.ownerId
      )
    ];
    db.embeddings = [
      embedding,
      ...db.embeddings.filter(
        (item) => item.memoryId !== memory.id || item.ownerId !== memory.ownerId
      )
    ];
    db.candidates = db.candidates.map((candidate) =>
      candidate.id === memory.id && candidate.ownerId === memory.ownerId ? memory : candidate
    );
    return memory;
  }, memory.ownerId);
}

export async function upsertApprovedMemory(memory: ApprovedMemory, embedding: EmbeddingRecord) {
  return mutateMemoryDb((db) => {
    db.memories = [
      memory,
      ...db.memories.filter(
        (item) => item.id !== memory.id || item.ownerId !== memory.ownerId
      )
    ];
    db.embeddings = [
      embedding,
      ...db.embeddings.filter(
        (item) => item.memoryId !== memory.id || item.ownerId !== memory.ownerId
      )
    ];
    db.candidates = db.candidates.map((candidate) =>
      candidate.id === memory.id && candidate.ownerId === memory.ownerId ? memory : candidate
    );
    return memory;
  }, memory.ownerId);
}

export async function saveForgottenMemory(memory: ApprovedMemory) {
  return mutateMemoryDb((db) => {
    db.memories = [
      memory,
      ...db.memories.filter(
        (item) => item.id !== memory.id || item.ownerId !== memory.ownerId
      )
    ];
    db.embeddings = db.embeddings.filter(
      (item) => item.memoryId !== memory.id || item.ownerId !== memory.ownerId
    );
    db.candidates = db.candidates.map((candidate) =>
      candidate.id === memory.id && candidate.ownerId === memory.ownerId ? memory : candidate
    );
    return memory;
  }, memory.ownerId);
}

export async function saveMemoryChangePreview(preview: MemoryChangePreview) {
  return mutateMemoryDb((db) => {
    const index = db.changes.findIndex(
      (item) => item.id === preview.id && item.ownerId === preview.ownerId
    );
    if (index >= 0) db.changes[index] = preview;
    else db.changes.unshift(preview);
    return preview;
  }, preview.ownerId);
}
