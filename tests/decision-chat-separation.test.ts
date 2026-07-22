import assert from "node:assert/strict";
import fs from "node:fs";
import type { ChatSessionRecord } from "../src/lib/chat/chat.types";
import {
  filterFreeChatSessions,
  isDecisionMirroredSession
} from "../src/lib/chat/session-list";

function session(overrides: Partial<ChatSessionRecord>): ChatSessionRecord {
  return {
    id: "s-1",
    owner_id: "owner-1",
    title: "자유 질문",
    created_at: "2026-07-22T00:00:00.000Z",
    updated_at: "2026-07-22T00:00:00.000Z",
    archived_at: null,
    ...overrides
  };
}

test("creating a decision no longer creates or links a free-chat session", () => {
  const route = fs.readFileSync("app/api/decisions/route.ts", "utf8");
  assert.doesNotMatch(route, /createSession/u);
  assert.doesNotMatch(route, /\[결정분석\]/u);
  assert.doesNotMatch(route, /chatSessionId/u);
});

test("decision conversation updates are no longer mirrored into chat sessions", () => {
  const route = fs.readFileSync("app/api/decisions/[decisionId]/route.ts", "utf8");
  assert.doesNotMatch(route, /mirrorConversationToChatSession/u);
  assert.doesNotMatch(route, /addMessage/u);
  assert.doesNotMatch(route, /chat\.repository/u);
});

test("decision deep research no longer attaches to a free-chat session", () => {
  const workspace = fs.readFileSync(
    "components/Chat/ChatDecisionWorkspace.tsx",
    "utf8"
  );
  assert.doesNotMatch(workspace, /chatSessionId:\s*decision\.chatSessionId/u);
});

test("legacy mirrored decision sessions stay hidden from the free chat list", () => {
  assert.equal(
    isDecisionMirroredSession(session({ title: "[결정분석] 신규 사업 검토" })),
    true
  );
  assert.equal(isDecisionMirroredSession(session({ title: "자유 질문" })), false);

  const visible = filterFreeChatSessions([
    session({ id: "mirror", title: "[결정분석] 신규 사업 검토" }),
    session({ id: "free", title: "자유 질문" })
  ]);
  assert.deepEqual(
    visible.map((item) => item.id),
    ["free"]
  );

  const chatView = fs.readFileSync("components/Chat/ChatView.tsx", "utf8");
  assert.match(chatView, /filterFreeChatSessions/u);
});

test("the decision workspace keeps its own conversation list beside a narrower chat", () => {
  const workspace = fs.readFileSync(
    "components/Chat/ChatDecisionWorkspace.tsx",
    "utf8"
  );
  // 좌측 결정 분석 대화 목록 + [목록 | 채팅 | 보고서] 3열 레이아웃.
  assert.match(workspace, /분석 대화 목록/u);
  assert.match(
    workspace,
    /xl:grid-cols-\[clamp\(220px,15vw,250px\)_minmax\(0,1fr\)_400px\]/u
  );
  assert.match(workspace, /openHistoryDecision\(entry\.id\)/u);
  assert.match(workspace, /deleteHistoryDecision/u);
  // 사이드바가 기존 헤더 드롭다운을 대체한다.
  assert.doesNotMatch(workspace, /분석 기록 열기/u);
});

test("free chat no longer offers the agent mode selection", () => {
  const chatView = fs.readFileSync("components/Chat/ChatView.tsx", "utf8");
  assert.match(chatView, /\(\["ask", "plan"\] as ChatMode\[\]\)/u);
  assert.doesNotMatch(chatView, /"ask", "plan", "agent"/u);
  // 퀵 액션도 화면에서 고를 수 없는 에이전트 모드로 전환하지 않는다.
  assert.doesNotMatch(chatView, /return "agent";/u);
});
