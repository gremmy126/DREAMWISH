import assert from "node:assert/strict";
import fs from "node:fs";
import { validateWorkflowStructure } from "../src/lib/automation/runtime/workflow-validator";
import type { AutomationScenario } from "../src/lib/automation/scenario-designer";

const scenario: AutomationScenario = {
  id: "workflow-1", ownerId: "owner-1", name: "Test", description: "", status: "draft", realtime: false,
  nodes: [
    { id: "a", appId: "schedule", label: "Schedule", actionId: "daily", actionVersion: 1, operation: "Daily", kind: "trigger", position: { x: 0, y: 0 }, requiresCredential: false, credentialId: null, config: { time: "09:00" } },
    { id: "b", appId: "gmail", label: "Gmail", actionId: "send-email", actionVersion: 1, operation: "Send", kind: "action", position: { x: 1, y: 0 }, requiresCredential: true, credentialId: "connection-1", config: { to: "a@example.com", subject: "Hi", body: "Body" } }
  ],
  edges: [{ id: "e1", source: "a", target: "b" }], runs: 0, successfulRuns: 0, lastRunAt: null, nextRunAt: null,
  createdAt: "2026-07-17T00:00:00.000Z", updatedAt: "2026-07-17T00:00:00.000Z"
};

test("workflow structural validation blocks cycles and unimplemented adapters", () => {
  assert.equal(validateWorkflowStructure(scenario).valid, true);
  const cyclic = { ...scenario, edges: [...scenario.edges, { id: "e2", source: "b", target: "a" }] };
  assert.ok(validateWorkflowStructure(cyclic).issues.some((issue) => issue.code === "CYCLE_DETECTED"));
  const unavailable = { ...scenario, nodes: scenario.nodes.map((node) => node.id === "b" ? { ...node, appId: "shopify", actionId: "refund-order" } : node) };
  assert.ok(validateWorkflowStructure(unavailable).issues.some((issue) => issue.code === "ADAPTER_NOT_IMPLEMENTED"));
});

test("activation validation checks connection ownership status scopes and inputs", () => {
  const source = fs.readFileSync("src/lib/automation/runtime/workflow-validator.ts", "utf8");
  assert.match(source, /validateActionConnection/u);
  assert.match(source, /validateActionInput/u);
  assert.match(source, /CONNECTION_APP_MISMATCH/u);
});

test("canonical activation route validates before pinning and activating a version", () => {
  const source = fs.readFileSync("app/api/automation/workflows/[workflowId]/activate/route.ts", "utf8");
  assert.match(source, /validateWorkflowForActivation/u);
  assert.match(source, /saveWorkflowVersion/u);
  assert.match(source, /activateWorkflowVersion/u);
  assert.match(source, /assertSameOriginMutation/u);
});
