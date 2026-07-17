import { randomUUID } from "node:crypto";
import { readJsonStore, withJsonStoreLock, writeJsonStore } from "../local-db/json-store";
import {
  isActiveResearchStatus,
  type ResearchJob,
  type ResearchJobStatus,
  type ResearchSettings
} from "./deep-research.types";
import { RESEARCH_LIMITS } from "./research-budget";

type ResearchDb = {
  jobs: ResearchJob[];
};

const FILE_NAME = "deep-research.json";
const EMPTY_DB: ResearchDb = { jobs: [] };
const MAX_JOBS_PER_OWNER = 20;
const MAX_PROGRESS_EVENTS = 60;
const STALE_HEARTBEAT_MS = 2 * 60_000;
const RETENTION_DAYS = 30;

export class ResearchJobError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "ResearchJobError";
    this.code = code;
    this.status = status;
  }
}

export async function createResearchJob(input: {
  ownerId: string;
  chatSessionId?: string | null;
  query: string;
  settings: ResearchSettings;
}): Promise<ResearchJob> {
  const query = input.query.trim();
  if (!query) throw new ResearchJobError("RESEARCH_EMPTY_QUERY", "조사할 질문을 입력하세요.");
  if (query.length > RESEARCH_LIMITS.maxQueryLength) {
    throw new ResearchJobError("RESEARCH_QUERY_TOO_LONG", "질문이 너무 깁니다.");
  }

  return accessDb(async (db) => {
    const active = db.jobs.filter(
      (job) => job.ownerId === input.ownerId && isActiveResearchStatus(job.status)
    );
    if (active.length >= 1) {
      throw new ResearchJobError(
        "RESEARCH_ALREADY_RUNNING",
        "이미 진행 중인 심층 조사가 있습니다. 완료하거나 중단한 뒤 다시 시작하세요.",
        429
      );
    }

    const now = new Date().toISOString();
    const job: ResearchJob = {
      id: randomUUID(),
      ownerId: input.ownerId,
      chatSessionId: input.chatSessionId || null,
      query,
      mode: input.settings.mode,
      settings: input.settings,
      status: "queued",
      progress: 0,
      currentStep: "대기 중",
      progressEvents: [
        { at: now, step: "queued", message: "심층 조사가 생성되었습니다." }
      ],
      checkpoint: null,
      report: null,
      reportSections: null,
      sources: [],
      videos: [],
      error: null,
      usage: { searches: 0, pagesFetched: 0, aiCalls: 0 },
      cancelRequested: false,
      pauseRequested: false,
      heartbeatAt: null,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      updatedAt: now
    };
    db.jobs.unshift(job);
    pruneOwnerJobs(db, input.ownerId);
    return structuredClone(job);
  });
}

export async function getResearchJob(ownerId: string, jobId: string): Promise<ResearchJob | null> {
  return accessDb((db) => {
    const job = db.jobs.find((item) => item.ownerId === ownerId && item.id === jobId);
    return job ? structuredClone(job) : null;
  });
}

export async function listResearchJobs(
  ownerId: string,
  options: { limit?: number; chatSessionId?: string } = {}
): Promise<ResearchJob[]> {
  return accessDb((db) => {
    const limit = Math.min(Math.max(options.limit || 10, 1), MAX_JOBS_PER_OWNER);
    return db.jobs
      .filter(
        (job) =>
          job.ownerId === ownerId &&
          (!options.chatSessionId || job.chatSessionId === options.chatSessionId)
      )
      .slice(0, limit)
      .map((job) => structuredClone(job));
  });
}

export async function mutateResearchJob(
  ownerId: string,
  jobId: string,
  mutate: (job: ResearchJob) => void
): Promise<ResearchJob | null> {
  return accessDb((db) => {
    const job = db.jobs.find((item) => item.ownerId === ownerId && item.id === jobId);
    if (!job) return null;
    mutate(job);
    job.updatedAt = new Date().toISOString();
    if (job.progressEvents.length > MAX_PROGRESS_EVENTS) {
      job.progressEvents = job.progressEvents.slice(-MAX_PROGRESS_EVENTS);
    }
    return structuredClone(job);
  });
}

export async function appendResearchProgress(
  ownerId: string,
  jobId: string,
  input: {
    status?: ResearchJobStatus;
    step: string;
    message: string;
    progress?: number;
  }
) {
  return mutateResearchJob(ownerId, jobId, (job) => {
    if (input.status) job.status = input.status;
    job.currentStep = input.message;
    if (typeof input.progress === "number") {
      job.progress = Math.min(100, Math.max(job.progress, Math.round(input.progress)));
    }
    job.heartbeatAt = new Date().toISOString();
    job.progressEvents.push({
      at: new Date().toISOString(),
      step: input.step,
      message: input.message
    });
  });
}

export async function requestResearchCancel(ownerId: string, jobId: string) {
  return mutateResearchJob(ownerId, jobId, (job) => {
    if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") return;
    job.cancelRequested = true;
    if (job.status === "queued" || job.status === "paused") {
      job.status = "cancelled";
      job.completedAt = new Date().toISOString();
      job.currentStep = "사용자가 중단했습니다.";
    }
  });
}

export async function requestResearchPause(ownerId: string, jobId: string) {
  return mutateResearchJob(ownerId, jobId, (job) => {
    if (!isActiveResearchStatus(job.status)) return;
    job.pauseRequested = true;
  });
}

export async function prepareResearchResume(ownerId: string, jobId: string) {
  return mutateResearchJob(ownerId, jobId, (job) => {
    if (job.status !== "paused" && job.status !== "failed") {
      throw new ResearchJobError(
        "RESEARCH_NOT_RESUMABLE",
        "일시정지되었거나 실패한 조사만 다시 시작할 수 있습니다.",
        409
      );
    }
    const retrying = job.status === "failed";
    if (retrying) {
      // A user-initiated retry gets a fresh time budget; the checkpoint keeps
      // already-collected queries, sources and evidence so work is not redone.
      job.startedAt = null;
      job.error = null;
      job.completedAt = null;
    }
    job.status = "queued";
    job.pauseRequested = false;
    job.cancelRequested = false;
    job.currentStep = retrying ? "재시도 대기 중" : "재개 대기 중";
    job.progressEvents.push({
      at: new Date().toISOString(),
      step: retrying ? "retry" : "resume",
      message: retrying
        ? "실패 지점의 체크포인트에서 새 시간 예산으로 재시도합니다."
        : "저장된 체크포인트에서 조사를 재개합니다."
    });
  });
}

/**
 * Marks running jobs whose worker heartbeat went silent (e.g. server restart)
 * as paused so the owner can resume them from the saved checkpoint. Safe to
 * call repeatedly.
 */
export async function recoverStaleResearchJobs(options: {
  isLocallyRunning?: (jobId: string) => boolean;
  now?: Date;
} = {}): Promise<number> {
  const now = options.now || new Date();
  return accessDb((db) => {
    let recovered = 0;
    for (const job of db.jobs) {
      if (!isActiveResearchStatus(job.status) || job.status === "queued") continue;
      if (options.isLocallyRunning?.(job.id)) continue;
      const heartbeat = job.heartbeatAt ? new Date(job.heartbeatAt).getTime() : 0;
      if (now.getTime() - heartbeat < STALE_HEARTBEAT_MS) continue;
      job.status = "paused";
      job.pauseRequested = false;
      job.currentStep = "작업이 중단되어 일시정지되었습니다. 재개할 수 있습니다.";
      job.updatedAt = now.toISOString();
      job.progressEvents.push({
        at: now.toISOString(),
        step: "recovered",
        message: "서버 재시작 등으로 중단된 조사를 일시정지 상태로 복구했습니다."
      });
      recovered += 1;
    }
    return recovered;
  });
}

export async function cleanupOldResearchJobs(now: Date = new Date()): Promise<number> {
  return accessDb((db) => {
    const cutoff = now.getTime() - RETENTION_DAYS * 86_400_000;
    const before = db.jobs.length;
    db.jobs = db.jobs.filter((job) => {
      if (isActiveResearchStatus(job.status) || job.status === "paused") return true;
      return new Date(job.updatedAt).getTime() >= cutoff;
    });
    return before - db.jobs.length;
  });
}

export async function deleteResearchJob(ownerId: string, jobId: string) {
  return accessDb((db) => {
    const index = db.jobs.findIndex((item) => item.ownerId === ownerId && item.id === jobId);
    if (index < 0) return false;
    db.jobs.splice(index, 1);
    return true;
  });
}

function pruneOwnerJobs(db: ResearchDb, ownerId: string) {
  const ownerJobs = db.jobs.filter((job) => job.ownerId === ownerId);
  if (ownerJobs.length <= MAX_JOBS_PER_OWNER) return;
  const removable = ownerJobs
    .filter((job) => !isActiveResearchStatus(job.status))
    .slice(MAX_JOBS_PER_OWNER - 1);
  const removeIds = new Set(removable.map((job) => job.id));
  db.jobs = db.jobs.filter((job) => job.ownerId !== ownerId || !removeIds.has(job.id));
}

async function accessDb<T>(operation: (db: ResearchDb) => T | Promise<T>): Promise<T> {
  return withJsonStoreLock(FILE_NAME, async () => {
    const raw = await readJsonStore<ResearchDb>(FILE_NAME, EMPTY_DB);
    const db: ResearchDb = { jobs: Array.isArray(raw.jobs) ? raw.jobs : [] };
    const result = await operation(db);
    await writeJsonStore(FILE_NAME, db);
    return result;
  });
}
