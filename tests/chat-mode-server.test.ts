import assert from "node:assert/strict";
import fs from "node:fs";
import { buildModeChatMessages } from "../src/lib/ai/prompts";

test("plan and agent modes use the authenticated streaming route instead of a local preview", () => {
  const chatView = fs.readFileSync("components/Chat/ChatView.tsx", "utf8");
  const streamRoute = fs.readFileSync("app/api/ai/chat/stream/route.ts", "utf8");

  assert.doesNotMatch(chatView, /await addAgentPreview/u);
  assert.match(chatView, /mode: effectiveMode/u);
  assert.match(streamRoute, /parseChatMode\(body\.mode\)/u);
  assert.match(streamRoute, /buildModeChatMessages/u);
  assert.match(streamRoute, /planAgentExecution/u);
  assert.match(streamRoute, /verifyAnswer\(answer, context\.sources\)/u);
  assert.match(streamRoute, /saveAssistantExchange/u);
});

test("mode prompts include personal context and keep agent actions approval-first", () => {
  const planMessages = buildModeChatMessages({
    mode: "plan",
    question: "Prepare a launch plan",
    contextText: "Project launch is scheduled for Friday.",
    memoryContextText: "The user prefers checklist-style plans.",
    executionPreviewText: "1. Confirm launch scope."
  });
  const agentMessages = buildModeChatMessages({
    mode: "agent",
    question: "Send the launch notice",
    contextText: "Slack is connected.",
    memoryContextText: "The user wants a review before sending.",
    executionPreviewText: "1. Prepare a Slack message draft."
  });

  assert.match(planMessages[0].content, /단계별 실행 계획/u);
  assert.match(planMessages[0].content, /Project launch is scheduled for Friday\./u);
  assert.match(planMessages[0].content, /The user prefers checklist-style plans\./u);
  assert.match(agentMessages[0].content, /승인/u);
  assert.match(agentMessages[0].content, /실행했다고 주장하지/u);
  assert.match(agentMessages[0].content, /Slack is connected\./u);
});
