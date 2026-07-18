import type { AutomationQueueAdapter, AutomationQueueJob, QueueLease } from "./queue.adapter";
import { normalizeAutomationError } from "../runtime/automation-error-catalog";

export type QueueJobHandler = (
  job: AutomationQueueJob,
  context: { lease: QueueLease; heartbeat: () => Promise<boolean> }
) => Promise<void>;

export class PermanentQueueJobError extends Error {
  readonly retryable = false;
  constructor(message: string, readonly code = "PERMANENT_JOB_FAILURE") {
    super(message);
    this.name = "PermanentQueueJobError";
  }
}

export class AutomationQueueWorker {
  constructor(
    private readonly queue: AutomationQueueAdapter,
    private readonly queueName: string,
    private readonly workerId: string,
    private readonly handlers: Readonly<Record<string, QueueJobHandler>>,
    private readonly leaseMs = 30_000
  ) {}

  async runOnce() {
    const job = await this.queue.claim(this.queueName, this.workerId, this.leaseMs);
    if (!job) return { claimed: false, status: "idle" as const };
    const lease = { jobId: job.id, workerId: this.workerId, fencingToken: job.fencingToken };
    const handler = this.handlers[job.jobType];
    if (!handler) {
      await this.queue.moveToDeadLetter(lease, `No handler is registered for ${job.jobType}`);
      return { claimed: true, status: "dead_letter" as const, jobId: job.id };
    }
    try {
      await handler(job, { lease, heartbeat: () => this.queue.heartbeat(lease, this.leaseMs) });
      const completed = await this.queue.complete(lease);
      if (!completed) throw new PermanentQueueJobError("Queue lease was lost before completion.", "LEASE_LOST");
      return { claimed: true, status: "completed" as const, jobId: job.id };
    } catch (error) {
      const caught = error instanceof PermanentQueueJobError
        ? { code: error.code, message: error.message, retryable: false, retryAfterMs: undefined }
        : normalizeAutomationError(error);
      if (!caught.retryable || caught.code === "LEASE_LOST") {
        if (caught.code !== "LEASE_LOST") await this.queue.moveToDeadLetter(lease, caught.message);
        return { claimed: true, status: caught.code === "LEASE_LOST" ? "lease_lost" as const : "dead_letter" as const, jobId: job.id };
      }
      const retried = await this.queue.retry(lease, {
        errorCode: caught.code,
        errorMessage: caught.message,
        retryAfterMs: caught.retryAfterMs
      });
      return { claimed: true, status: retried.status === "dead_letter" ? "dead_letter" as const : "retry" as const, jobId: job.id };
    }
  }

  async run(signal: AbortSignal, idlePollMs = 1_000) {
    const pollMs = Math.max(100, Math.min(10_000, Math.trunc(idlePollMs)));
    while (!signal.aborted) {
      const result = await this.runOnce();
      if (!result.claimed) await waitForAbort(signal, pollMs);
    }
  }
}

function waitForAbort(signal: AbortSignal, milliseconds: number) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const timeout = setTimeout(done, milliseconds);
    signal.addEventListener("abort", done, { once: true });
    function done() {
      clearTimeout(timeout);
      signal.removeEventListener("abort", done);
      resolve();
    }
  });
}
