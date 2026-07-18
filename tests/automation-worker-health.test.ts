import assert from "node:assert/strict";
import fs from "node:fs";
import {
  AUTOMATION_WORKER_CAPABILITIES,
  AUTOMATION_WORKER_VERSION,
  deriveAutomationWorkerHealth,
  filterFreshCompatibleWorkers,
  type AutomationWorkerHeartbeat
} from "../src/lib/automation/queue/worker-heartbeat.repository";

const NOW = new Date("2026-07-18T12:00:30.000Z");

function heartbeat(overrides: Partial<AutomationWorkerHeartbeat> = {}): AutomationWorkerHeartbeat {
  return {
    workerId: "private-worker-identity",
    version: AUTOMATION_WORKER_VERSION,
    capabilities: [...AUTOMATION_WORKER_CAPABILITIES],
    startedAt: "2026-07-18T12:00:00.000Z",
    lastSeenAt: "2026-07-18T12:00:00.001Z",
    stoppedAt: null,
    ...overrides
  };
}

test("worker heartbeat uses a thirty-second freshness boundary and capability/version compatibility", () => {
  const fresh = heartbeat({ lastSeenAt: "2026-07-18T12:00:00.001Z" });
  const boundary = heartbeat({ workerId: "boundary", lastSeenAt: "2026-07-18T12:00:00.000Z" });
  const stale = heartbeat({ workerId: "stale", lastSeenAt: "2026-07-18T11:59:59.999Z" });
  const stopped = heartbeat({ workerId: "stopped", lastSeenAt: NOW.toISOString(), stoppedAt: NOW.toISOString() });
  const incompatible = heartbeat({ workerId: "old-version", version: "2.0.0", lastSeenAt: NOW.toISOString() });
  const missingCapability = heartbeat({ workerId: "no-automation", capabilities: ["notifications"], lastSeenAt: NOW.toISOString() });

  assert.deepEqual(
    filterFreshCompatibleWorkers([fresh, boundary, stale, stopped, incompatible, missingCapability], "automation", NOW)
      .map((item) => item.workerId),
    ["private-worker-identity", "boundary"]
  );
});

test("admin health distinguishes not configured, offline, incompatible, and healthy without exposing worker ids", () => {
  assert.equal(deriveAutomationWorkerHealth({ configured: false, records: [], now: NOW }).status, "not_configured");

  const stale = deriveAutomationWorkerHealth({
    configured: true,
    records: [heartbeat({ lastSeenAt: "2026-07-18T11:59:00.000Z" })],
    now: NOW
  });
  assert.equal(stale.status, "offline");
  assert.equal(stale.lastSeenAgeSeconds, 90);

  const incompatible = deriveAutomationWorkerHealth({
    configured: true,
    records: [heartbeat({ version: "2.0.0", lastSeenAt: NOW.toISOString() })],
    now: NOW
  });
  assert.equal(incompatible.status, "offline");
  assert.equal(incompatible.versionCompatible, false);

  const healthy = deriveAutomationWorkerHealth({
    configured: true,
    records: [heartbeat({ lastSeenAt: NOW.toISOString() })],
    now: NOW
  });
  assert.equal(healthy.status, "healthy");
  assert.equal(healthy.versionCompatible, true);
  assert.deepEqual(healthy.capabilities, AUTOMATION_WORKER_CAPABILITIES);
  assert.doesNotMatch(JSON.stringify(healthy), /private-worker-identity/u);
});

test("worker lifecycle persists registration, ten-second updates, restart replacement, and stopped state", () => {
  const repository = fs.readFileSync("src/lib/automation/queue/worker-heartbeat.repository.ts", "utf8");
  const entry = fs.readFileSync("src/lib/automation/queue/worker-entry.ts", "utf8");
  const script = fs.readFileSync("scripts/run-automation-worker.mjs", "utf8");
  assert.match(repository, /ON CONFLICT \(worker_id\) DO UPDATE/u);
  assert.match(repository, /started_at = EXCLUDED\.started_at/u);
  assert.match(repository, /stopped_at = NULL/u);
  assert.match(repository, /stopped_at =/u);
  assert.match(entry, /WORKER_HEARTBEAT_INTERVAL_MS/u);
  assert.match(entry, /registerWorkerHeartbeat/u);
  assert.match(entry, /stopWorkerHeartbeat/u);
  assert.match(script, /SIGINT/u);
  assert.match(script, /SIGTERM/u);
});

test("Railway worker and administrator UI use real heartbeat health rather than environment-only health", () => {
  const railway = fs.readFileSync("railway.automation-worker.toml", "utf8");
  const route = fs.readFileSync("app/api/admin/system/status/route.ts", "utf8");
  const ui = fs.readFileSync("components/Admin/AdminSystemStatus.tsx", "utf8");
  assert.match(railway, /npm run automation:worker/u);
  assert.match(railway, /restartPolicyMaxRetries = 10/u);
  assert.doesNotMatch(railway, /healthcheckPath|PORT/u);
  assert.match(route, /getAutomationWorkerHealth/u);
  assert.match(ui, /configured but offline|설정됐지만 오프라인/u);
  assert.match(ui, /healthy|정상/u);
  assert.doesNotMatch(route, /workerId/u);
});
