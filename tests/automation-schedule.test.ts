import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { computeNextRunAt, parseScheduleConfig } from "../src/lib/automation/schedule";
import {
  executeScenarioSteps,
  resolveScenarioNextRun,
  runDueScenarios
} from "../src/lib/automation/scenario-scheduler";
import { listAutomationRuns } from "../src/lib/automation/run.repository";
import { saveScenario, listScenarios } from "../src/lib/automation/scenario.repository";
import type { AutomationScenario, ScenarioNode } from "../src/lib/automation/scenario-designer";

const NOW = new Date("2026-07-16T03:00:00.000Z"); // 12:00 KST

test("schedule config parses and clamps structured fields", () => {
  const schedule = parseScheduleConfig({
    scheduleKind: "weekly",
    scheduleTime: "14:30",
    scheduleWeekday: 3,
    scheduleTimezone: "Asia/Seoul"
  });
  assert.ok(schedule);
  assert.equal(schedule!.kind, "weekly");
  assert.equal(schedule!.time, "14:30");
  assert.equal(schedule!.weekday, 3);
  assert.equal(schedule!.timezone, "Asia/Seoul");
  assert.equal(parseScheduleConfig({ scheduleKind: "unknown" }), null);
  assert.equal(parseScheduleConfig(undefined), null);
});

test("daily schedule computes the next KST run across midnight boundaries", () => {
  const beforeTime = computeNextRunAt(
    { kind: "daily", time: "14:00", weekday: 1, intervalMinutes: 60, onceAt: null, timezone: "Asia/Seoul" },
    NOW
  );
  assert.equal(beforeTime, "2026-07-16T05:00:00.000Z"); // 14:00 KST today

  const afterTime = computeNextRunAt(
    { kind: "daily", time: "09:00", weekday: 1, intervalMinutes: 60, onceAt: null, timezone: "Asia/Seoul" },
    NOW
  );
  assert.equal(afterTime, "2026-07-17T00:00:00.000Z"); // 09:00 KST tomorrow
});

test("weekly, weekdays, interval and once schedules resolve correctly", () => {
  // 2026-07-16 is a Thursday.
  const weekly = computeNextRunAt(
    { kind: "weekly", time: "10:00", weekday: 1, intervalMinutes: 60, onceAt: null, timezone: "Asia/Seoul" },
    NOW
  );
  assert.equal(new Date(weekly!).getUTCDay(), 1);

  const weekdays = computeNextRunAt(
    { kind: "weekdays", time: "09:00", weekday: 1, intervalMinutes: 60, onceAt: null, timezone: "Asia/Seoul" },
    new Date("2026-07-17T12:00:00.000Z") // Friday 21:00 KST → next run Monday
  );
  assert.equal(weekdays, "2026-07-20T00:00:00.000Z");

  const interval = computeNextRunAt(
    { kind: "interval", time: "09:00", weekday: 1, intervalMinutes: 30, onceAt: null, timezone: "" },
    NOW
  );
  assert.equal(interval, new Date(NOW.getTime() + 30 * 60_000).toISOString());

  const pastOnce = computeNextRunAt(
    { kind: "once", time: "09:00", weekday: 1, intervalMinutes: 60, onceAt: "2026-01-01T00:00:00.000Z", timezone: "" },
    NOW
  );
  assert.equal(pastOnce, null);
});

test("scheduled execution respects the approval policy for external sends", () => {
  const scenario = fakeScenario("alice", [
    node("schedule", "trigger", false),
    node("ai", "action", false),
    node("gmail", "action", true, "cred-1"),
    node("slack", "action", true, null)
  ]);
  const result = executeScenarioSteps(scenario, { connectedApps: new Set(["slack"]) });
  assert.equal(result.steps[0].status, "success");
  assert.equal(result.steps[1].status, "success");
  assert.equal(result.steps[2].status, "approval_required");
  assert.equal(result.steps[3].status, "approval_required");
  assert.equal(result.status, "partial");

  const missing = executeScenarioSteps(scenario, { connectedApps: new Set() });
  assert.equal(missing.steps[3].status, "failed");
  assert.equal(missing.status, "failed");
});

test("due scenarios run once, record history and advance nextRunAt", async () => {
  await withTempDataDir(async () => {
    const scenario = fakeScenario("alice", [
      { ...node("schedule", "trigger", false), config: { scheduleKind: "daily", scheduleTime: "09:00", scheduleTimezone: "Asia/Seoul" } },
      node("ai", "action", false)
    ]);
    scenario.status = "active";
    scenario.nextRunAt = "2026-07-16T00:00:00.000Z";
    await saveScenario("alice", scenario);

    const summary = await runDueScenarios(NOW);
    assert.equal(summary.executed, 1);
    assert.equal(summary.failures, 0);

    const runs = await listAutomationRuns("alice");
    assert.equal(runs.length, 1);
    assert.equal(runs[0].trigger, "schedule");
    assert.equal(runs[0].status, "success");

    const [updated] = await listScenarios("alice");
    assert.equal(updated.runs, 1);
    assert.ok(updated.nextRunAt && new Date(updated.nextRunAt).getTime() > NOW.getTime());

    // Second pass at the same instant must not double-run.
    const second = await runDueScenarios(NOW);
    assert.equal(second.executed, 0);
    assert.equal((await listAutomationRuns("alice")).length, 1);

    assert.deepEqual(await listAutomationRuns("bob"), []);
  });
});

test("resolveScenarioNextRun returns null for paused or unscheduled scenarios", () => {
  const scenario = fakeScenario("alice", [node("ai", "action", false)]);
  scenario.status = "active";
  assert.equal(resolveScenarioNextRun(scenario, NOW), null);
  const paused = fakeScenario("alice", [
    { ...node("schedule", "trigger", false), config: { scheduleKind: "daily", scheduleTime: "09:00" } }
  ]);
  paused.status = "paused";
  assert.equal(resolveScenarioNextRun(paused, NOW), null);
});

function node(
  appId: string,
  kind: "trigger" | "action",
  requiresCredential: boolean,
  credentialId: string | null = null
): ScenarioNode {
  return {
    id: `node_${appId}_${Math.random()}`,
    appId,
    label: appId,
    operation: "run",
    kind,
    position: { x: 0, y: 0 },
    requiresCredential,
    credentialId,
    config: {}
  };
}

function fakeScenario(ownerId: string, nodes: ScenarioNode[]): AutomationScenario {
  const now = "2026-07-16T00:00:00.000Z";
  return {
    id: `scenario_${Math.random()}`,
    ownerId,
    name: "테스트 시나리오",
    description: "",
    status: "paused",
    realtime: false,
    nodes,
    edges: [],
    runs: 0,
    successfulRuns: 0,
    lastRunAt: null,
    nextRunAt: null,
    createdAt: now,
    updatedAt: now
  };
}

async function withTempDataDir(run: () => Promise<void>) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dreamwish-automation-"));
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
