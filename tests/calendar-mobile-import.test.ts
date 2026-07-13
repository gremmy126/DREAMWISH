import assert from "node:assert/strict";
import fs from "node:fs";

test("calendar exposes a phone import review flow next to new event", () => {
  const source = fs.readFileSync("components/Calendar/CalendarView.tsx", "utf8");

  assert.match(source, /휴대폰에서 가져오기/u);
  assert.match(source, /\/api\/devices\/calendar-candidates/u);
  assert.match(source, /가져올 일정 검토/u);
  assert.match(source, /선택 항목 가져오기/u);
});

test("sidebar billing button names admin paid and unpaid access states", () => {
  const source = fs.readFileSync("components/billing/UpgradeButton.tsx", "utf8");

  assert.match(source, /관리자 무료 이용/u);
  assert.match(source, /결제 관리/u);
  assert.match(source, /결제하기/u);
  assert.doesNotMatch(source, /adminBypass\) return null/u);
});
