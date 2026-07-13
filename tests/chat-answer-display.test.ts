import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizeChatAnswer } from "../src/lib/chat/chat-answer-display";

test("AI chat display removes bold markers and standalone relevance copy", () => {
  assert.equal(
    normalizeChatAnswer("**회의 요약**\n관련도: 92%\n결정 사항입니다."),
    "회의 요약\n결정 사항입니다."
  );
  assert.equal(normalizeChatAnswer("Use **Gmail** and **Slack**."), "Use Gmail and Slack.");
});

test("AI answer bubble leaves confidence and related documents in the right context panel", () => {
  const chat = fs.readFileSync("components/Chat/ChatView.tsx", "utf8");
  assert.match(chat, /normalizeChatAnswer\(message\.content\)/u);
  assert.doesNotMatch(chat, /<ConfidenceBadge/u);
  assert.doesNotMatch(chat, /message\.sources\.map/u);
});
