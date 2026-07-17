import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pollGmailForScenario } from "../src/lib/automation/gmail-trigger";
import {
  listAutomationRuns,
  listDueWaitingRuns,
  recordAutomationRun
} from "../src/lib/automation/run.repository";
import { resumeDueWaitingRuns } from "../src/lib/automation/scenario-scheduler";
import { saveScenario } from "../src/lib/automation/scenario.repository";
import {
  verifyGitHubSignature,
  verifySlackSignature
} from "../src/lib/automation/webhook.repository";
import { executeScenarioGraph } from "../src/lib/automation/workflow-engine";
import type { AutomationScenario, ScenarioNode } from "../src/lib/automation/scenario-designer";

test("iterator expands the next node per item with mapped configs and aggregator counts", () => {
  const scenario = graphScenario([
    node("t", "webhook", "trigger"),
    { ...node("it", "iterator", "tool"), config: { path: "trigger.customers", maxItems: 5 } },
    { ...node("g", "gmail", "action", true, "cred"), config: { to: "{{item.email}}", subject: "안내: {{item.name}}" } },
    node("agg", "aggregator", "tool")
  ], [edge("t", "it"), edge("it", "g"), edge("g", "agg")]);

  const result = executeScenarioGraph(scenario, {
    triggerData: {
      customers: [
        { name: "김철수", email: "kim@a.com" },
        { name: "이영희", email: "lee@b.com" }
      ]
    }
  });
  const itemSteps = result.steps.filter((step) => step.nodeId.startsWith("g#"));
  assert.equal(itemSteps.length, 2);
  assert.equal(itemSteps[0].status, "approval_required");
  assert.equal(itemSteps[0].resolvedConfig?.to, "kim@a.com");
  assert.equal(itemSteps[1].resolvedConfig?.subject, "안내: 이영희");
  const aggStep = result.steps.find((step) => step.nodeId === "agg");
  assert.match(aggStep!.detail, /총 2건/u);
  assert.match(aggStep!.detail, /승인 대기 2/u);
});

test("delay node parks the run as waiting and resume executes only remaining nodes", () => {
  const scenario = graphScenario([
    node("t", "webhook", "trigger"),
    { ...node("d", "delay", "tool"), config: { delayMinutes: 10 } },
    node("ai", "ai", "action")
  ], [edge("t", "d"), edge("d", "ai")]);

  const first = executeScenarioGraph(scenario, { triggerData: { x: 1 } });
  assert.equal(first.status, "waiting");
  assert.ok(first.waiting);
  assert.ok(new Date(first.waiting!.resumeAt).getTime() > Date.now());
  assert.ok(first.waiting!.completedNodeIds.includes("d"));
  assert.ok(!first.steps.some((step) => step.nodeId === "ai"));

  const resumed = executeScenarioGraph(scenario, {
    resume: { context: first.context, completedNodeIds: first.waiting!.completedNodeIds }
  });
  assert.equal(resumed.status, "success");
  assert.deepEqual(resumed.steps.map((step) => step.nodeId), ["ai"]);
});

test("scheduler resumes due waiting runs and appends the remaining steps", async () => {
  await withTempDataDir(async () => {
    const scenario = graphScenario([
      node("t", "webhook", "trigger"),
      { ...node("d", "delay", "tool"), config: { delayMinutes: 10 } },
      node("ai", "ai", "action")
    ], [edge("t", "d"), edge("d", "ai")]);
    await saveScenario("alice", scenario);

    const first = executeScenarioGraph(scenario, { triggerData: {} });
    await recordAutomationRun({
      ownerId: "alice",
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      trigger: "manual",
      status: "waiting",
      steps: first.steps,
      waiting: {
        ...first.waiting!,
        resumeAt: new Date(Date.now() - 1000).toISOString(),
        context: first.context
      },
      error: null,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString()
    });

    assert.equal((await listDueWaitingRuns()).length, 1);
    const resumed = await resumeDueWaitingRuns();
    assert.equal(resumed, 1);
    const [run] = await listAutomationRuns("alice");
    assert.equal(run.status, "success");
    assert.ok(run.steps.some((step) => step.nodeId === "ai"));
    assert.equal(run.waiting, null);
    assert.equal((await listDueWaitingRuns()).length, 0);
  });
});

test("GitHub and Slack signatures verify and reject tampering or replays", () => {
  const webhook = { secret: "shhh-secret" };
  const body = '{"action":"opened"}';
  const githubSig = `sha256=${createHmac("sha256", webhook.secret).update(body).digest("hex")}`;
  assert.ok(verifyGitHubSignature(webhook, githubSig, body));
  assert.ok(!verifyGitHubSignature(webhook, githubSig, body + "x"));
  assert.ok(!verifyGitHubSignature(webhook, null, body));

  const now = new Date();
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const slackSig = `v0=${createHmac("sha256", webhook.secret).update(`v0:${timestamp}:${body}`).digest("hex")}`;
  assert.ok(verifySlackSignature(webhook, slackSig, timestamp, body, now));
  assert.ok(!verifySlackSignature(webhook, slackSig, timestamp, body + "x", now));
  const staleTimestamp = String(Math.floor(now.getTime() / 1000) - 600);
  const staleSig = `v0=${createHmac("sha256", webhook.secret).update(`v0:${staleTimestamp}:${body}`).digest("hex")}`;
  assert.ok(!verifySlackSignature(webhook, staleSig, staleTimestamp, body, now));
});

test("Gmail polling runs the workflow per new message and dedupes across passes", async () => {
  await withTempDataDir(async () => {
    const scenario = graphScenario([
      { ...node("s", "schedule", "trigger"), config: { watchGmail: true, scheduleKind: "interval", scheduleIntervalMinutes: 5 } },
      { ...node("g", "gmail", "action", true, "cred"), config: { to: "{{trigger.email.from}}" } }
    ], [edge("s", "g")]);
    await saveScenario("alice", scenario);

    const fetchFn: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/messages?") || url.includes("/messages?q") || url.includes("q=")) {
        return new Response(JSON.stringify({ messages: [{ id: "m1" }, { id: "m2" }] }), { status: 200 });
      }
      const id = url.includes("/m1") ? "m1" : "m2";
      return new Response(
        JSON.stringify({
          id,
          snippet: "본문 요약",
          internalDate: id === "m1" ? "1700000001000" : "1700000002000",
          payload: { headers: [
            { name: "From", value: `${id}@acme.com` },
            { name: "Subject", value: "견적 요청" }
          ] }
        }),
        { status: 200 }
      );
    };

    const first = await pollGmailForScenario(scenario, {
      fetchFn,
      getToken: async () => "token"
    });
    assert.equal(first.newMessages, 2);

    const runs = await listAutomationRuns("alice");
    assert.equal(runs.length, 2);
    assert.equal(
      (runs[1].triggerData as { email?: { from?: string } })?.email?.from,
      "m1@acme.com"
    );
    const gmailStep = runs[0].steps.find((step) => step.nodeId === "g");
    assert.equal(gmailStep?.status, "approval_required");
    assert.match(String(gmailStep?.resolvedConfig?.to), /@acme\.com$/u);

    const second = await pollGmailForScenario(scenario, {
      fetchFn,
      getToken: async () => "token"
    });
    assert.equal(second.newMessages, 0);
    assert.equal((await listAutomationRuns("alice")).length, 2);

    const noToken = await pollGmailForScenario(scenario, {
      fetchFn,
      getToken: async () => null
    });
    assert.equal(noToken.skippedReason, "no_token");
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
    id: `scenario_${Math.random()}`,
    ownerId: "alice",
    name: "트리거 테스트",
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
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dreamwish-triggers-"));
  const original = process.env.DATA_DIR;
  const originalDb = process.env.DATABASE_URL;
  process.env.DATA_DIR = directory;
  delete process.env.DATABASE_URL;
  try {
    await run();
  } finally {
    if (original === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = original;
    if (originalDb !== undefined) process.env.DATABASE_URL = originalDb;
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
