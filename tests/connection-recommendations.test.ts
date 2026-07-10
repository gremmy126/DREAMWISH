import assert from "node:assert/strict";
import { externalConnectionTargets } from "../src/lib/connections/external-actions";
import { buildKnowledgeTabModel } from "../src/lib/knowledge/knowledge-tabs";

test("connection recommendations include every integration app target", () => {
  const ids = externalConnectionTargets.map((target) => target.id).sort();
  assert.deepEqual(ids, [
    "browser",
    "calendar",
    "discord",
    "drive",
    "firebase",
    "github",
    "gmail",
    "local-files",
    "notion",
    "slack",
    "webhook"
  ]);
});

test("knowledge recommendations expose integration apps for acceptance", () => {
  const model = buildKnowledgeTabModel([]);
  const targetIds = model.recommendations.map((recommendation) => recommendation.targetId);
  assert.ok(targetIds.includes("gmail"));
  assert.ok(targetIds.includes("notion"));
  assert.ok(targetIds.includes("discord"));
  assert.ok(targetIds.includes("webhook"));
});
