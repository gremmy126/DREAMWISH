import assert from "node:assert/strict";
import { executeActionStep, type ExecutionPipelineDependencies } from "../src/lib/automation/runtime/execution-pipeline";

function dependencies(events: string[]): ExecutionPipelineDependencies {
  return {
    validateConnection: async () => { events.push("connection"); return { accountLabel: "main", scopes: ["gmail.send", "gmail.modify", "gmail.compose"], credentialStatus: "valid", rateLimitRemaining: 100 }; },
    reserveIdempotency: async () => { events.push("idempotency"); },
    checkRateLimit: async () => { events.push("rate_limit"); },
    createApproval: async () => { events.push("approval"); return { approvalRequestId: "approval-1" }; },
    executeAdapter: async () => { events.push("adapter"); return { output: { id: "message-1" } }; },
    persistResult: async () => { events.push("persist"); }
  };
}

test("high-risk pipeline creates preview and approval without calling adapter", async () => {
  const events: string[] = [];
  const result = await executeActionStep({
    ownerId: "owner", workflowId: "workflow", workflowVersion: 1, executionId: "execution",
    nodeId: "node", appId: "gmail", actionId: "permanently-delete-email", actionVersion: 1,
    integrationConnectionId: "connection", executionMode: "live", approvalPolicy: "automatic",
    input: { messageId: "message-1" }, idempotencyKey: "idem-1", approvalExpiresAt: "2099-01-01T00:00:00.000Z"
  }, dependencies(events));
  assert.equal(result.status, "waiting_warning");
  assert.deepEqual(events, ["connection", "idempotency", "rate_limit", "approval", "persist"]);
  assert.ok(result.preview);
});

test("automatic pipeline runs the adapter only after common safety checks", async () => {
  const events: string[] = [];
  const result = await executeActionStep({
    ownerId: "owner", workflowId: "workflow", workflowVersion: 1, executionId: "execution",
    nodeId: "node", appId: "gmail", actionId: "create-draft", actionVersion: 1,
    integrationConnectionId: "connection", executionMode: "live", approvalPolicy: "high_risk_two_stage",
    input: { to: "person@example.com", subject: "Hello", body: "World" }, idempotencyKey: "idem-2",
    approvalExpiresAt: "2099-01-01T00:00:00.000Z"
  }, dependencies(events));
  assert.equal(result.status, "completed");
  assert.deepEqual(events, ["connection", "idempotency", "rate_limit", "adapter", "persist"]);
});
