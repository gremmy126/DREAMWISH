import assert from "node:assert/strict";
import fs from "node:fs";

test("signed-in chat does not flash a separate welcome page while restoring sessions", () => {
  const authGate = fs.readFileSync("components/auth/AuthGate.tsx", "utf8");
  const page = fs.readFileSync("app/page.tsx", "utf8");
  const loadingGuard = authGate.indexOf("if (loading)");
  const guestGuard = authGate.indexOf("if (!access)");

  assert.notEqual(loadingGuard, -1, "AuthGate must render a neutral restoring state");
  assert.notEqual(guestGuard, -1, "AuthGate must keep the public guest AI home");
  assert.ok(loadingGuard < guestGuard, "session restoration must finish before GuestChatHome renders");
  assert.match(authGate, /AuthRestoringScreen/u);
  assert.doesNotMatch(authGate, /if \(loading && hasServerSession\)/u);
  assert.doesNotMatch(authGate, /restoringSession=\{loading\}/u);
  assert.match(page, /cookies\(\)/u);
  assert.match(page, /SESSION_COOKIE_NAME/u);
  assert.match(page, /<AppShell hasServerSession=\{hasServerSession\}/u);
});
