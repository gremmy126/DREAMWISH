import assert from "node:assert/strict";
import {
  EXECUTION_TRANSITIONS,
  InvalidExecutionTransitionError,
  resolveExecutionTransition
} from "../src/lib/automation/runtime/transition-table";

test("high-risk execution follows the durable two-stage approval chain", () => {
  const chain = [
    ["queued", "JOB_CLAIMED", "worker", "running"],
    ["running", "HIGH_RISK_DETECTED", "worker", "waiting_warning"],
    ["waiting_warning", "WARNING_CONTINUED", "owner", "waiting_final_approval"],
    ["waiting_final_approval", "FINAL_APPROVED_AND_AUTHENTICATED", "owner", "approved"],
    ["approved", "RESUME_ENQUEUED", "system", "queued"],
    ["queued", "JOB_CLAIMED", "worker", "running"],
    ["running", "ADAPTER_SUCCEEDED", "worker", "completed"]
  ] as const;
  for (const [from, event, actor, to] of chain) {
    assert.equal(resolveExecutionTransition(from, event, actor).to, to);
  }
});

test("rejection expiry retry connection and permanent failures are explicit", () => {
  assert.equal(resolveExecutionTransition("waiting_warning", "REJECTED", "owner").to, "rejected");
  assert.equal(resolveExecutionTransition("waiting_final_approval", "EXPIRED", "system").to, "expired");
  assert.equal(resolveExecutionTransition("running", "RETRY_SCHEDULED", "worker").to, "retry_wait");
  assert.equal(resolveExecutionTransition("running", "CONNECTION_REQUIRED", "worker").to, "waiting_connection");
  assert.equal(resolveExecutionTransition("running", "PERMANENT_FAILURE", "worker").to, "failed");
  assert.ok(EXECUTION_TRANSITIONS.every((transition) => transition.actors.length > 0));
});

test("undefined transitions and wrong actors fail closed", () => {
  assert.throws(
    () => resolveExecutionTransition("waiting_warning", "ADAPTER_SUCCEEDED", "worker"),
    InvalidExecutionTransitionError
  );
  assert.throws(
    () => resolveExecutionTransition("waiting_final_approval", "FINAL_APPROVED_AND_AUTHENTICATED", "worker"),
    InvalidExecutionTransitionError
  );
});
