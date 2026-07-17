import assert from "node:assert/strict";
import fs from "node:fs";

function read(file: string) {
  assert.equal(fs.existsSync(file), true, `${file} must exist`);
  return fs.readFileSync(file, "utf8");
}

test("Settings exposes a subscription cancellation card", () => {
  const settings = read("components/Settings/SettingsView.tsx");
  const card = read("components/billing/SubscriptionSettingsCard.tsx");

  assert.match(settings, /<SubscriptionSettingsCard/u);
  assert.match(card, /구독 및 결제/u);
  assert.match(card, /구독 해지/u);
  assert.match(card, /\/api\/billing\/status/u);
  assert.match(card, /\/api\/billing\/portal/u);
  assert.match(card, /현재 결제 기간이 끝날 때까지/u);
  assert.match(card, /환불을 의미하지 않습니다/u);
  assert.match(card, /role="dialog"/u);
  assert.match(card, /aria-modal="true"/u);
  assert.match(card, /min-h-11/u);
});

test("billing portal returns users to Settings", () => {
  assert.match(
    read("app/api/billing/portal/route.ts"),
    /\?view=settings&billing=return/u
  );
  const navigation = read("src/lib/navigation/workspace-view.ts");
  assert.match(navigation, /billing/u);
  assert.match(navigation, /settings/u);
});
