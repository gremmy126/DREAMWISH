import assert from "node:assert/strict";
import fs from "node:fs";

test("sidebar keeps billing above storage and shows the corrected address", () => {
  const source = fs.readFileSync("components/layout/Sidebar.tsx", "utf8");
  assert.ok(source.indexOf("<UpgradeButton compact") < source.indexOf("<StorageStatus compact"));
  assert.match(source, /부산 사상구 덕상로 8-37, 202동 2504호/u);
  assert.doesNotMatch(source, /학장로/u);
});
