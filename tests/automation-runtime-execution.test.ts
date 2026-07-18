import assert from "node:assert/strict";
import fs from "node:fs";
import { descendantNodeIds, orderedWorkflowNodes } from "../src/lib/automation/runtime/workflow-runner";
import { validateWorkflowForExecution } from "../src/lib/automation/runtime/workflow-validator";
import type { AutomationScenario } from "../src/lib/automation/scenario-designer";

const base: AutomationScenario = {
  id: "workflow-1", ownerId: "owner-1", name: "Runtime", description: "", status: "active", realtime: false,
  nodes: [
    { id: "trigger", appId: "schedule", label: "Schedule", actionId: "daily", actionVersion: 1, operation: "Daily", kind: "trigger", position: { x: 0, y: 0 }, requiresCredential: false, credentialId: null, config: { time: "09:00" } },
    { id: "filter", appId: "filter", label: "Filter", actionId: null, actionVersion: null, operation: "Condition", kind: "tool", position: { x: 1, y: 0 }, requiresCredential: false, credentialId: null, config: { path: "trigger.enabled", operator: "equals", value: "true" } },
    { id: "send", appId: "gmail", label: "Gmail", actionId: "send-email", actionVersion: 1, operation: "Send", kind: "action", position: { x: 2, y: 0 }, requiresCredential: true, credentialId: "connection-1", config: { to: "a@example.com", subject: "Hi", body: "Body" } }
  ],
  edges: [
    { id: "e1", source: "trigger", target: "filter" },
    { id: "e2", source: "filter", target: "send" }
  ],
  runs: 0, successfulRuns: 0, lastRunAt: null, nextRunAt: null,
  createdAt: "2026-07-17T00:00:00.000Z", updatedAt: "2026-07-17T00:00:00.000Z"
};

test("runtime orders pinned workflow nodes and identifies filter descendants", () => {
  assert.deepEqual(orderedWorkflowNodes(base).map((node) => node.id), ["trigger", "filter", "send"]);
  assert.deepEqual([...descendantNodeIds(base, "filter")], ["send"]);
});

test("workflow validation reports insufficient scopes before queueing", async () => {
  const result = await validateWorkflowForExecution("owner-1", base, {
    validateConnection: async () => {
      throw Object.assign(new Error("필요한 OAuth Scope가 없습니다: gmail.send"), {
        code: "SCOPE_INSUFFICIENT",
        missingScopes: ["gmail.send"]
      });
    }
  });
  assert.equal(result.canQueue, false);
  assert.equal(result.findings[0]?.code, "SCOPE_INSUFFICIENT");
  assert.deepEqual(result.findings[0]?.fields, ["gmail.send"]);
  assert.equal(result.findings[0]?.remediation?.deepLink, "/?view=automation&app=gmail&node=send");
});

test("canonical execute route creates a durable execution and queue job", () => {
  const source = fs.readFileSync("app/api/automation/workflows/[workflowId]/execute/route.ts", "utf8");
  const enqueue = fs.readFileSync("src/lib/automation/runtime/execution-enqueue.service.ts", "utf8");
  assert.match(source, /enqueueScenarioExecution/u);
  assert.match(enqueue, /createExecution/u);
  assert.match(enqueue, /jobType:\s*"execute_workflow"/u);
  assert.match(enqueue, /PostgresAutomationQueue/u);
  assert.match(source, /assertSameOriginMutation/u);
});

test("queue insertion performs connection preflight and persists a waiting execution without a job", () => {
  const enqueue = fs.readFileSync("src/lib/automation/runtime/execution-enqueue.service.ts", "utf8");
  assert.match(enqueue, /validateWorkflowForExecution/u);
  assert.match(enqueue, /status:[^\n]+"waiting_connection"/u);
  assert.match(enqueue, /queued:\s*false/u);
  assert.match(enqueue, /job:\s*null/u);
  assert.match(enqueue, /findings:\s*preflight\.findings/u);
});

test("default worker handles initial and approved resume jobs through the common pipeline", () => {
  const entry = fs.readFileSync("src/lib/automation/queue/worker-entry.ts", "utf8");
  const runner = fs.readFileSync("src/lib/automation/runtime/workflow-runner.ts", "utf8");
  assert.match(entry, /createDefaultAutomationJobHandlers/u);
  assert.match(runner, /executeActionStep/u);
  assert.match(runner, /executeRegisteredActionAdapter/u);
  assert.match(runner, /verifyApprovalSnapshot/u);
  assert.match(runner, /leaseStepRunForResume/u);
  assert.match(runner, /status:\s*"skipped"/u);
});

test("automation UI uses the canonical queued execution route", () => {
  const source = fs.readFileSync("components/Automation/AutomationView.tsx", "utf8");
  assert.match(source, /\/api\/automation\/workflows\/\$\{scenario\.id\}\/execute/u);
  assert.doesNotMatch(source, /\/api\/automation\/scenarios\/\$\{scenario\.id\}\/run/u);
});

test("scheduled Gmail and webhook production paths enqueue durable executions", () => {
  const scheduler = fs.readFileSync("src/lib/automation/scenario-scheduler.ts", "utf8");
  const gmail = fs.readFileSync("src/lib/automation/gmail-trigger.ts", "utf8");
  const webhook = fs.readFileSync("app/api/webhooks/automation/[webhookId]/route.ts", "utf8");
  assert.match(scheduler, /enqueueScenarioExecution/u);
  assert.match(gmail, /enqueueScenarioExecution/u);
  assert.match(webhook, /enqueueScenarioExecution/u);
  assert.doesNotMatch(webhook, /executeScenarioGraph/u);
  assert.match(webhook, /triggerEventId/u);
});

test("trigger payloads are encrypted outside the Queue safe payload", () => {
  const enqueue = fs.readFileSync("src/lib/automation/runtime/execution-enqueue.service.ts", "utf8");
  const repository = fs.readFileSync("src/lib/automation/runtime/trigger-payload.repository.ts", "utf8");
  assert.match(enqueue, /saveExecutionTriggerPayload/u);
  assert.match(repository, /encryptToken/u);
  assert.match(repository, /payload_hash/u);
  assert.doesNotMatch(enqueue, /safePayload:\s*input\.triggerData/u);
});

test("workflow versions persist and execute immutable ActionDefinition snapshots", () => {
  const repository = fs.readFileSync("src/lib/automation/runtime/workflow.repository.ts", "utf8");
  const runner = fs.readFileSync("src/lib/automation/runtime/workflow-runner.ts", "utf8");
  const approval = fs.readFileSync("src/lib/automation/approval/approval.service.ts", "utf8");
  assert.match(repository, /automation_action_snapshots/u);
  assert.match(repository, /definition_json/u);
  assert.match(repository, /getPinnedWorkflowActionDefinition/u);
  assert.match(runner, /getPinnedWorkflowActionDefinition/u);
  assert.match(approval, /getPinnedWorkflowActionDefinition/u);
});

test("worker supervisor expires approvals and dispatches the notification outbox durably", () => {
  const entry = fs.readFileSync("src/lib/automation/queue/worker-entry.ts", "utf8");
  const notifications = fs.readFileSync("src/lib/automation/queue/notification-worker.ts", "utf8");
  assert.match(entry, /expireAllDueApprovals/u);
  assert.match(entry, /NotificationOutboxWorker/u);
  assert.match(notifications, /claimNotification/u);
  assert.match(notifications, /recordNotificationInbox/u);
  assert.match(notifications, /markNotificationSent/u);
});
