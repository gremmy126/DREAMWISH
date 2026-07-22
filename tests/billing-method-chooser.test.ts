import assert from "node:assert/strict";
import fs from "node:fs";

// 결제하기를 누르면 항상 PortOne/Polar 선택 화면이 먼저 열리고, 사용자가
// 고른 방식으로만 결제가 진행된다.
test("upgrade button always opens the payment-method chooser before checkout", () => {
  const source = fs.readFileSync("components/billing/UpgradeButton.tsx", "utf8");

  // 미결제 상태에서는 조건 없이 선택 다이얼로그를 연다 (바로 Polar로 이동 금지).
  const unpaidBranch = source.slice(
    source.indexOf("if (!paid) {"),
    source.indexOf("const response = await fetch(\"/api/billing/portal\"")
  );
  assert.match(unpaidBranch, /setChooserOpen\(true\)/u);
  assert.doesNotMatch(unpaidBranch, /await startPolarCheckout\(\)/u);

  // 두 결제 수단이 모두 선택지로 존재한다.
  assert.match(source, /국내 카드 결제 \(PortOne\)/u);
  assert.match(source, /Polar 결제/u);
  assert.match(source, /role="dialog"/u);

  // PortOne 미설정 시에는 이유를 표시하고 비활성화한다 (가짜 결제 진입 금지).
  assert.match(source, /domesticEnabled/u);
  assert.match(source, /준비 중입니다/u);
  assert.match(source, /disabled=\{!domesticEnabled\}/u);
});

test("payment gate copy names both PortOne and Polar", () => {
  const gate = fs.readFileSync("components/billing/PaymentGate.tsx", "utf8");
  assert.match(gate, /PortOne\(국내 카드\) 또는 Polar/u);
});
