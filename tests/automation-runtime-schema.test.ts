import assert from "node:assert/strict";
import fs from "node:fs";
import { AUTOMATION_RUNTIME_SCHEMA_SQL } from "../src/lib/automation/runtime/schema";

test("runtime schema contains every durable workflow execution approval queue and audit table", () => {
  for (const table of [
    "automation_workflows", "automation_workflow_versions", "automation_nodes", "automation_edges",
    "automation_action_snapshots", "automation_executions", "automation_step_runs", "automation_step_execution_inputs", "automation_execution_events",
    "automation_approval_requests", "automation_approval_events", "automation_queue_jobs", "automation_queue_events",
    "automation_notification_outbox", "automation_notification_inbox", "integration_connections",
    "oauth_authorization_sessions", "integration_connection_events", "automation_audit_events"
  ]) assert.match(AUTOMATION_RUNTIME_SCHEMA_SQL, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, "u"));
});

test("runtime schema stores pinned snapshots metrics leases DLQ and execution lineage", () => {
  for (const column of [
    "parent_execution_id", "resumed_from_step_id", "execution_mode", "trigger_type", "trigger_event_id",
    "retry_count", "duration_ms", "api_request_id", "rate_limit_remaining", "adapter_latency_ms", "preview_data",
    "priority", "next_run_at", "locked_until", "worker_id", "fencing_token", "dead_letter_reason",
    "workflow_version", "action_version", "adapter_version", "integration_connection_id", "input_hash",
    "output_schema_version", "risk_level", "approval_policy", "approval_expires_at"
  ]) assert.match(AUTOMATION_RUNTIME_SCHEMA_SQL, new RegExp(`\\b${column}\\b`, "u"));
  assert.match(AUTOMATION_RUNTIME_SCHEMA_SQL, /FOR EACH ROW EXECUTE FUNCTION automation_reject_append_only_mutation/u);
  assert.match(AUTOMATION_RUNTIME_SCHEMA_SQL, /UNIQUE \(dedupe_key\)/u);
});

test("runtime repositories expose owner-scoped transitions and append-only writes", () => {
  const execution = fs.readFileSync("src/lib/automation/runtime/execution.repository.ts", "utf8");
  const events = fs.readFileSync("src/lib/automation/runtime/event.repository.ts", "utf8");
  const audits = fs.readFileSync("src/lib/automation/runtime/audit.repository.ts", "utf8");
  assert.match(execution, /owner_id = \$\{ownerId\}/u);
  assert.match(execution, /status = \$\{transition\.from\}/u);
  assert.match(execution, /appendExecutionEvent/u);
  assert.match(events, /INSERT INTO automation_execution_events/u);
  assert.doesNotMatch(events, /UPDATE automation_execution_events/u);
  assert.match(audits, /INSERT INTO automation_audit_events/u);
  assert.doesNotMatch(audits, /DELETE FROM automation_audit_events/u);
});

test("step execution inputs are encrypted at rest and loaded separately from masked UI values", () => {
  const execution = fs.readFileSync("src/lib/automation/runtime/execution.repository.ts", "utf8");
  const approval = fs.readFileSync("src/lib/automation/approval/approval.service.ts", "utf8");
  assert.match(execution, /INSERT INTO automation_step_execution_inputs/u);
  assert.match(execution, /encryptToken\(serialized\)/u);
  assert.match(execution, /export async function getStepExecutionInput/u);
  assert.match(execution, /decryptToken/u);
  assert.match(approval, /getStepExecutionInput/u);
  assert.doesNotMatch(approval, /normalizedInput = structuredClone\(\(rows\[0\]\.masked_input/u);
});
