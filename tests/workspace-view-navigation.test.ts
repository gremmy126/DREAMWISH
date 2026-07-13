import assert from "node:assert/strict";
import fs from "node:fs";
import {
  getWorkspaceViewUrl,
  resolveWorkspaceView
} from "../src/lib/navigation/workspace-view";

test("AI Chat always maps to the root home URL", () => {
  assert.equal(getWorkspaceViewUrl("chat"), "/");
  assert.equal(getWorkspaceViewUrl("business"), "/?view=business");
  assert.equal(getWorkspaceViewUrl("crm"), "/?view=business");
});

test("root resolves to AI Chat while explicit business deep links remain supported", () => {
  assert.equal(resolveWorkspaceView("/", ""), "chat");
  assert.equal(resolveWorkspaceView("/business/customers", ""), "business");
  assert.equal(resolveWorkspaceView("/", "?view=integrations"), "integrations");
  assert.equal(resolveWorkspaceView("/", "?view=crm"), "business");
  assert.equal(resolveWorkspaceView("/", "?view=unknown"), "chat");
});

test("AppShell synchronizes sidebar and event navigation with browser history", () => {
  const source = fs.readFileSync("components/layout/AppShell.tsx", "utf8");

  assert.match(source, /resolveWorkspaceView/u);
  assert.match(source, /getWorkspaceViewUrl/u);
  assert.match(source, /history\.replaceState/u);
  assert.match(source, /onViewChange=\{navigateToView\}/u);
  assert.match(source, /dreamwish:navigate/u);
});
