import assert from "node:assert/strict";
import {
  parseChatMode,
  shouldRouteToAgentPreview
} from "../src/lib/chat/chat-mode-policy";

test("ask mode answers service and file questions instead of showing approval preview", () => {
  assert.equal(shouldRouteToAgentPreview("GitHub API가 있는지 알려줘", "ask"), false);
  assert.equal(shouldRouteToAgentPreview("로컬 문서는 어디에서 확인해?", "ask"), false);
  assert.equal(shouldRouteToAgentPreview("첨부한 파일을 분석할 수 있어?", "ask"), false);
});

test("plan and agent modes still prepare approval-first previews", () => {
  assert.equal(shouldRouteToAgentPreview("GitHub 이슈를 만들어줘", "plan"), true);
  assert.equal(shouldRouteToAgentPreview("GitHub 이슈를 만들어줘", "agent"), true);
  assert.equal(shouldRouteToAgentPreview("agent: GitHub 이슈를 만들어줘", "ask"), true);
});

test("chat mode parsing accepts supported modes and fails closed to ask", () => {
  assert.equal(parseChatMode("ask"), "ask");
  assert.equal(parseChatMode("plan"), "plan");
  assert.equal(parseChatMode("agent"), "agent");
  assert.equal(parseChatMode("unknown"), "ask");
  assert.equal(parseChatMode(undefined), "ask");
});
