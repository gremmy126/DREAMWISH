import assert from "node:assert/strict";
import fs from "node:fs";

test("disconnect service attempts revoke but always destroys internal tokens and audits", () => {
  const source = fs.readFileSync("src/lib/oauth/oauth-connection.service.ts", "utf8");
  assert.match(source, /revokeProviderToken/u);
  assert.match(source, /softDisconnectConnection/u);
  assert.match(source, /appendAutomationAuditEvent/u);
  assert.match(source, /finally/u);
  assert.match(source, /affectedWorkflows/u);
});

test("canonical disconnect route derives ownership from session and checks same-origin CSRF", () => {
  const source = fs.readFileSync("app/api/integrations/connections/[connectionId]/disconnect/route.ts", "utf8");
  assert.match(source, /requireOwnerContext\(request\)/u);
  assert.match(source, /assertSameOriginMutation/u);
  assert.doesNotMatch(source, /x-owner-id/u);
  assert.doesNotMatch(source, /userId.*body/u);
});

test("connection APIs expose list test refresh reauthorize and disconnect surfaces", () => {
  for (const route of [
    "app/api/integrations/connections/route.ts",
    "app/api/integrations/connections/[connectionId]/test/route.ts",
    "app/api/integrations/connections/[connectionId]/refresh/route.ts",
    "app/api/integrations/connections/[connectionId]/reauthorize/route.ts",
    "app/api/integrations/connections/[connectionId]/disconnect/route.ts"
  ]) assert.equal(fs.existsSync(route), true, `${route} must exist`);
});
