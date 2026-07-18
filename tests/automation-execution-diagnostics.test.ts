import assert from "node:assert/strict";
import fs from "node:fs";
import {
  AUTOMATION_ERROR_CODES,
  getAutomationErrorDescriptor,
  normalizeAutomationError
} from "../src/lib/automation/runtime/automation-error-catalog";
import { buildExecutionDiagnosticView } from "../src/lib/automation/runtime/execution-diagnosis.service";
import type { AutomationExecution, AutomationStepRun } from "../src/lib/automation/runtime/types";

const NOW = new Date("2026-07-18T12:01:00.000Z");

function execution(overrides: Partial<AutomationExecution> = {}): AutomationExecution {
  return {
    id: "execution-1",
    ownerId: "owner-1",
    workflowId: "scenario-1",
    workflowVersion: 1,
    parentExecutionId: null,
    resumedFromStepId: null,
    executionMode: "manual",
    triggerType: "manual",
    triggerEventId: null,
    idempotencyKey: "key-1",
    status: "queued",
    errorCode: null,
    errorMessage: null,
    safeErrorMessage: null,
    retryEligible: false,
    retryAt: null,
    startedAt: null,
    completedAt: null,
    createdAt: "2026-07-18T12:00:40.000Z",
    updatedAt: "2026-07-18T12:00:40.000Z",
    ...overrides
  };
}

test("automation error catalog exposes every stable diagnosis and masks provider secrets", () => {
  const required = [
    "WORKER_OFFLINE", "CONNECTION_REQUIRED", "CONNECTION_NOT_FOUND", "CREDENTIAL_INVALID",
    "SCOPE_INSUFFICIENT", "RATE_LIMITED", "ADAPTER_UNAVAILABLE", "PROVIDER_AUTH_FAILED"
  ] as const;
  for (const code of required) {
    assert.ok(AUTOMATION_ERROR_CODES.includes(code));
    assert.ok(getAutomationErrorDescriptor(code).recoverySteps.length > 0);
  }
  const normalized = normalizeAutomationError(Object.assign(
    new Error('provider body {"access_token":"secret-access","client_secret":"secret-client"} Bearer hidden-value'),
    { code: "ACTION_FAILED", status: 401, apiRequestId: "safe-request-id" }
  ));
  assert.equal(normalized.code, "PROVIDER_AUTH_FAILED");
  assert.equal(normalized.apiRequestId, "safe-request-id");
  assert.doesNotMatch(normalized.message, /secret-access|secret-client|hidden-value|access_token/u);
});

test("queued execution diagnoses worker offline only after thirty seconds and retains queue details", () => {
  const queue = { position: 3, nextRunAt: "2026-07-18T12:01:10.000Z", attempt: 0, maxAttempts: 5 };
  const young = buildExecutionDiagnosticView({
    execution: execution(), steps: [], queue,
    workerHealth: { configured: true, status: "offline", lastSeenAt: null, lastSeenAgeSeconds: null, version: null, versionCompatible: null, capabilities: [] },
    isAdmin: false, now: NOW
  });
  assert.equal(young.diagnosis, null);
  assert.equal(young.queue.position, 3);

  const stale = buildExecutionDiagnosticView({
    execution: execution({ createdAt: "2026-07-18T12:00:29.999Z" }), steps: [], queue,
    workerHealth: { configured: true, status: "offline", lastSeenAt: null, lastSeenAgeSeconds: null, version: null, versionCompatible: null, capabilities: [] },
    isAdmin: false, now: NOW
  });
  assert.equal(stale.diagnosis?.code, "WORKER_OFFLINE");
  assert.equal(stale.executionStatus, "queued");
  assert.equal(stale.diagnosis?.action, null);

  const healthy = buildExecutionDiagnosticView({
    execution: execution({ createdAt: "2026-07-18T12:00:00.000Z" }), steps: [], queue,
    workerHealth: { configured: true, status: "healthy", lastSeenAt: NOW.toISOString(), lastSeenAgeSeconds: 0, version: "1.0.0", versionCompatible: true, capabilities: ["automation"] },
    isAdmin: false, now: NOW
  });
  assert.equal(healthy.diagnosis, null);
});

test("connection diagnosis targets the exact workflow node and carries safe provider telemetry", () => {
  const step = {
    id: "step-1", ownerId: "owner-1", executionId: "execution-1", nodeId: "node 1", actionId: "send-email",
    actionVersion: 1, adapterKey: "gmail.send-email", adapterVersion: 1, integrationConnectionId: null,
    riskLevel: "medium", status: "waiting_connection", attempt: 1, retryCount: 0, durationMs: 50,
    apiRequestId: "request-1", rateLimitRemaining: 7, adapterLatencyMs: 45, maskedInput: {}, maskedOutput: null,
    previewData: null, errorCode: "CONNECTION_REQUIRED", errorMessage: "연결이 필요합니다.",
    retryEligible: true, retryAt: null, fencingToken: 0
  } satisfies AutomationStepRun;
  const view = buildExecutionDiagnosticView({
    execution: execution({ status: "waiting_connection", errorCode: "CONNECTION_REQUIRED", retryEligible: true }),
    steps: [step], queue: null,
    workerHealth: { configured: true, status: "healthy", lastSeenAt: NOW.toISOString(), lastSeenAgeSeconds: 0, version: "1.0.0", versionCompatible: true, capabilities: ["automation"] },
    isAdmin: false, now: NOW
  });
  assert.equal(view.diagnosis?.failingStepId, "step-1");
  assert.equal(view.diagnosis?.apiRequestId, "request-1");
  assert.equal(view.diagnosis?.action?.kind, "open_connection");
  assert.match(view.diagnosis?.action?.href || "", /scenario=scenario-1/u);
  assert.match(view.diagnosis?.action?.href || "", /node=node\+1/u);
});

test("retry metadata and preflight waiting steps are durable contracts", () => {
  const schema = fs.readFileSync("src/lib/automation/runtime/schema.ts", "utf8");
  const repository = fs.readFileSync("src/lib/automation/runtime/execution.repository.ts", "utf8");
  const enqueue = fs.readFileSync("src/lib/automation/runtime/execution-enqueue.service.ts", "utf8");
  assert.match(schema, /retry_eligible BOOLEAN/u);
  assert.match(schema, /retry_at TIMESTAMPTZ/u);
  assert.match(schema, /ALTER TABLE automation_executions ADD COLUMN IF NOT EXISTS retry_eligible/u);
  assert.match(repository, /safeErrorMessage/u);
  assert.match(enqueue, /waiting_connection/u);
  assert.match(enqueue, /createWaitingConnectionStep/u);
});
