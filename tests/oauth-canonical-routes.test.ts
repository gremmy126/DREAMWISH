import assert from "node:assert/strict";
import fs from "node:fs";

test("canonical OAuth start and callback routes pin app identity and durable sessions", () => {
  const start = fs.readFileSync("app/api/integrations/[appId]/oauth/start/route.ts", "utf8");
  const callback = fs.readFileSync("app/api/integrations/[appId]/oauth/callback/route.ts", "utf8");
  const flow = fs.readFileSync("src/lib/oauth/oauth-authorization-flow.ts", "utf8");
  assert.match(start, /requireOwnerContext\(request\)/u);
  assert.match(start, /assertSameOriginMutation/u);
  assert.match(callback, /consumeOAuthSession/u);
  assert.match(callback, /session\.appId !== appId/u);
  assert.match(callback, /persistOAuthCallbackConnection/u);
  assert.match(flow, /DATABASE_URL is required for durable OAuth connections/u);
});

test("durable OAuth authorization keeps the provider callback registered in OAuth consoles", () => {
  const flow = fs.readFileSync("src/lib/oauth/oauth-authorization-flow.ts", "utf8");

  assert.match(flow, /getOAuthRedirectUri\(target\.provider, input\.requestUrl\)/u);
  assert.doesNotMatch(
    flow,
    /\/api\/integrations\/\$\{encodeURIComponent\(input\.appId\)\}\/oauth\/callback/u
  );
});

test("canonical connection routes never serialize credential ciphertext", () => {
  for (const route of [
    "app/api/integrations/connections/route.ts",
    "app/api/integrations/connections/[connectionId]/route.ts",
    "app/api/integrations/connections/[connectionId]/refresh/route.ts",
    "app/api/integrations/connections/[connectionId]/disconnect/route.ts"
  ]) {
    const source = fs.readFileSync(route, "utf8");
    assert.match(source, /toPublicIntegrationConnection/u);
    assert.doesNotMatch(source, /getIntegrationConnectionSecrets/u);
  }
});
