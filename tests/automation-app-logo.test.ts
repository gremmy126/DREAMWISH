import assert from "node:assert/strict";
import fs from "node:fs";

test("AppLogo uses only the Registry path and permanently falls back after one failed source", () => {
  const source = fs.readFileSync("components/shared/AppLogo.tsx", "utf8");
  assert.match(source, /failedLogoPaths/u);
  assert.match(source, /app\.logoPath/u);
  assert.match(source, /object-contain/u);
  assert.doesNotMatch(source, /app-logos|sourceIndex|candidates/u);
  assert.doesNotMatch(source, /`\/images\/\$\{appId\}/u);
});

test("legacy guessed logo component is removed", () => {
  assert.equal(fs.existsSync("components/Automation/AutomationAppLogo.tsx"), false);
});
