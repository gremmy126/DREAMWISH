import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  approveAndExecuteRun,
  buildRunApprovalPreview
} from "../src/lib/automation/run-approval";
import { getAutomationRun, recordAutomationRun } from "../src/lib/automation/run.repository";
import { saveScenario } from "../src/lib/automation/scenario.repository";
import type { AutomationScenario, ScenarioNode } from "../src/lib/automation/scenario-designer";

test("approval preview shows exact planned sends and missing config", async () => {
  await withTempDataDir(async () => {
    const { run } = await seedRun("alice");
    const preview = await buildRunApprovalPreview("alice", run.id);
    assert.ok(preview);
    assert.equal(preview!.actions.length, 3);

    const gmail = preview!.actions.find((action) => action.app === "gmail");
    assert.equal(gmail?.kind, "gmail_send");
    assert.deepEqual(gmail?.missing, []);
    assert.match(gmail!.preview, /customer@example\.com/u);
    assert.match(gmail!.preview, /월간 보고/u);

    const slack = preview!.actions.find((action) => action.app === "slack");
    assert.ok(slack!.missing.length > 0);

    // Calendar stays unsupported for auto-send; Notion is now a real sender.
    const calendar = preview!.actions.find((action) => action.app === "calendar");
    assert.equal(calendar?.kind, "unsupported");

    assert.equal(await buildRunApprovalPreview("bob", run.id), null);
  });
});

test("approval executes supported sends, fails missing config and skips unsupported", async () => {
  await withTempDataDir(async () => {
    const { run } = await seedRun("alice");
    const sent: Array<{ to: string; subject: string }> = [];

    const updated = await approveAndExecuteRun("alice", run.id, {
      sendGmail: async (_ownerId, input) => {
        sent.push({ to: input.to, subject: input.subject });
        return { ok: true, messageId: "m1" };
      },
      sendSlack: async () => ({ ok: false, error: "호출되면 안 됨" })
    });

    assert.ok(updated);
    assert.deepEqual(sent, [{ to: "customer@example.com", subject: "월간 보고" }]);

    const byApp = new Map(updated!.steps.map((step) => [step.label, step]));
    assert.equal(byApp.get("gmail")?.status, "success");
    assert.equal(byApp.get("slack")?.status, "failed");
    assert.match(byApp.get("slack")!.detail, /필요한 설정/u);
    assert.equal(byApp.get("calendar")?.status, "skipped");
    assert.equal(updated!.status, "failed");

    const persisted = await getAutomationRun("alice", run.id);
    assert.equal(persisted?.steps.find((step) => step.label === "gmail")?.status, "success");

    assert.equal(await approveAndExecuteRun("bob", run.id), null);
  });
});

test("send failure surfaces the provider error without leaking tokens", async () => {
  await withTempDataDir(async () => {
    const { run } = await seedRun("alice");
    const updated = await approveAndExecuteRun("alice", run.id, {
      sendGmail: async () => ({ ok: false, error: "Gmail 작성 권한으로 다시 연결해주세요.", code: "reconnect_required" }),
      sendSlack: async () => ({ ok: false, error: "x" })
    });
    const gmailStep = updated!.steps.find((step) => step.label === "gmail");
    assert.equal(gmailStep?.status, "failed");
    assert.match(gmailStep!.detail, /다시 연결/u);
    assert.doesNotMatch(gmailStep!.detail, /Bearer|token/iu);
  });
});

async function seedRun(ownerId: string) {
  const scenario: AutomationScenario = {
    id: `scenario_${Math.random()}`,
    ownerId,
    name: "승인 테스트",
    description: "",
    status: "active",
    realtime: false,
    nodes: [
      node("gmail", { to: "customer@example.com", subject: "월간 보고", body: "이번 달 보고입니다." }),
      node("slack", {}),
      node("calendar", { title: "x" })
    ],
    edges: [],
    runs: 1,
    successfulRuns: 1,
    lastRunAt: null,
    nextRunAt: null,
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z"
  };
  await saveScenario(ownerId, scenario);
  const run = await recordAutomationRun({
    ownerId,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    trigger: "schedule",
    status: "partial",
    steps: scenario.nodes.map((item, index) => ({
      nodeId: item.id,
      label: item.appId,
      operation: "send",
      order: index + 1,
      status: "approval_required",
      detail: "외부 전송 작업은 사용자 승인 후 실행됩니다."
    })),
    error: null,
    startedAt: "2026-07-16T00:00:00.000Z",
    finishedAt: "2026-07-16T00:00:01.000Z"
  });
  return { scenario, run };
}

function node(appId: string, config: Record<string, string>): ScenarioNode {
  return {
    id: `node_${appId}_${Math.random()}`,
    appId,
    label: appId,
    operation: "send",
    kind: "action",
    position: { x: 0, y: 0 },
    requiresCredential: true,
    credentialId: "cred",
    config
  };
}

async function withTempDataDir(run: () => Promise<void>) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dreamwish-approval-"));
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
