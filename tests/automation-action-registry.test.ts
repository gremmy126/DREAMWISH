import assert from "node:assert/strict";
import {
  ACTION_DEFINITIONS,
  getActionDefinition,
  isActionExecutable,
  listActionDefinitions
} from "../src/lib/automation/registry/action-registry";
import { listAutomationActions } from "../src/lib/automation/action-registry";
import { validateActionInput } from "../src/lib/automation/registry/schema-runtime";
import fs from "node:fs";

test("action registry is serializable, versioned, and unique", () => {
  assert.ok(ACTION_DEFINITIONS.length >= 180);
  const identities = ACTION_DEFINITIONS.map(
    (action) => `${action.appId}:${action.id}:${action.version}`
  );
  assert.equal(new Set(identities).size, identities.length);

  for (const action of ACTION_DEFINITIONS) {
    assert.ok(action.version >= 1, `${action.appId}.${action.id} must be versioned`);
    assert.ok(action.adapterKey, `${action.appId}.${action.id} needs an adapter key`);
    assert.ok(action.adapterVersion >= 1, `${action.appId}.${action.id} needs an adapter version`);
    assert.ok(action.outputSchemaVersion >= 1);
    assert.doesNotThrow(() => JSON.stringify(action));
  }
});

test("Gmail exposes only its real actions with action-specific fields", () => {
  assert.deepEqual(
    listActionDefinitions("gmail").map((action) => action.name),
    [
      "새 이메일 감지",
      "이메일 보내기",
      "이메일 답장",
      "이메일 전달",
      "초안 생성",
      "이메일 영구 삭제",
      "읽음 처리",
      "안읽음 처리",
      "보관",
      "라벨 추가",
      "라벨 제거",
      "첨부파일 다운로드",
      "첨부파일 저장",
      "메일 검색"
    ]
  );

  assert.deepEqual(
    getActionDefinition("gmail", "send-email")?.inputSchema.fields.map((field) => field.id),
    ["to", "cc", "bcc", "subject", "body", "attachments"]
  );
  assert.deepEqual(
    getActionDefinition("gmail", "reply-email")?.inputSchema.fields.map((field) => field.id),
    ["messageId", "body"]
  );
});

test("Notion actions do not reuse one generic form", () => {
  assert.deepEqual(
    getActionDefinition("notion", "create-database-item")?.inputSchema.fields.map(
      (field) => field.id
    ),
    ["databaseId", "title", "properties", "content", "icon", "cover"]
  );
  assert.deepEqual(
    getActionDefinition("notion", "update-page")?.inputSchema.fields.map(
      (field) => field.id
    ),
    ["pageId", "properties", "content"]
  );
});

test("AI analysis actions are executable and expose text output for downstream mappings", () => {
  const summarize = getActionDefinition("ai", "summarize");
  assert.ok(summarize);
  assert.equal(isActionExecutable("ai", "summarize"), true);
  assert.ok(summarize!.outputSchema.fields.some((field) => field.id === "text"));
});

test("OpenAI automation uses the selected verified user credential", () => {
  const source = fs.readFileSync("src/lib/automation/adapters/ai.adapter.ts", "utf8");
  assert.match(source, /resolveStructuredActionCredential/u);
  assert.match(source, /OpenAICompatibleProvider/u);
  assert.match(source, /input\.connectionId/u);
});

test("newly supported messaging and YouTube actions are executable", () => {
  for (const [appId, actionId] of [
    ["gmail", "reply-email"],
    ["discord", "send-channel-message"],
    ["discord", "send-direct-message"],
    ["telegram", "send-message"],
    ["telegram", "send-photo"],
    ["youtube", "update-video"],
    ["youtube", "add-playlist-item"]
  ] as const) {
    assert.equal(isActionExecutable(appId, actionId), true, `${appId}.${actionId} should be executable`);
  }
});

test("every catalogued Google Microsoft Dropbox and messaging action has a concrete adapter", () => {
  const coveredApps = new Set([
    "gmail", "google-sheets", "calendar", "drive", "youtube",
    "outlook", "microsoft-teams", "onedrive", "dropbox",
    "slack", "discord", "telegram"
  ]);
  const missing = ACTION_DEFINITIONS
    .filter((action) => coveredApps.has(action.appId))
    .filter((action) => !isActionExecutable(action.appId, action.id, action.version))
    .map((action) => action.adapterKey);
  assert.deepEqual(missing, []);
});

test("Filter has no actions and generic fallbacks are removed", () => {
  assert.deepEqual(listActionDefinitions("filter"), []);
  assert.deepEqual(
    listActionDefinitions("airtable").map((action) => action.name),
    ["레코드 생성", "레코드 수정", "레코드 삭제", "레코드 조회"]
  );
  assert.deepEqual(listActionDefinitions("unknown-app"), []);
  assert.deepEqual(listAutomationActions("unknown-app"), []);
  assert.equal(listAutomationActions("gmail").length, 14);
});

test("destructive, financial, deployment, and bulk actions carry mandatory risk", () => {
  assert.deepEqual(
    [
      getActionDefinition("gmail", "permanently-delete-email")?.riskLevel,
      getActionDefinition("stripe", "refund")?.riskLevel,
      getActionDefinition("github", "create-release")?.riskLevel,
      getActionDefinition("shopify", "refund-order")?.riskLevel
    ],
    ["high", "critical", "high", "critical"]
  );
  assert.equal(getActionDefinition("gmail", "permanently-delete-email")?.confirmationPhrase, "DELETE");
  assert.equal(getActionDefinition("stripe", "refund")?.confirmationPhrase, "REFUND");
  assert.equal(getActionDefinition("github", "create-release")?.confirmationPhrase, "DEPLOY");
});

test("shared schema validation normalizes fields and rejects invalid values", () => {
  const action = getActionDefinition("gmail", "send-email");
  assert.ok(action);

  const invalid = validateActionInput(action!, {
    to: "not-an-email",
    subject: "Hello",
    body: "World"
  });
  assert.equal(invalid.valid, false);
  assert.equal(invalid.errors.to, "올바른 이메일 주소를 입력하세요.");

  const valid = validateActionInput(action!, {
    to: " person@example.com ",
    cc: "",
    bcc: "",
    subject: " Hello ",
    body: "World",
    attachments: []
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.value.to, "person@example.com");
  assert.equal(valid.value.subject, "Hello");
});
