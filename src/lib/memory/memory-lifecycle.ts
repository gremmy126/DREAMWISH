import { createHash } from "node:crypto";
import { getOwnedChatMessagesForProvenance } from "@/src/lib/db/repositories/chat.repository";
import {
  analyzeConversationForMemory,
  type AutoMemoryConversationInput,
  type AutoMemoryExtraction
} from "@/src/lib/memory/auto-memory-engine";
import { createEmbeddingRecord } from "@/src/lib/memory/memory-embedding";
import { createMemoryCandidate } from "@/src/lib/memory/memory-engine";
import {
  persistAfterDeletingApprovedMemoryMarkdown,
  replaceApprovedMemoryMarkdown,
  writeApprovedMemoryMarkdown
} from "@/src/lib/memory/memory-markdown";
import {
  addApprovedMemory,
  readMemoryDb,
  saveForgottenMemory,
  upsertMemoryCaptureJob,
  upsertMemoryCandidate,
  upsertApprovedMemory
} from "@/src/lib/memory/memory-repository";
import type {
  ApprovedMemory,
  MemoryCaptureJob,
  MemoryCaptureResult,
  MemoryCandidate,
  MemoryHistoryEntry
} from "@/src/lib/memory/memory.types";

export class MemoryLifecycleError extends Error {
  constructor(
    readonly code: "MEMORY_NOT_FOUND" | "MEMORY_CONFLICT" | "MEMORY_PROVENANCE_INVALID",
    readonly status: 404 | 409 | 422
  ) {
    super(code);
    this.name = "MemoryLifecycleError";
  }
}

export type ConversationMemoryCaptureInput = {
  ownerId: string;
  sessionId: string;
  userMessageId: string;
  assistantMessageId: string;
  userMessage: string;
  assistantAnswer: string;
  createdAt?: string;
};

type ConversationMemoryExtractor = (
  input: AutoMemoryConversationInput
) => AutoMemoryExtraction | null | Promise<AutoMemoryExtraction | null>;

export function captureConversationMemory(
  input: ConversationMemoryCaptureInput
): Promise<MemoryCaptureResult> {
  return captureConversationMemoryWithExtractor(input, analyzeConversationForMemory);
}

export function captureConversationMemoryWithExtractor(
  input: ConversationMemoryCaptureInput,
  extractor: ConversationMemoryExtractor
): Promise<MemoryCaptureResult> {
  const sourceMessageIds = [input.userMessageId, input.assistantMessageId];
  const captureKey = createHash("sha256")
    .update(
      JSON.stringify({
        ownerId: input.ownerId,
        sessionId: input.sessionId,
        sourceMessageIds
      })
    )
    .digest("hex");
  return withLifecycleLock(input.ownerId, `capture:${captureKey}`, () =>
    captureConversationMemoryUnlocked(input, extractor, captureKey)
  );
}

async function captureConversationMemoryUnlocked(
  input: ConversationMemoryCaptureInput,
  extractor: ConversationMemoryExtractor,
  captureKey: string
): Promise<MemoryCaptureResult> {
  const attemptedAt = new Date().toISOString();
  const sourceMessageIds = [input.userMessageId, input.assistantMessageId];
  const jobId = `capture:${captureKey}`;
  const db = await readMemoryDb();
  const existingJob = db.captureJobs.find(
    (item) => item.ownerId === input.ownerId && item.id === jobId
  );
  if (existingJob?.status === "completed") {
    return {
      status: existingJob.status,
      job: existingJob,
      candidates: db.candidates.filter(
        (candidate) =>
          candidate.ownerId === input.ownerId &&
          candidate.sourceSessionId === input.sessionId &&
          sameIds(candidate.sourceMessageIds, sourceMessageIds)
      )
    };
  }
  const pending: MemoryCaptureJob = await upsertMemoryCaptureJob({
    id: jobId,
    ownerId: input.ownerId,
    sourceSessionId: input.sessionId,
    sourceMessageIds,
    status: "pending",
    attempts: (existingJob?.attempts || 0) + 1,
    lastErrorCode: null,
    createdAt: existingJob?.createdAt || input.createdAt || attemptedAt,
    updatedAt: attemptedAt
  });
  try {
    const extraction = await extractor({
      sessionId: input.sessionId,
      userMessage: input.userMessage,
      assistantAnswer: input.assistantAnswer,
      createdAt: input.createdAt
    });
    const candidates = extraction
      ? [
          await createMemoryCandidate({
            id: `candidate:${captureKey}:0`,
            ownerId: input.ownerId,
            source: "chat",
            sourceId: extraction.sourceId,
            sourceSessionId: input.sessionId,
            sourceMessageIds,
            title: extraction.title,
            content: extraction.content,
            preview: extraction.summary.slice(0, 220),
            projectId: extraction.projectId,
            signals: extraction.signals,
            importance: extraction.importance,
            confidence: extraction.confidence,
            category: extraction.category,
            summary: extraction.summary,
            tags: extraction.tags,
            relatedConcepts: extraction.relatedConcepts,
            relatedLinks: extraction.relatedLinks,
            history: [
              {
                at: pending.createdAt,
                event: "Conversation memory captured for review",
                sourceId: extraction.sourceId,
                summary: extraction.summary
              }
            ]
          })
        ]
      : [];
    const completed = await upsertMemoryCaptureJob({
      ...pending,
      status: "completed",
      lastErrorCode: null,
      updatedAt: new Date().toISOString()
    });
    return { status: completed.status, job: completed, candidates };
  } catch (error) {
    const failed = await upsertMemoryCaptureJob({
      ...pending,
      status: "failed",
      lastErrorCode: sanitizeCaptureErrorCode(error),
      updatedAt: new Date().toISOString()
    });
    const failedDb = await readMemoryDb();
    return {
      status: failed.status,
      job: failed,
      candidates: failedDb.candidates.filter(
        (candidate) =>
          candidate.ownerId === input.ownerId &&
          candidate.sourceSessionId === input.sessionId &&
          sameIds(candidate.sourceMessageIds, sourceMessageIds)
      )
    };
  }
}

export function approveCandidate(
  ownerId: string,
  id: string,
  input: { expectedVersion: number; content?: string; note?: string | null }
): Promise<ApprovedMemory> {
  return withLifecycleLock(ownerId, id, () => approveCandidateUnlocked(ownerId, id, input));
}

async function approveCandidateUnlocked(
  ownerId: string,
  id: string,
  input: { expectedVersion: number; content?: string; note?: string | null }
): Promise<ApprovedMemory> {
  const db = await readMemoryDb();
  const candidate = db.candidates.find(
    (item) => item.ownerId === ownerId && item.id === id
  );
  if (!candidate) throw new MemoryLifecycleError("MEMORY_NOT_FOUND", 404);
  assertExpectedVersion(candidate.version, input.expectedVersion);
  if (candidate.status !== "pending") {
    throw new MemoryLifecycleError("MEMORY_CONFLICT", 409);
  }
  await assertCandidateProvenance(candidate);

  const now = new Date().toISOString();
  const content = input.content === undefined ? candidate.content : input.content.trim();
  if (!content) throw new MemoryLifecycleError("MEMORY_PROVENANCE_INVALID", 422);
  const approvedBase: Omit<ApprovedMemory, "markdownPath"> = {
    ...candidate,
    content,
    status: "approved",
    version: candidate.version + 1,
    updatedAt: now,
    approvedAt: now,
    approvedBy: ownerId,
    approvalNote: input.note?.trim() || null,
    embeddingId: "",
    graphUpdatedAt: now,
    history: appendHistory(candidate.history, {
      at: now,
      event: "Memory approved",
      sourceId: candidate.sourceId,
      summary: input.note?.trim() || "Approved by owner"
    })
  };
  const embedding = createEmbeddingRecord({ ...approvedBase, markdownPath: "" });
  const memory: ApprovedMemory = {
    ...approvedBase,
    embeddingId: embedding.id,
    markdownPath: await writeApprovedMemoryMarkdown({
      ...approvedBase,
      embeddingId: embedding.id
    })
  };
  return addApprovedMemory(memory, embedding);
}

export function rejectCandidate(
  ownerId: string,
  id: string,
  input: { expectedVersion: number }
) {
  return withLifecycleLock(ownerId, id, () => rejectCandidateUnlocked(ownerId, id, input));
}

async function rejectCandidateUnlocked(
  ownerId: string,
  id: string,
  input: { expectedVersion: number }
) {
  const db = await readMemoryDb();
  const candidate = db.candidates.find(
    (item) => item.ownerId === ownerId && item.id === id
  );
  if (!candidate) throw new MemoryLifecycleError("MEMORY_NOT_FOUND", 404);
  assertExpectedVersion(candidate.version, input.expectedVersion);
  if (candidate.status !== "pending") {
    throw new MemoryLifecycleError("MEMORY_CONFLICT", 409);
  }
  const now = new Date().toISOString();
  return upsertMemoryCandidate({
    ...candidate,
    status: "rejected",
    rejectedAt: now,
    version: candidate.version + 1,
    updatedAt: now,
    history: appendHistory(candidate.history, {
      at: now,
      event: "Memory rejected",
      sourceId: candidate.sourceId,
      summary: "Rejected by owner"
    })
  });
}

export function correctApprovedMemory(
  ownerId: string,
  id: string,
  input: { expectedVersion: number; content: string }
): Promise<ApprovedMemory> {
  return withLifecycleLock(ownerId, id, () =>
    correctApprovedMemoryUnlocked(ownerId, id, input)
  );
}

async function correctApprovedMemoryUnlocked(
  ownerId: string,
  id: string,
  input: { expectedVersion: number; content: string }
): Promise<ApprovedMemory> {
  const memory = (await readMemoryDb()).memories.find(
    (item) => item.ownerId === ownerId && item.id === id && item.status === "approved"
  );
  if (!memory) throw new MemoryLifecycleError("MEMORY_NOT_FOUND", 404);
  assertExpectedVersion(memory.version, input.expectedVersion);
  const content = input.content.trim();
  if (!content) throw new MemoryLifecycleError("MEMORY_PROVENANCE_INVALID", 422);
  const now = new Date().toISOString();
  const correctedBase: Omit<ApprovedMemory, "markdownPath"> = {
    ...memory,
    content,
    status: "approved",
    version: memory.version + 1,
    updatedAt: now,
    graphUpdatedAt: now,
    embeddingId: "",
    history: appendHistory(memory.history, {
      at: now,
      event: "Memory corrected",
      sourceId: memory.sourceId,
      summary: "Approved memory content corrected"
    })
  };
  const embedding = createEmbeddingRecord({ ...correctedBase, markdownPath: "" });
  return replaceApprovedMemoryMarkdown(
    ownerId,
    memory.markdownPath,
    {
      ...correctedBase,
      embeddingId: embedding.id
    },
    (markdownPath) =>
      upsertApprovedMemory(
        { ...correctedBase, embeddingId: embedding.id, markdownPath },
        embedding
      )
  );
}

export function forgetApprovedMemory(
  ownerId: string,
  id: string,
  input: { expectedVersion: number }
): Promise<ApprovedMemory> {
  return withLifecycleLock(ownerId, id, () =>
    forgetApprovedMemoryUnlocked(ownerId, id, input)
  );
}

async function forgetApprovedMemoryUnlocked(
  ownerId: string,
  id: string,
  input: { expectedVersion: number }
): Promise<ApprovedMemory> {
  const memory = (await readMemoryDb()).memories.find(
    (item) => item.ownerId === ownerId && item.id === id && item.status === "approved"
  );
  if (!memory) throw new MemoryLifecycleError("MEMORY_NOT_FOUND", 404);
  assertExpectedVersion(memory.version, input.expectedVersion);
  const now = new Date().toISOString();
  const forgotten: ApprovedMemory = {
    ...memory,
    status: "forgotten",
    forgottenAt: now,
    version: memory.version + 1,
    updatedAt: now,
    graphUpdatedAt: now,
    markdownPath: "",
    embeddingId: "",
    history: appendHistory(memory.history, {
      at: now,
      event: "Memory forgotten",
      sourceId: memory.sourceId,
      summary: "Approved memory and derived data forgotten"
    })
  };
  return persistAfterDeletingApprovedMemoryMarkdown(
    ownerId,
    memory.markdownPath,
    () => saveForgottenMemory(forgotten)
  );
}

async function assertCandidateProvenance(candidate: MemoryCandidate) {
  if (candidate.source !== "chat") {
    if (!candidate.sourceId?.trim()) {
      throw new MemoryLifecycleError("MEMORY_PROVENANCE_INVALID", 422);
    }
    return;
  }
  if (!candidate.sourceSessionId || candidate.sourceMessageIds.length === 0) {
    throw new MemoryLifecycleError("MEMORY_PROVENANCE_INVALID", 422);
  }
  const messages = await getOwnedChatMessagesForProvenance(
    candidate.ownerId,
    candidate.sourceSessionId,
    candidate.sourceMessageIds
  );
  if (!messages) throw new MemoryLifecycleError("MEMORY_PROVENANCE_INVALID", 422);
}

function assertExpectedVersion(actual: number, expected: number) {
  if (!Number.isInteger(expected) || actual !== expected) {
    throw new MemoryLifecycleError("MEMORY_CONFLICT", 409);
  }
}

function appendHistory(history: MemoryHistoryEntry[] | undefined, entry: MemoryHistoryEntry) {
  return [...(history || []), entry];
}

const lifecycleLocks = new Map<string, Promise<void>>();

async function withLifecycleLock<T>(
  ownerId: string,
  id: string,
  operation: () => Promise<T>
): Promise<T> {
  const key = `${ownerId}\u0000${id}`;
  const previous = lifecycleLocks.get(key) || Promise.resolve();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => gate);
  lifecycleLocks.set(key, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (lifecycleLocks.get(key) === tail) lifecycleLocks.delete(key);
  }
}

function sanitizeCaptureErrorCode(error: unknown) {
  const rawCode =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
  if (typeof rawCode !== "string") return "MEMORY_CAPTURE_FAILED";
  const code = rawCode.trim().toUpperCase();
  return /^[A-Z][A-Z0-9_]{0,63}$/u.test(code) ? code : "MEMORY_CAPTURE_FAILED";
}

function sameIds(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
