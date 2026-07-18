import { createHash, randomUUID } from "node:crypto";
import { PostgresAutomationQueue } from "./postgres-queue";
import { AutomationQueueWorker, type QueueJobHandler } from "./worker";
import { createDefaultAutomationJobHandlers } from "../runtime/workflow-runner";
import { NotificationOutboxWorker } from "./notification-worker";
import { expireAllDueApprovals } from "../approval/approval.service";
import {
  AUTOMATION_WORKER_CAPABILITIES,
  AUTOMATION_WORKER_VERSION,
  WORKER_HEARTBEAT_INTERVAL_MS,
  registerWorkerHeartbeat,
  stopWorkerHeartbeat,
  updateWorkerHeartbeat
} from "./worker-heartbeat.repository";

export function createAutomationWorker(handlers: Readonly<Record<string, QueueJobHandler>> = {}) {
  const workerId = createPrivateWorkerId();
  const queueWorker = new AutomationQueueWorker(new PostgresAutomationQueue(), "automation", workerId, {
    ...createDefaultAutomationJobHandlers(),
    ...handlers
  });
  return new AutomationWorkerSupervisor(workerId, queueWorker, new NotificationOutboxWorker(`${workerId}-notifications`));
}

class AutomationWorkerSupervisor {
  private lastExpirySweep = 0;
  constructor(
    private readonly workerId: string,
    private readonly queueWorker: AutomationQueueWorker,
    private readonly notificationWorker: NotificationOutboxWorker
  ) {}

  async runOnce() {
    const [queue, notification] = await Promise.all([
      this.queueWorker.runOnce(),
      this.notificationWorker.runOnce()
    ]);
    let expiredApprovals = 0;
    if (Date.now() - this.lastExpirySweep >= 10_000) {
      this.lastExpirySweep = Date.now();
      expiredApprovals = await expireAllDueApprovals();
    }
    return { queue, notification, expiredApprovals };
  }

  async run(signal: AbortSignal, idlePollMs = 1_000) {
    const pollMs = Math.max(100, Math.min(10_000, Math.trunc(idlePollMs)));
    await registerWorkerHeartbeat({
      workerId: this.workerId,
      version: AUTOMATION_WORKER_VERSION,
      capabilities: AUTOMATION_WORKER_CAPABILITIES
    });
    const timer = setInterval(() => {
      void updateWorkerHeartbeat({
        workerId: this.workerId,
        version: AUTOMATION_WORKER_VERSION,
        capabilities: AUTOMATION_WORKER_CAPABILITIES
      }).catch((error) => console.error("[automation-worker] heartbeat failed", safeMessage(error)));
    }, WORKER_HEARTBEAT_INTERVAL_MS);
    timer.unref();
    try {
      while (!signal.aborted) {
        const result = await this.runOnce();
        if (!result.queue.claimed && !result.notification.claimed) await waitForAbort(signal, pollMs);
      }
    } finally {
      clearInterval(timer);
      await stopWorkerHeartbeat(this.workerId).catch((error) => {
        console.error("[automation-worker] stop heartbeat failed", safeMessage(error));
      });
    }
  }
}

function createPrivateWorkerId() {
  const stableInstance = process.env.AUTOMATION_WORKER_INSTANCE_ID?.trim() || process.env.RAILWAY_REPLICA_ID?.trim();
  if (!stableInstance) return `automation-${process.pid}-${randomUUID().slice(0, 8)}`;
  const digest = createHash("sha256").update(stableInstance).digest("hex").slice(0, 20);
  return `automation-${digest}`;
}

function safeMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 300) : "unknown heartbeat error";
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
