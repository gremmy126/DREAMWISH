import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { AUTOMATION_APP_DEFINITIONS, AUTOMATION_APPS, getAutomationApp } from "../src/lib/automation/app-registry";
import { listAutomationActions } from "../src/lib/automation/action-registry";
import { AUTOMATION_TOOLS } from "../src/lib/automation/tool-registry";

test("automation catalog exposes 39 unique apps and Make tools with explicit local logos and real actions", () => {
  const catalog = [...AUTOMATION_APPS, ...AUTOMATION_TOOLS];
  assert.equal(catalog.length, 39);
  assert.equal(new Set(catalog.map((item) => item.id)).size, 39);
  for (const app of AUTOMATION_APP_DEFINITIONS) {
    assert.match(app.logoPath, /^\/images\/[A-Za-z0-9_-]+\.(png|jpg)$/u);
    assert.equal(fs.existsSync(path.join(process.cwd(), "public", app.logoPath)), true, `${app.id} logo must exist`);
  }
  for (const app of AUTOMATION_APPS) {
    assert.ok(listAutomationActions(app.id).length > 0, `${app.id} must expose at least one registered action`);
  }
  assert.equal(getAutomationApp("crm")?.logoPath, "/images/dreanwishcrm.png");
});

test("automation credentials clearly identify each required key type", () => {
  assert.deepEqual(getAutomationApp("jira")?.credentialFields.map((field) => field.id), ["siteUrl", "email", "apiToken"]);
  assert.deepEqual(getAutomationApp("trello")?.credentialFields.map((field) => field.id), ["apiKey", "apiToken"]);
  assert.deepEqual(getAutomationApp("discord")?.credentialFields.map((field) => field.id), ["botToken", "serverId", "channelId"]);
  assert.deepEqual(getAutomationApp("x")?.credentialFields.map((field) => field.id), ["apiKey", "apiSecret", "accessToken", "accessTokenSecret"]);
});

test("automation apps declare truthful supported auth modes and verification contracts", () => {
  for (const app of AUTOMATION_APPS) {
    assert.ok(app.supportedAuthModes.length > 0, `${app.id} must declare at least one auth mode`);
    assert.equal(new Set(app.supportedAuthModes).size, app.supportedAuthModes.length, `${app.id} auth modes must be unique`);
    if (app.credentialFields.length > 0) assert.ok(app.verificationKind, `${app.id} credentials must have a verifier`);
  }

  assert.deepEqual(getAutomationApp("gmail")?.supportedAuthModes, ["oauth"]);
  assert.deepEqual(getAutomationApp("drive")?.oauthTarget, { provider: "google", service: "drive" });
  assert.deepEqual(getAutomationApp("github")?.supportedAuthModes, ["oauth", "token"]);
  assert.deepEqual(getAutomationApp("notion")?.supportedAuthModes, ["oauth", "token"]);
  assert.deepEqual(getAutomationApp("discord")?.supportedAuthModes, ["oauth", "multi_field"]);
  assert.equal(getAutomationApp("openai")?.verificationKind, "openai");
  assert.equal(getAutomationApp("jira")?.verificationKind, "jira");
  assert.equal(getAutomationApp("google-sheets")?.oauthTarget, undefined);
});

test("Automation tabs are interactive and module letters are replaced by app logos", () => {
  const source = fs.readFileSync("components/Automation/AutomationView.tsx", "utf8");
  const tabs = fs.readFileSync("components/Automation/AutomationTabs.tsx", "utf8");
  assert.match(source, /AutomationTabs/u);
  assert.match(source, /setActiveTab/u);
  assert.match(source, /AppLogo/u);
  assert.doesNotMatch(source, /AutomationAppLogo/u);
  assert.match(source, /ActionPicker/u);
  assert.doesNotMatch(source, /function ModuleGlyph/u);
  for (const label of ["시나리오", "템플릿", "실행 내역", "연결 관리", "사용 가이드"]) assert.match(tabs, new RegExp(label, "u"));
});

test("structured app credentials are validated and encrypted as one secret payload", () => {
  const route = fs.readFileSync("app/api/automation/credentials/route.ts", "utf8");
  const repository = fs.readFileSync("src/lib/automation/credential.repository.ts", "utf8");
  assert.match(route, /getAutomationApp/u);
  assert.match(route, /credentialFields/u);
  assert.match(route, /verifyIntegrationCredential/u);
  assert.match(route, /saveVerifiedCredential/u);
  assert.match(repository, /JSON\.stringify\(values\)/u);
  assert.match(repository, /필드/u);
});
