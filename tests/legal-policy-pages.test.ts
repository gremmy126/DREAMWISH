import assert from "node:assert/strict";
import fs from "node:fs";

function read(file: string) {
  assert.equal(fs.existsSync(file), true, `${file} must exist`);
  return fs.readFileSync(file, "utf8");
}

test("legal pages share one operator record and policy layout", () => {
  const policy = read("src/lib/legal/policy.ts");
  const layout = read("components/legal/PolicyLayout.tsx");

  assert.match(policy, /businessName:\s*"드림위시"/u);
  assert.match(policy, /representative:\s*"김동현"/u);
  assert.match(policy, /147-07-03187/u);
  assert.match(policy, /제 2026-부산사상구-0185/u);
  assert.match(policy, /051-916-1222/u);
  assert.match(policy, /adveryhyeon@gmail\.com/u);
  assert.match(layout, /OPERATOR_INFO/u);
  assert.match(layout, /POLICY_LINKS/u);
});

test("refund policy is linked from public navigation and sitemap", () => {
  for (const file of [
    "components/layout/AppShell.tsx",
    "components/home/GuestChatHome.tsx",
    "app/sitemap.ts"
  ]) {
    assert.match(read(file), /\/refunds/u, file);
  }
});
