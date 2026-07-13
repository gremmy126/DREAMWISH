import assert from "node:assert/strict";
import fs from "node:fs";

test("signed-in chat does not flash a separate welcome page while restoring sessions", () => {
  const chat = fs.readFileSync("components/Chat/ChatView.tsx", "utf8");
  assert.doesNotMatch(chat, /t\("chat\.emptyTitle"\)/u);
  assert.doesNotMatch(chat, /t\("chat\.emptyDescription"\)/u);
  assert.match(chat, /aria-label="empty conversation"/u);
});
