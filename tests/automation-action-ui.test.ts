import assert from "node:assert/strict";
import fs from "node:fs";
import { buildActionPreview, changeScenarioAction } from "../src/lib/automation/action-ui-model";
import { createScenarioNode } from "../src/lib/automation/scenario-designer";

test("new scenario nodes persist action identity rather than a translated label", () => {
  const node = createScenarioNode("gmail", 0);
  assert.equal(node.actionId, "watch-new-email");
  assert.equal(node.actionVersion, 1);
  assert.equal(node.operation, "새 이메일 감지");

  const filter = createScenarioNode("filter", 1);
  assert.equal(filter.actionId, null);
  assert.equal(filter.actionVersion, null);
});

test("changing an action replaces stale config with action-specific defaults", () => {
  const node = createScenarioNode("gmail", 0);
  node.config = { stale: "must disappear" };
  const changed = changeScenarioAction(node, "send-email", 1);
  assert.equal(changed.actionId, "send-email");
  assert.equal(changed.operation, "이메일 보내기");
  assert.deepEqual(changed.config, {});
});

test("preview model masks secrets and includes registry risk metadata", () => {
  const preview = buildActionPreview("http", "post", 1, {
    url: "https://example.com/items",
    method: "POST",
    headers: { Authorization: "Bearer top-secret" }
  });
  assert.equal(preview?.riskLevel, "medium");
  assert.equal(preview?.targetValues.url, "https://example.com/items");
  assert.match(JSON.stringify(preview), /\*\*\*/u);
  assert.doesNotMatch(JSON.stringify(preview), /top-secret/u);
});

test("automation inspector renders registry fields and keeps Filter action-free", () => {
  const source = fs.readFileSync("components/Automation/AutomationView.tsx", "utf8");
  assert.match(source, /ActionInputForm/u);
  assert.match(source, /ActionPreviewCard/u);
  assert.match(source, /selectedNode\.appId !== "filter"/u);
  assert.match(source, /actionId/u);
  assert.match(source, /actionVersion/u);
});
