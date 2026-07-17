import assert from "node:assert/strict";
import fs from "node:fs";

test("OAuth callback route always returns through the canonical public builder", () => {
  const route = read("app/api/integrations/[appId]/callback/route.ts");

  assert.match(route, /buildPublicReturnUrl/u);
  assert.doesNotMatch(route, /url\.origin/u);
  assert.match(route, /connected:\s*session\.service/u);
  assert.match(route, /error:\s*"oauth_failed"/u);
});

test("integration cards expose the exact callback with a copy control", () => {
  const source = read("components/integrations/IntegrationCenter.tsx");

  assert.match(source, /expectedRedirectUri/u);
  assert.match(source, /redirectMatches/u);
  assert.match(source, /navigator\.clipboard\.writeText/u);
  assert.match(source, /Callback URI 복사/u);
  assert.match(source, /Callback URI 복사됨/u);
});

test("integration app cards and credential details consume the shared AppLogo", () => {
  for (const file of [
    "components/integrations/IntegrationCenter.tsx",
    "components/integrations/IntegrationCard.tsx",
    "components/integrations/KeyCredentialPanel.tsx"
  ]) {
    const source = read(file);
    assert.match(source, /components\/shared\/AppLogo/u, file);
    assert.doesNotMatch(source, /AutomationAppLogo/u, file);
  }
});

function read(path: string) {
  return fs.readFileSync(path, "utf8");
}
