import { randomUUID } from "node:crypto";
import { PostgresAutomationQueue } from "./postgres-queue";
import { AutomationQueueWorker, type QueueJobHandler } from "./worker";
import { createDefaultAutomationJobHandlers } from "../runtime/workflow-runner";
import { NotificationOutboxWorker } from "./notification-worker";
import { expireAllDueApprovals } from "../approval/approval.service";

export function createAutomationWorker(handlers: Readonly<Record<string, QueueJobHandler>> = {}) {
  const workerId = `automation-${process.pid}-${randomUUID().slice(0, 8)}`;
  const queueWorker = new AutomationQueueWorker(new PostgresAutomationQueue(), "automation", workerId, {
    ...createDefaultAutomationJobHandlers(),
    ...handlers
  });
  return new AutomationWorkerSupervisor(queueWorker, new NotificationOutboxWorker(`${workerId}-notifications`));
}

class AutomationWorkerSupervisor {
  private lastExpirySweep = 0;
  constructor(
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
    while (!signal.aborted) {
      const result = await this.runOnce();
      if (!result.queue.claimed && !result.notification.claimed) await waitForAbort(signal, pollMs);
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
