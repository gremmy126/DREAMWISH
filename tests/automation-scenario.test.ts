import assert from "node:assert/strict";
import fs from "node:fs";
import {
  AUTOMATION_MODULES,
  buildScenarioFromPrompt,
  validateScenario
} from "../src/lib/automation/scenario-designer";

test("automation module catalog exposes common Make-style apps and tools", () => {
  for (const id of [
    "gmail",
    "slack",
    "notion",
    "google-sheets",
    "calendar",
    "discord",
    "telegram",
    "webhook",
    "http",
    "router",
    "filter",
    "delay"
  ]) {
    assert.equal(AUTOMATION_MODULES.some((module) => module.id === id), true, id);
  }
});

test("AI chat automation command becomes an editable scenario draft", () => {
  const scenario = buildScenarioFromPrompt(
    "매일 오전 9시에 Gmail 새 메일을 확인해서 AI로 요약하고 Slack에 보내줘"
  );
  assert.equal(scenario.status, "draft");
  assert.equal(scenario.nodes[0]?.kind, "trigger");
  assert.equal(scenario.nodes.some((node) => node.appId === "gmail"), true);
  assert.equal(scenario.nodes.some((node) => node.appId === "slack"), true);
  assert.equal(scenario.nodes.some((node) => node.appId === "ai"), true);
  assert.equal(validateScenario(scenario).valid, true);
});

test("scenario validation rejects unsafe disconnected and unconfigured nodes", () => {
  const scenario = buildScenarioFromPrompt("Webhook 데이터를 HTTP API로 보내줘");
  scenario.edges = [];
  scenario.nodes[1]!.requiresCredential = true;
  scenario.nodes[1]!.credentialId = null;
  const validation = validateScenario(scenario);
  assert.equal(validation.valid, false);
  assert.equal(validation.issues.some((issue) => issue.code === "DISCONNECTED_NODE"), true);
  assert.equal(validation.issues.some((issue) => issue.code === "MISSING_CREDENTIAL"), true);
});

test("automation workspace exposes canvas lifecycle and encrypted credential APIs", () => {
  const view = read("components/Automation/AutomationView.tsx");
  const api = read("app/api/automation/scenarios/route.ts");
  const itemApi = read("app/api/automation/scenarios/[scenarioId]/route.ts");
  const runApi = read("app/api/automation/scenarios/[scenarioId]/run/route.ts");
  const credentials = read("src/lib/automation/credential.repository.ts");
  const chat = read("components/Chat/ChatView.tsx");
  const shell = read("components/layout/AppShell.tsx");

  assert.match(view, /ReactFlow/u);
  assert.match(view, /ModuleCatalog/u);
  assert.match(view, /ScenarioInspector/u);
  assert.match(view, /실행/u);
  assert.match(view, /삭제/u);
  assert.match(api, /requireOwnerContext/u);
  assert.match(itemApi, /DELETE/u);
  assert.match(runApi, /validateScenario/u);
  assert.match(credentials, /aes-256-gcm/u);
  assert.doesNotMatch(credentials, /secretValue\s*:/u);
  assert.doesNotMatch(read("src/lib/automation/scenario-designer.ts"), /function module\(/u);
  assert.match(chat, /\/api\/automation\/ai-draft/u);
  assert.match(chat, /dreamwish:navigate/u);
  assert.match(shell, /dreamwish:navigate/u);
});

function read(file: string) {
  assert.equal(fs.existsSync(file), true, `${file} must exist`);
  return fs.readFileSync(file, "utf8");
}
