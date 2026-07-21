import assert from "node:assert/strict";
import fs from "node:fs";
import {
  getWorkspaceViewUrl,
  normalizeWorkspaceView,
  resolveWorkspaceView
} from "../src/lib/navigation/workspace-view";

test("primary views map to their own crawlable URLs (SEO sitelinks)", () => {
  assert.equal(getWorkspaceViewUrl("chat"), "/chat");
  assert.equal(getWorkspaceViewUrl("memory"), "/memory");
  assert.equal(getWorkspaceViewUrl("team"), "/team");
  assert.equal(getWorkspaceViewUrl("files"), "/");
  assert.equal(getWorkspaceViewUrl("settings"), "/");
});

test("per-view URLs resolve to their views and retired paths fall back to AI Chat", () => {
  assert.equal(resolveWorkspaceView("/", ""), "chat");
  assert.equal(resolveWorkspaceView("/chat", ""), "chat");
  assert.equal(resolveWorkspaceView("/memory", ""), "memory");
  assert.equal(resolveWorkspaceView("/team", ""), "team");
  assert.equal(resolveWorkspaceView("/business/customers", ""), "chat");
  assert.equal(resolveWorkspaceView("/", "?view=business"), "chat");
  assert.equal(resolveWorkspaceView("/", "?view=crm"), "chat");
  assert.equal(resolveWorkspaceView("/", "?view=automation"), "chat");
  assert.equal(resolveWorkspaceView("/", "?view=calendar"), "chat");
  assert.equal(resolveWorkspaceView("/", "?view=integrations"), "chat");
  assert.equal(resolveWorkspaceView("/", "?view=unknown"), "chat");
  assert.equal(resolveWorkspaceView("/", "?view=integrations&connected=drive"), "chat");
});

test("billing portal returns can open Settings once before the URL is cleaned", () => {
  assert.equal(resolveWorkspaceView("/", "?view=settings&billing=return"), "settings");
  assert.equal(resolveWorkspaceView("/", "?view=settings"), "chat");
  assert.equal(resolveWorkspaceView("/", "?view=settings&billing=other"), "chat");
});

test("navigation accepts sidebar and hidden views but rejects retired ones", () => {
  assert.equal(normalizeWorkspaceView("chat"), "chat");
  assert.equal(normalizeWorkspaceView("memory"), "memory");
  assert.equal(normalizeWorkspaceView("team"), "team");
  assert.equal(normalizeWorkspaceView("files"), "files");
  assert.equal(normalizeWorkspaceView("settings"), "settings");
  assert.equal(normalizeWorkspaceView("business"), null);
  assert.equal(normalizeWorkspaceView("crm"), null);
  assert.equal(normalizeWorkspaceView("automation"), null);
  assert.equal(normalizeWorkspaceView("calendar"), null);
  assert.equal(normalizeWorkspaceView("integrations"), null);
  assert.equal(normalizeWorkspaceView("canvas"), null);
  assert.equal(normalizeWorkspaceView("simulation"), null);
  assert.equal(normalizeWorkspaceView("unknown"), null);
});

test("AppShell renders only the surviving views and keeps history sync", () => {
  const source = fs.readFileSync("components/layout/AppShell.tsx", "utf8");

  assert.match(source, /resolveWorkspaceView/u);
  assert.match(source, /getWorkspaceViewUrl/u);
  assert.match(source, /history\.replaceState/u);
  assert.match(source, /onViewChange=\{navigateToView\}/u);
  assert.match(source, /dreamwish:navigate/u);
  assert.match(source, /case "chat"/u);
  assert.match(source, /case "memory"/u);
  assert.match(source, /case "team"/u);
  assert.match(source, /case "files"/u);
  assert.match(source, /case "settings"/u);
  assert.match(source, /<ChatDecisionWorkspace \/>/u);
  assert.match(source, /<TeamView \/>/u);
  assert.doesNotMatch(source, /case "crm"/u);
  assert.doesNotMatch(source, /case "business"/u);
  assert.doesNotMatch(source, /case "automation"/u);
  assert.doesNotMatch(source, /case "calendar"/u);
  assert.doesNotMatch(source, /case "integrations"/u);
  assert.doesNotMatch(source, /<CRMView/u);
  assert.doesNotMatch(source, /<BusinessHub/u);
  assert.doesNotMatch(source, /<AutomationView/u);
  assert.doesNotMatch(source, /<CalendarView/u);
  assert.doesNotMatch(source, /<IntegrationsView/u);
});
