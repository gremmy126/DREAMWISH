import type {
  ExecutionActor,
  ExecutionEventType,
  ExecutionStatus,
  ExecutionTransition
} from "./types";

export const EXECUTION_TRANSITIONS: readonly ExecutionTransition[] = Object.freeze([
  transition("queued", "JOB_CLAIMED", "running", ["worker"]),
  transition("running", "HIGH_RISK_DETECTED", "waiting_warning", ["worker"]),
  transition("running", "APPROVAL_REQUIRED", "waiting_final_approval", ["worker"]),
  transition("waiting_warning", "WARNING_CONTINUED", "waiting_final_approval", ["owner", "approver"]),
  transition("waiting_warning", "REJECTED", "rejected", ["owner", "approver"]),
  transition("waiting_warning", "EXPIRED", "expired", ["system"]),
  transition("waiting_warning", "CANCELLED", "cancelled", ["owner", "admin"]),
  transition("waiting_final_approval", "FINAL_APPROVED_AND_AUTHENTICATED", "approved", ["owner", "approver"]),
  transition("waiting_final_approval", "INPUT_EDITED", "rejected", ["owner", "approver"]),
  transition("waiting_final_approval", "REJECTED", "rejected", ["owner", "approver"]),
  transition("waiting_final_approval", "EXPIRED", "expired", ["system"]),
  transition("waiting_final_approval", "CANCELLED", "cancelled", ["owner", "admin"]),
  transition("approved", "RESUME_ENQUEUED", "queued", ["system"]),
  transition("running", "ADAPTER_SUCCEEDED", "completed", ["worker"]),
  transition("running", "RETRY_SCHEDULED", "retry_wait", ["worker"]),
  transition("retry_wait", "RETRY_DUE", "queued", ["system"]),
  transition("running", "CONNECTION_REQUIRED", "waiting_connection", ["worker"]),
  transition("waiting_connection", "CONNECTION_RESTORED", "queued", ["system", "owner"]),
  transition("running", "PERMANENT_FAILURE", "failed", ["worker"]),
  transition("queued", "CANCELLED", "cancelled", ["owner", "admin"]),
  transition("retry_wait", "CANCELLED", "cancelled", ["owner", "admin"]),
  transition("waiting_connection", "CANCELLED", "cancelled", ["owner", "admin"])
]);

export class InvalidExecutionTransitionError extends Error {
  readonly code = "INVALID_EXECUTION_TRANSITION";
  constructor(from: ExecutionStatus, event: ExecutionEventType, actor: ExecutionActor) {
    super(`Execution transition is not allowed: ${from} + ${event} by ${actor}`);
    this.name = "InvalidExecutionTransitionError";
  }
}

export function resolveExecutionTransition(
  from: ExecutionStatus,
  event: ExecutionEventType,
  actor: ExecutionActor
): ExecutionTransition {
  const match = EXECUTION_TRANSITIONS.find(
    (candidate) => candidate.from === from && candidate.event === event && candidate.actors.includes(actor)
  );
  if (!match) throw new InvalidExecutionTransitionError(from, event, actor);
  return match;
}

function transition(
  from: ExecutionStatus,
  event: ExecutionEventType,
  to: ExecutionStatus,
  actors: readonly ExecutionActor[]
): ExecutionTransition {
  return { from, event, to, actors };
}
