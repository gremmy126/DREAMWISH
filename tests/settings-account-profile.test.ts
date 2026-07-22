import assert from "node:assert/strict";
import fs from "node:fs";

// Regression: the settings account card fetched the POST-only /api/auth/session
// route with GET, which returned 405. Because the failure was swallowed, the
// card stayed on "계정 정보를 불러오는 중" forever. It must instead read the
// GET-only /api/auth/me profile endpoint with explicit states.
const source = fs.readFileSync("components/Settings/SettingsView.tsx", "utf8");

test("account card reads the GET-only /api/auth/me endpoint with no caching", () => {
  assert.match(source, /fetch\(\s*["'`]\/api\/auth\/me["'`]\s*,\s*\{\s*cache:\s*["'`]no-store["'`]\s*\}\s*\)/u);
});

test("account card never GET-calls the POST-only /api/auth/session route", () => {
  assert.doesNotMatch(source, /fetch\(\s*["'`]\/api\/auth\/session/u);
});

test("account card separates loading, loaded and error states with a retry action", () => {
  assert.match(source, /status:\s*"loading"/u);
  assert.match(source, /status:\s*"loaded"/u);
  assert.match(source, /status:\s*"error"/u);
  assert.match(source, /다시 시도/u);
});

test("account card renders name, email, role and account status", () => {
  assert.match(source, /account\.email/u);
  assert.match(source, /account\.name/u);
  assert.match(source, /account\.role/u);
  assert.match(source, /accountStatus/u);
});

test("account card guards against a stale response overwriting a newer one", () => {
  // A monotonic request token must gate the setState so an out-of-order or
  // post-unmount response cannot clobber the latest state.
  assert.match(source, /accountRequestRef/u);
  assert.match(source, /token\s*!==\s*accountRequestRef\.current/u);
});
