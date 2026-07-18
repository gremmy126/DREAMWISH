import assert from "node:assert/strict";
import fs from "node:fs";
import { mergeVerifiedConnectionStates } from "../src/lib/integrations/verified-connection.service";

test("sync enabled without verified auth is not connected", () => {
  const states = mergeVerifiedConnectionStates([], {}, [{ connectorId: "openai", enabled: true }]);
  assert.equal(states.find((item) => item.connectorId === "openai")?.status, "not_connected");
});

test("verified keys and OAuth are connected while legacy keys require reconnection", () => {
  const states = mergeVerifiedConnectionStates([
    { id: "key-1", appId: "openai", label: "OpenAI", masked: "••••", verificationStatus: "verified", accountLabel: "OpenAI API", verifiedAt: "2026-07-14T00:00:00.000Z", createdAt: "", updatedAt: "" },
    { id: "key-2", appId: "jira", label: "Jira", masked: "••••", createdAt: "", updatedAt: "" },
  ], {
    gmail: { status: "connected", accountLabel: "person@example.com", verifiedAt: "2026-07-14T00:00:00.000Z", connectionState: "connected", canConnect: true },
  }, [], [{ appId: "gmail", status: "active" }]);
  assert.equal(states.find((item) => item.connectorId === "openai")?.status, "connected");
  assert.equal(states.find((item) => item.connectorId === "openai")?.authMode, "credential");
  assert.equal(states.find((item) => item.connectorId === "gmail")?.status, "connected");
  assert.equal(states.find((item) => item.connectorId === "gmail")?.authMode, "oauth");
  assert.equal(states.find((item) => item.connectorId === "jira")?.status, "needs_reconnect");
});

test("integration status exposes unified states and key disconnect disables sync", () => {
  const statusRoute = fs.readFileSync("app/api/integrations/status/route.ts", "utf8");
  const disconnectRoute = fs.readFileSync("app/api/integrations/credentials/[connectorId]/route.ts", "utf8");
  assert.match(statusRoute, /getVerifiedConnectionStates/u);
  assert.match(statusRoute, /connections/u);
  assert.match(disconnectRoute, /deleteCredentialsByApp/u);
  assert.match(disconnectRoute, /disableIntegrationSyncSetting/u);
  assert.match(disconnectRoute, /requireOwnerContext/u);
});

test("owner OAuth setup controls connectability without operator environment credentials", () => {
  const states = mergeVerifiedConnectionStates(
    [],
    {},
    [],
    [{ appId: "gmail", status: "active" }]
  );
  const gmail = states.find((item) => item.connectorId === "gmail");
  const outlook = states.find((item) => item.connectorId === "outlook");

  assert.equal(gmail?.canConnect, true);
  assert.equal(gmail?.operatorSetupRequired, false);
  assert.equal(gmail?.userOAuthSetupRequired, false);
  assert.equal(outlook?.canConnect, false);
  assert.equal(outlook?.operatorSetupRequired, false);
  assert.equal(outlook?.userOAuthSetupRequired, true);
});
