import assert from "node:assert/strict";
import fs from "node:fs";
import { computeRetryDelayMs, type AutomationQueueAdapter } from "../src/lib/automation/queue/queue.adapter";
import { PostgresAutomationQueue } from "../src/lib/automation/queue/postgres-queue";

test("queue adapter exposes lease-fenced lifecycle operations", () => {
  const names: Array<keyof AutomationQueueAdapter> = [
    "enqueue", "claim", "heartbeat", "complete", "retry", "moveToDeadLetter", "requeueDeadLetter"
  ];
  for (const name of names) assert.equal(typeof PostgresAutomationQueue.prototype[name], "function");
});

test("PostgreSQL queue claims by priority with SKIP LOCKED and fencing", () => {
  const source = fs.readFileSync("src/lib/automation/queue/postgres-queue.ts", "utf8");
  assert.match(source, /FOR UPDATE SKIP LOCKED/u);
  assert.match(source, /priority DESC, next_run_at ASC/u);
  assert.match(source, /fencing_token = fencing_token \+ 1/u);
  assert.match(source, /worker_id = \$\{lease\.workerId\}/u);
  assert.match(source, /fencing_token = \$\{lease\.fencingToken\}/u);
  assert.match(source, /dead_letter_reason/u);
});

test("retry backoff is exponential bounded and honors Retry-After", () => {
  assert.equal(computeRetryDelayMs(1, { jitter: 0 }), 1_000);
  assert.equal(computeRetryDelayMs(4, { jitter: 0 }), 8_000);
  assert.equal(computeRetryDelayMs(99, { jitter: 0 }), 15 * 60_000);
  assert.equal(computeRetryDelayMs(2, { retryAfterMs: 42_000, jitter: 0 }), 42_000);
});

test("worker entry command is configured", () => {
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
  assert.match(pkg.scripts["automation:worker"] || "", /run-automation-worker/u);
});
