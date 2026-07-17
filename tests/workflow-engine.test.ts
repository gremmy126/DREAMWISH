import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  evaluateCondition,
  executeScenarioGraph,
  resolvePath,
  resolveTemplate
} from "../src/lib/automation/workflow-engine";
import {
  createAutomationWebhook,
  findAutomationWebhookById,
  listAutomationWebhooks,
  recordWebhookDelivery,
  verifyWebhookSecret
} from "../src/lib/automation/webhook.repository";
import type { AutomationScenario, ScenarioNode } from "../src/lib/automation/scenario-designer";

const CONTEXT = {
  trigger: { email: { from: "kim@acme.com", subject: "견적 요청", items: ["a", "b"] } },
  steps: { ai_1: { output: { summary: "요약문" } } }
};

test("template mapping resolves trigger and step paths without eval", () => {
  assert.equal(resolveTemplate("{{trigger.email.from}}", CONTEXT), "kim@acme.com");
  assert.equal(
    resolveTemplate("제목: {{trigger.email.subject}} / {{steps.ai_1.output.summary}}", CONTEXT),
    "제목: 견적 요청 / 요약문"
  );
  assert.equal(resolveTemplate("{{trigger.email.items[1]}}", CONTEXT), "b");
  assert.equal(resolveTemplate("{{trigger.missing.deep}}", CONTEXT), "");
  assert.equal(resolvePath(CONTEXT.trigger, "email.items[0]"), "a");
});

test("condition operators evaluate against mapped values", () => {
  assert.ok(evaluateCondition({ path: "trigger.email.subject", operator: "contains", value: "견적" }, CONTEXT));
  assert.ok(!evaluateCondition({ path: "trigger.email.subject", operator: "contains", value: "환불" }, CONTEXT));
  assert.ok(evaluateCondition({ path: "trigger.email.from", operator: "ends_with", value: "acme.com" }, CONTEXT));
  assert.ok(evaluateCondition({ path: "trigger.nothing", operator: "not_exists" }, CONTEXT));
  assert.ok(evaluateCondition({ path: "trigger.email.from", operator: "regex", value: "^kim@" }, CONTEXT));
});

test("filter false skips downstream nodes instead of failing", () => {
  const scenario = graphScenario([
    node("n1", "webhook", "trigger"),
    { ...node("n2", "filter", "tool"), config: { path: "trigger.email.subject", operator: "contains", value: "환불" } },
    node("n3", "ai", "action")
  ], [edge("n1", "n2"), edge("n2", "n3")]);
  const result = executeScenarioGraph(scenario, { triggerData: CONTEXT.trigger });
  const byId = new Map(result.steps.map((step) => [step.nodeId, step]));
  assert.equal(byId.get("n2")?.status, "skipped");
  assert.equal(byId.get("n3")?.status, "skipped");
  assert.equal(result.status, "success");
});

test("router selects the labelled branch matching the mapped value", () => {
  const scenario = graphScenario([
    node("t", "webhook", "trigger"),
    { ...node("r", "router", "tool"), config: { path: "trigger.type" } },
    node("sales", "ai", "action"),
    node("support", "ai", "action"),
    node("fallback", "ai", "action")
  ], [
    edge("t", "r"),
    { ...edge("r", "sales"), label: "구매" },
    { ...edge("r", "support"), label: "기술" },
    edge("r", "fallback")
  ]);
  const result = executeScenarioGraph(scenario, { triggerData: { type: "기술" } });
  const byId = new Map(result.steps.map((step) => [step.nodeId, step]));
  assert.equal(byId.get("support")?.status, "success");
  assert.equal(byId.get("sales")?.status, "skipped");
  assert.equal(byId.get("fallback")?.status, "skipped");
});

test("mapped config reaches downstream steps and approval policy holds", () => {
  const scenario = graphScenario([
    node("t", "webhook", "trigger"),
    { ...node("g", "gmail", "action", true, "cred"), config: { to: "{{trigger.email.from}}", subject: "Re: {{trigger.email.subject}}" } }
  ], [edge("t", "g")]);
  const result = executeScenarioGraph(scenario, { triggerData: CONTEXT.trigger });
  const gmailStep = result.steps.find((step) => step.nodeId === "g");
  assert.equal(gmailStep?.status, "approval_required");
  const stored = result.context.steps.g as { config: Record<string, string> };
  assert.equal(stored.config.to, "kim@acme.com");
  assert.equal(stored.config.subject, "Re: 견적 요청");
});

test("webhooks are owner scoped, secret verified and idempotent on event id", async () => {
  await withTempDataDir(async () => {
    const webhook = await createAutomationWebhook("alice", "scenario-1");
    assert.ok(webhook.secret.length >= 24);
    assert.deepEqual(await listAutomationWebhooks("bob"), []);
    assert.ok(await findAutomationWebhookById(webhook.id));

    assert.ok(verifyWebhookSecret(webhook, { secretHeader: webhook.secret }));
    assert.ok(!verifyWebhookSecret(webhook, { secretHeader: "wrong" }));
    assert.ok(!verifyWebhookSecret(webhook, {}));

    assert.equal(await recordWebhookDelivery(webhook.id, "evt-1"), true);
    assert.equal(await recordWebhookDelivery(webhook.id, "evt-1"), false);
    assert.equal(await recordWebhookDelivery(webhook.id, "evt-2"), true);

    const again = await createAutomationWebhook("alice", "scenario-1");
    assert.equal(again.id, webhook.id);
  });
});

function node(
  id: string,
  appId: string,
  kind: "trigger" | "action" | "tool",
  requiresCredential = false,
  credentialId: string | null = null
): ScenarioNode {
  return {
    id,
    appId,
    label: appId,
    operation: "run",
    kind: kind as ScenarioNode["kind"],
    position: { x: 0, y: 0 },
    requiresCredential,
    credentialId,
    config: {}
  };
}

function edge(source: string, target: string) {
  return { id: `${source}-${target}`, source, target };
}

function graphScenario(nodes: ScenarioNode[], edges: Array<{ id: string; source: string; target: string; label?: string }>): AutomationScenario {
  return {
    id: "scenario-graph",
    ownerId: "alice",
    name: "그래프",
    description: "",
    status: "active",
    realtime: false,
    nodes,
    edges,
    runs: 0,
    successfulRuns: 0,
    lastRunAt: null,
    nextRunAt: null,
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z"
  };
}

async function withTempDataDir(run: () => Promise<void>) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dreamwish-workflow-"));
  const original = process.env.DATA_DIR;
  process.env.DATA_DIR = directory;
  try {
    await run();
  } finally {
    if (original === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = original;
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
