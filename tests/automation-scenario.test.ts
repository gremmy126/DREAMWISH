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

test("email analysis prompt compiles Gmail trigger then AI summary then Notion page", () => {
  const scenario = buildScenarioFromPrompt(
    "Gmail의 중요한 이메일을 AI로 요약해 Notion에 저장해줘",
    "owner-1"
  );

  assert.deepEqual(
    scenario.nodes.map((node) => `${node.appId}.${node.actionId}`),
    ["gmail.watch-new-email", "ai.summarize", "notion.create-page"]
  );
  assert.equal(scenario.nodes[0]?.kind, "trigger");
  assert.equal(scenario.nodes[1]?.config.input, "{{trigger.email.body}}");
  assert.equal(scenario.nodes[2]?.config.parentId, "");
  assert.equal(scenario.nodes[2]?.config.title, "{{trigger.email.subject}}");
  assert.equal(scenario.nodes[0]?.credentialId, null);
  assert.equal(scenario.nodes[2]?.credentialId, null);
  assert.equal(
    scenario.nodes[2]?.config.content,
    `{{steps.${scenario.nodes[1]?.id}.text}}`
  );
  assert.deepEqual(
    scenario.edges.map((edge) => [edge.source, edge.target]),
    [
      [scenario.nodes[0]?.id, scenario.nodes[1]?.id],
      [scenario.nodes[1]?.id, scenario.nodes[2]?.id]
    ]
  );
});

test("scenario draft preserves an explicit title and description", () => {
  const scenario = buildScenarioFromPrompt(
    "Gmail의 중요한 이메일을 AI로 요약해 Notion에 저장해줘",
    "owner-1",
    {
      title: "  고객 이메일 분석  ",
      description: "  중요 메일을 요약해서 고객 기록 페이지에 저장합니다.  "
    }
  );

  assert.equal(scenario.name, "고객 이메일 분석");
  assert.equal(scenario.description, "중요 메일을 요약해서 고객 기록 페이지에 저장합니다.");
});

test("automation scenario UI accepts and edits title and description", () => {
  const view = read("components/Automation/AutomationView.tsx");
  const route = read("app/api/automation/ai-draft/route.ts");

  assert.match(view, /시나리오 제목/u);
  assert.match(view, /시나리오 설명/u);
  assert.match(view, /title:\s*draftTitle/u);
  assert.match(view, /description:\s*draftDescription/u);
  assert.match(route, /title\?: string/u);
  assert.match(route, /description\?: string/u);
});

test("draft validation rejects disconnected nodes while connection checks remain activation-time", () => {
  const scenario = buildScenarioFromPrompt("Webhook 데이터를 HTTP API로 보내줘");
  scenario.edges = [];
  scenario.nodes[1]!.requiresCredential = true;
  scenario.nodes[1]!.credentialId = null;
  const validation = validateScenario(scenario);
  assert.equal(validation.valid, false);
  assert.equal(validation.issues.some((issue) => issue.code === "DISCONNECTED_NODE"), true);
  assert.equal(validation.issues.some((issue) => issue.code === "MISSING_CREDENTIAL"), false);
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
