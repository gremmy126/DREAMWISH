import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createAutomationDraft,
  listAutomations
} from "../src/lib/automation/automation.repository";
import {
  createCalendarEvent,
  listCalendarItems
} from "../src/lib/calendar/calendar.repository";
import {
  listEnabledIntegrationApps,
  listIntegrationSyncSettings,
  saveIntegrationSyncSetting
} from "../src/lib/integrations/integration-settings.repository";
import {
  createWorkflowWorkspace,
  listWorkflowWorkspaces
} from "../src/lib/workflow/workflow.repository";

test("workspace repositories isolate every record by authenticated owner", async () => {
  await withTempDataDir(async () => {
    await createAutomationDraft({
      ownerId: "owner-a",
      name: "A automation",
      trigger: "manual",
      action: "notify"
    });
    await createAutomationDraft({
      ownerId: "owner-b",
      name: "B automation",
      trigger: "manual",
      action: "notify"
    });

    await createCalendarEvent({
      ownerId: "owner-a",
      title: "A calendar",
      startsAt: "2026-07-13T00:00:00.000Z",
      endsAt: "2026-07-13T01:00:00.000Z",
      source: "manual"
    });
    await createCalendarEvent({
      ownerId: "owner-b",
      title: "B calendar",
      startsAt: "2026-07-14T00:00:00.000Z",
      endsAt: "2026-07-14T01:00:00.000Z",
      source: "manual"
    });

    await createWorkflowWorkspace({
      ownerId: "owner-a",
      name: "A workflow",
      triggerType: "manual"
    });
    await createWorkflowWorkspace({
      ownerId: "owner-b",
      name: "B workflow",
      triggerType: "manual"
    });

    assert.deepEqual((await listAutomations("owner-a")).map((item) => item.name), [
      "A automation"
    ]);
    assert.deepEqual((await listCalendarItems("owner-a")).map((item) => item.title), [
      "A calendar"
    ]);
    assert.deepEqual((await listWorkflowWorkspaces("owner-a")).map((item) => item.name), [
      "A workflow"
    ]);
    assert.equal((await listAutomations("owner-a"))[0].ownerId, "owner-a");
    assert.equal((await listCalendarItems("owner-a"))[0].ownerId, "owner-a");
    assert.equal((await listWorkflowWorkspaces("owner-a"))[0].ownerId, "owner-a");
  });
});

test("integration settings use owner and connector as their compound identity", async () => {
  await withTempDataDir(async () => {
    await saveIntegrationSyncSetting({
      ownerId: "owner-a",
      connectorId: "gmail",
      enabled: true,
      syncDays: 7,
      commandPrefix: "A Gmail"
    });
    await saveIntegrationSyncSetting({
      ownerId: "owner-b",
      connectorId: "gmail",
      enabled: false,
      syncDays: 30,
      commandPrefix: "B Gmail"
    });

    const ownerA = await listIntegrationSyncSettings("owner-a");
    const ownerB = await listIntegrationSyncSettings("owner-b");
    assert.equal(ownerA.length, 1);
    assert.equal(ownerB.length, 1);
    assert.equal(ownerA[0].ownerId, "owner-a");
    assert.equal(ownerA[0].commandPrefix, "A Gmail");
    assert.equal(ownerB[0].ownerId, "owner-b");
    assert.equal(ownerB[0].commandPrefix, "B Gmail");
    assert.deepEqual(
      (await listEnabledIntegrationApps("owner-a")).map((item) => item.connectorId),
      ["gmail"]
    );
    assert.deepEqual(await listEnabledIntegrationApps("owner-b"), []);
  });
});

test("legacy unowned workspace data remains quarantined from every account", async () => {
  await withTempDataDir(async (dataDir) => {
    await fs.writeFile(
      path.join(dataDir, "automation.json"),
      JSON.stringify({ automations: [{ id: "legacy", name: "shared legacy" }] }),
      "utf8"
    );
    await fs.writeFile(
      path.join(dataDir, "calendar.json"),
      JSON.stringify({ events: [{ id: "legacy", title: "shared legacy" }] }),
      "utf8"
    );
    await fs.writeFile(
      path.join(dataDir, "workflow.json"),
      JSON.stringify({ workspaces: [{ id: "legacy", name: "shared legacy" }] }),
      "utf8"
    );
    await fs.writeFile(
      path.join(dataDir, "integration-settings.json"),
      JSON.stringify({ settings: [{ connectorId: "gmail", enabled: true }] }),
      "utf8"
    );

    assert.deepEqual(await listAutomations("owner-a"), []);
    assert.deepEqual(await listCalendarItems("owner-a"), []);
    assert.deepEqual(await listWorkflowWorkspaces("owner-a"), []);
    assert.deepEqual(await listIntegrationSyncSettings("owner-a"), []);
  });
});

test("workspace API routes derive repository ownership from the verified session", async () => {
  const routes = [
    "app/api/automation/automations/route.ts",
    "app/api/calendar/events/route.ts",
    "app/api/workflow/workspaces/route.ts",
    "app/api/integrations/settings/route.ts",
    "app/api/integrations/status/route.ts",
    "app/api/local/connections/accept/route.ts"
  ];

  for (const route of routes) {
    const source = await fs.readFile(path.join(process.cwd(), route), "utf8");
    assert.match(source, /requireOwnerContext\(request\)/u, route);
  }
});

async function withTempDataDir(run: (dataDir: string) => Promise<void>) {
  const previous = process.env.DATA_DIR;
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dreamwish-owner-isolation-"));
  process.env.DATA_DIR = dataDir;
  try {
    await run(dataDir);
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}
