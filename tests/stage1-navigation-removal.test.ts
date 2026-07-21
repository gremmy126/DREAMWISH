import assert from "node:assert/strict";
import fs from "node:fs";
import {
  HIDDEN_WORKSPACE_VIEWS,
  RETIRED_WORKSPACE_VIEWS,
  SIDEBAR_NAV_ORDER
} from "../components/layout/types";

test("sidebar exposes only AI Chat, Memory, and Team", () => {
  assert.deepEqual([...SIDEBAR_NAV_ORDER], ["chat", "memory", "team"]);
});

test("automation, integrations, business, CRM, and calendar are retired from menus", () => {
  assert.deepEqual(
    [...RETIRED_WORKSPACE_VIEWS].sort(),
    ["automation", "business", "calendar", "crm", "integrations"]
  );
  const sidebarSource = fs.readFileSync("components/layout/Sidebar.tsx", "utf8");
  for (const view of RETIRED_WORKSPACE_VIEWS) {
    assert.doesNotMatch(sidebarSource, new RegExp(`id:\\s*"${view}"`, "u"));
  }
});

test("files and settings survive as hidden views instead of being deleted", () => {
  assert.deepEqual([...HIDDEN_WORKSPACE_VIEWS], ["files", "settings"]);
  const shellSource = fs.readFileSync("components/layout/AppShell.tsx", "utf8");
  assert.match(shellSource, /<FilesView \/>/u);
  assert.match(shellSource, /<SettingsView \/>/u);
});

test("the free-form AI chat is preserved inside the decision workspace", () => {
  const workspaceSource = fs.readFileSync(
    "components/Chat/ChatDecisionWorkspace.tsx",
    "utf8"
  );
  assert.match(workspaceSource, /<ChatView \/>/u);
  assert.match(workspaceSource, /자유 대화/u);
});

test("settings stays reachable from the Topbar profile menu", () => {
  const topbarSource = fs.readFileSync("components/layout/Topbar.tsx", "utf8");
  assert.match(topbarSource, /view:\s*"settings"/u);
});

test("the retired business deep-link route redirects home", () => {
  const source = fs.readFileSync("app/business/[[...section]]/page.tsx", "utf8");
  assert.match(source, /permanentRedirect\("\/"\)/u);
});

test("nav labels exist for every sidebar view in all languages", async () => {
  const { getNavLabel } = await import("../src/lib/i18n/translations");
  for (const language of ["ko", "en", "ja"] as const) {
    for (const view of SIDEBAR_NAV_ORDER) {
      const label = getNavLabel(view, language);
      assert.ok(label && !label.startsWith("nav."), `${language}/${view} label missing`);
    }
  }
});
