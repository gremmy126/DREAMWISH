import assert from "node:assert/strict";
import fs from "node:fs";
import { ACTION_DEFINITIONS, isActionExecutable } from "../src/lib/automation/registry/action-registry";

test("every executable action has complete registry guide metadata", () => {
  for (const definition of ACTION_DEFINITIONS.filter((item) => isActionExecutable(item.appId, item.id, item.version))) {
    assert.ok(definition.guide.useWhen.trim(), `${definition.appId}:${definition.id}:useWhen`);
    assert.ok(definition.guide.setupSteps.length > 0, `${definition.appId}:${definition.id}:setup`);
    for (const field of definition.inputSchema.fields.filter((item) => item.required)) {
      assert.ok(field.help?.trim(), `${definition.appId}:${definition.id}:${field.id}:help`);
      assert.ok(field.valueSource?.trim(), `${definition.appId}:${definition.id}:${field.id}:source`);
      if (!field.secret) assert.ok(field.example !== undefined, `${definition.appId}:${definition.id}:${field.id}:example`);
    }
  }
});

test("automation tabs exclude audit and DLQ while guide exposes registry details", () => {
  const tabs = fs.readFileSync("components/Automation/AutomationTabs.tsx", "utf8");
  const view = fs.readFileSync("components/Automation/AutomationView.tsx", "utf8");
  assert.doesNotMatch(tabs, /감사 로그|관리자 DLQ|"audit"|"dlq"/u);
  assert.doesNotMatch(view, /AuditLogView|AdminDlqView|activeTab === "audit"|activeTab === "dlq"/u);
  const guide = fs.readFileSync("components/Automation/AutomationActionGuide.tsx", "utf8");
  assert.match(guide, /ACTION_DEFINITIONS/u);
  assert.match(guide, /언제 사용|값을 어디서|매핑/u);
});

test("mapping sources list only reachable trigger and predecessor outputs", () => {
  const { listMappingSources } = require("../src/lib/automation/registry/action-guide") as
    typeof import("../src/lib/automation/registry/action-guide");
  const now = new Date().toISOString();
  const scenario = {
    id: "scenario-guide",
    ownerId: "owner-a",
    name: "메일 분석",
    description: "",
    status: "draft" as const,
    realtime: false,
    nodes: [
      node("gmail-node", "gmail", "watch-new-email", "trigger"),
      node("ai-node", "ai", "summarize", "action"),
      node("notion-node", "notion", "create-page", "action"),
      node("unreachable", "github", "create-issue", "action")
    ],
    edges: [
      { id: "e1", source: "gmail-node", target: "ai-node" },
      { id: "e2", source: "ai-node", target: "notion-node" }
    ],
    runs: 0,
    successfulRuns: 0,
    lastRunAt: null,
    nextRunAt: null,
    createdAt: now,
    updatedAt: now
  };
  const sources = listMappingSources(scenario, "notion-node");
  assert.ok(sources.some((item) => item.template === "{{trigger.email.subject}}"));
  assert.ok(sources.some((item) => item.template === "{{steps.ai-node.text}}"));
  assert.ok(sources.every((item) => item.nodeId !== "unreachable"));
});

function node(id: string, appId: string, actionId: string, kind: "trigger" | "action") {
  return {
    id,
    appId,
    label: id,
    actionId,
    actionVersion: 1,
    operation: actionId,
    kind,
    position: { x: 0, y: 0 },
    requiresCredential: false,
    credentialId: null,
    config: {}
  };
}
