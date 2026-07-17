import type { ActionValue } from "../registry/action.types";

export type QueueJobStatus = "queued" | "running" | "completed" | "dead_letter" | "cancelled";
export type SafeQueuePayload = Record<string, ActionValue>;

export type AutomationQueueJob = {
  id: string;
  queueName: string;
  jobType: string;
  ownerId: string;
  executionId: string | null;
  stepRunId: string | null;
  priority: number;
  nextRunAt: string;
  status: QueueJobStatus;
  attempt: number;
  maxAttempts: number;
  idempotencyKey: string;
  lockedUntil: string | null;
  workerId: string | null;
  fencingToken: number;
  safePayload: SafeQueuePayload;
  deadLetterReason: string | null;
};

export type QueueLease = { jobId: string; workerId: string; fencingToken: number };

export interface AutomationQueueAdapter {
  enqueue(input: {
    queueName: string;
    jobType: string;
    ownerId: string;
    executionId?: string | null;
    stepRunId?: string | null;
    priority?: number;
    nextRunAt?: string;
    maxAttempts?: number;
    idempotencyKey: string;
    safePayload?: SafeQueuePayload;
  }): Promise<AutomationQueueJob>;
  claim(queueName: string, workerId: string, leaseMs?: number): Promise<AutomationQueueJob | null>;
  heartbeat(lease: QueueLease, leaseMs?: number): Promise<boolean>;
  complete(lease: QueueLease): Promise<boolean>;
  retry(lease: QueueLease, input: { errorCode?: string; errorMessage?: string; retryAfterMs?: number }): Promise<AutomationQueueJob>;
  moveToDeadLetter(lease: QueueLease, reason: string): Promise<AutomationQueueJob>;
  requeueDeadLetter(ownerId: string, jobId: string, actorId: string): Promise<AutomationQueueJob>;
}

export function computeRetryDelayMs(
  attempt: number,
  options: { retryAfterMs?: number; baseMs?: number; maxMs?: number; jitter?: number } = {}
) {
  const base = Math.max(100, options.baseMs || 1_000);
  const max = Math.max(base, options.maxMs || 15 * 60_000);
  const retryAfter = Math.max(0, options.retryAfterMs || 0);
  const exponential = Math.min(max, base * 2 ** Math.max(0, Math.min(20, attempt - 1)));
  const raw = retryAfter > 0 ? Math.min(max, retryAfter) : exponential;
  const jitter = Math.max(0, Math.min(1, options.jitter ?? 0.2));
  return Math.round(Math.min(max, raw * (1 + Math.random() * jitter)));
}
