import assert from "node:assert/strict";
import {
  getLocalizedChatError,
  shouldSubmitChat,
  type ChatStatus
} from "../src/lib/chat/chat-flow";

test("shouldSubmitChat blocks blank, composing, and duplicate submissions", () => {
  assert.equal(shouldSubmitChat("   \n\t", false, false), false);
  assert.equal(shouldSubmitChat("hello", true, false), false);
  assert.equal(shouldSubmitChat("hello", false, true), false);
  assert.equal(shouldSubmitChat("hello", false, false), true);
});

test("getLocalizedChatError maps stable error codes by locale", () => {
  assert.equal(getLocalizedChatError("QUERY_REQUIRED", "ko"), "메시지를 입력해 주세요.");
  assert.equal(getLocalizedChatError("INVALID_JSON", "en"), "The request format is invalid.");
  assert.equal(getLocalizedChatError("WEB_SEARCH_FAILED", "ja"), "ウェブ検索に失敗しました。");
  assert.equal(getLocalizedChatError("SOMETHING_UNKNOWN", "en"), "Please try again shortly.");
});

test("ChatStatus includes the expected execution states", () => {
  const statuses: ChatStatus[] = [
    "idle",
    "submitting",
    "searching-local",
    "searching-web",
    "generating",
    "streaming",
    "completed",
    "error",
    "cancelled"
  ];

  assert.equal(statuses.length, 9);
});
