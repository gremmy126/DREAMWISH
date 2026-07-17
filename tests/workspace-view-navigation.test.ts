import assert from "node:assert/strict";
import fs from "node:fs";
import {
  getWorkspaceViewUrl,
  normalizeWorkspaceView,
  resolveWorkspaceView
} from "../src/lib/navigation/workspace-view";

test("every sidebar view keeps the canonical browser URL at the AI Chat home", () => {
  for (const view of [
    "chat",
    "memory",
    "business",
    "crm",
    "automation",
    "calendar",
    "files",
    "integrations",
    "settings"
  ] as const) {
    assert.equal(getWorkspaceViewUrl(view), "/");
  }
});

test("refresh always resolves to AI Chat instead of stale or hidden workspace views", () => {
  assert.equal(resolveWorkspaceView("/", ""), "chat");
  assert.equal(resolveWorkspaceView("/business/customers", ""), "chat");
  assert.equal(resolveWorkspaceView("/", "?view=business"), "chat");
  assert.equal(resolveWorkspaceView("/", "?view=knowledge"), "chat");
  assert.equal(resolveWorkspaceView("/", "?view=workflow"), "chat");
  assert.equal(resolveWorkspaceView("/", "?view=integrations"), "chat");
  assert.equal(resolveWorkspaceView("/", "?view=unknown"), "chat");
});

test("OAuth returns can open integrations once before the URL is cleaned", () => {
  assert.equal(resolveWorkspaceView("/", "?view=integrations&connected=drive"), "integrations");
  assert.equal(resolveWorkspaceView("/", "?view=integrations&error=oauth_failed"), "integrations");
  assert.equal(resolveWorkspaceView("/", "?view=integrations&provider=firebase"), "integrations");
});

test("billing portal returns can open Settings once before the URL is cleaned", () => {
  assert.equal(resolveWorkspaceView("/", "?view=settings&billing=return"), "settings");
  assert.equal(resolveWorkspaceView("/", "?view=settings"), "chat");
  assert.equal(resolveWorkspaceView("/", "?view=settings&billing=other"), "chat");
});

test("navigation rejects views that are not present in the sidebar", () => {
  assert.equal(normalizeWorkspaceView("crm"), "crm");
  assert.equal(normalizeWorkspaceView("business"), "business");
  assert.equal(normalizeWorkspaceView("knowledge"), null);
  assert.equal(normalizeWorkspaceView("workflow"), null);
  assert.equal(normalizeWorkspaceView("unknown"), null);
});

test("AppShell synchronizes sidebar and event navigation with browser history", () => {
  const source = fs.readFileSync("components/layout/AppShell.tsx", "utf8");

  assert.match(source, /resolveWorkspaceView/u);
  assert.match(source, /getWorkspaceViewUrl/u);
  assert.match(source, /history\.replaceState/u);
  assert.match(source, /onViewChange=\{navigateToView\}/u);
  assert.match(source, /dreamwish:navigate/u);
  assert.doesNotMatch(source, /case "knowledge"/u);
  assert.doesNotMatch(source, /case "workflow"/u);
  assert.match(source, /case "crm"/u);
  assert.match(source, /<CRMView/u);
});
