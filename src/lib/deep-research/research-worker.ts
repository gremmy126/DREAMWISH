import {
  prepareResearchResume,
  recoverStaleResearchJobs,
  ResearchJobError
} from "./deep-research.repository";
import { runResearchJob, type ResearchRunnerDeps } from "./research-runner";

/**
 * In-process research worker. Jobs run inside the long-lived Next.js server
 * process (Railway keeps it running); durable job state lives in the store so
 * a restart only pauses jobs, which owners can resume from their checkpoint.
 */
const runningJobs = new Map<string, Promise<void>>();
const GLOBAL_CONCURRENCY = 3;

export function isResearchJobRunningLocally(jobId: string): boolean {
  return runningJobs.has(jobId);
}

export function getLocalRunningResearchCount(): number {
  return runningJobs.size;
}

export function startResearchWorker(
  ownerId: string,
  jobId: string,
  deps: ResearchRunnerDeps = {}
): void {
  if (runningJobs.has(jobId)) return;
  if (runningJobs.size >= GLOBAL_CONCURRENCY) {
    throw new ResearchJobError(
      "RESEARCH_SERVER_BUSY",
      "동시에 실행 가능한 심층 조사 수를 초과했습니다. 잠시 후 다시 시도하세요.",
      429
    );
  }
  const promise = runResearchJob(ownerId, jobId, deps)
    .catch(() => undefined)
    .finally(() => {
      runningJobs.delete(jobId);
    });
  runningJobs.set(jobId, promise);
}

export async function resumeResearchWorker(
  ownerId: string,
  jobId: string,
  deps: ResearchRunnerDeps = {}
): Promise<void> {
  await prepareResearchResume(ownerId, jobId);
  startResearchWorker(ownerId, jobId, deps);
}

/** Marks orphaned running jobs (dead heartbeat, not in this process) as paused. */
export async function recoverOrphanedResearchJobs(now?: Date): Promise<number> {
  return recoverStaleResearchJobs({
    isLocallyRunning: (jobId) => runningJobs.has(jobId),
    now
  });
}
