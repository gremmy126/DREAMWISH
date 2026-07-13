import assert from "node:assert/strict";
import fs from "node:fs";

test("connection acceptance requires verified auth and navigates to the exact connector", () => {
  const route = fs.readFileSync("app/api/local/connections/accept/route.ts", "utf8");
  const chat = fs.readFileSync("components/context/SuggestedConnectionsPanel.tsx", "utf8");
  const memory = fs.readFileSync("components/Memory/MemoryView.tsx", "utf8");
  const shell = fs.readFileSync("components/layout/AppShell.tsx", "utf8");
  assert.match(route, /getVerifiedConnectionStates/u);
  assert.match(route, /connectionRequired/u);
  assert.match(route, /status !== "connected"/u);
  assert.match(chat, /connectorId/u);
  assert.match(chat, /연결 해제/u);
  assert.match(memory, /연결 해제/u);
  assert.match(shell, /pendingConnectorId/u);
});

test("integration and automation use exact app fields without a generic quick token", () => {
  const center = fs.readFileSync("components/integrations/IntegrationCenter.tsx", "utf8");
  const keyPanel = fs.readFileSync("components/integrations/KeyCredentialPanel.tsx", "utf8");
  const automation = fs.readFileSync("components/Automation/AutomationView.tsx", "utf8");
  assert.match(center, /KeyCredentialPanel/u);
  assert.match(keyPanel, /credentialFields/u);
  assert.match(keyPanel, /PROVIDER_AUTH_FAILED/u);
  assert.doesNotMatch(automation, /빠른 Token 추가/u);
  assert.match(automation, /연결 관리에서 인증/u);
});
