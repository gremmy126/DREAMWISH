import assert from "node:assert/strict";
import fs from "node:fs";

test("memory candidate card exposes edit approve reject and review-later actions", () => {
  assert.equal(fs.existsSync("components/Memory/MemoryCandidateCard.tsx"), true);
  const source = fs.readFileSync("components/Memory/MemoryCandidateCard.tsx", "utf8");
  assert.match(source, /onApprove/u);
  assert.match(source, /onReject/u);
  assert.match(source, /onDefer/u);
  assert.match(source, /textarea/u);
  assert.match(source, /expectedVersion/u);
});

test("memory view sends versioned lifecycle mutations without client approver identity", () => {
  const source = fs.readFileSync("components/Memory/MemoryView.tsx", "utf8");
  assert.match(source, /expectedVersion: candidate\.version/u);
  assert.match(source, /\/reject/u);
  assert.match(source, /method: "PATCH"/u);
  assert.match(source, /method: "DELETE"/u);
  assert.match(source, /expectedVersion: memory\.version/u);
  assert.doesNotMatch(source, /approvedBy:/u);
});

test("chat consumes memory capture results and offers immediate lifecycle actions", () => {
  const source = fs.readFileSync("components/Chat/ChatView.tsx", "utf8");
  assert.match(source, /memoryCandidates/u);
  assert.match(source, /memoryStatus/u);
  assert.match(source, /approveChatMemoryCandidate/u);
  assert.match(source, /rejectChatMemoryCandidate/u);
  assert.match(source, /expectedVersion: candidate\.version/u);
  assert.match(source, /MemoryCandidateCard/u);
});

test("completed deep research requires explicit memory approval", () => {
  const source = fs.readFileSync("components/Chat/ResearchWorkspace.tsx", "utf8");
  const dock = fs.readFileSync("components/Chat/DeepResearchPanel.tsx", "utf8");
  assert.match(source, /\/approve-memory/u);
  assert.match(source, /메모리에 승인 저장/u);
  assert.match(source, /memory-approved/u);
  assert.match(dock, /\/approve-memory/u);
  assert.match(dock, /메모리 승인/u);
  assert.match(dock, /memory-approved/u);
});

test("research report panel stays bounded and renders cleaned report blocks", () => {
  const source = fs.readFileSync("components/Chat/ResearchWorkspace.tsx", "utf8");

  assert.match(source, /parseResearchDisplayBlocks/u);
  assert.match(source, /h-full max-h-full/u);
  assert.match(source, /min-h-0 flex-1 overflow-auto/u);
  assert.match(source, /ResearchReportContent/u);
});

test("AI chat exposes a dedicated new chat button", () => {
  const source = fs.readFileSync("components/Chat/ChatView.tsx", "utf8");
  assert.match(source, /새 채팅/u);
  assert.match(source, /onClick=\{startNewChat\}/u);
});

test("deep research cards are isolated to the selected chat session", () => {
  const dock = fs.readFileSync("components/Chat/DeepResearchPanel.tsx", "utf8");
  const chat = fs.readFileSync("components/Chat/ChatView.tsx", "utf8");
  const route = fs.readFileSync("app/api/ai/deep-research/route.ts", "utf8");

  assert.match(dock, /if \(!sessionId\) \{\s*setJobs\(\[\]\);\s*return;/u);
  assert.match(dock, /onSession/u);
  assert.match(chat, /onSession=\{handleResearchSession\}/u);
  assert.match(chat, /upsertOptimisticChatSession/u);
  assert.match(route, /ensureSession\(owner\.uid, chatSessionId \|\| undefined, query\)/u);
  assert.match(route, /chatSessionId: session\.id/u);
  assert.match(route, /job: toResearchJobView\(job\), session/u);

  const sessionsRoute = fs.readFileSync("app/api/ai/sessions/route.ts", "utf8");
  assert.match(sessionsRoute, /attachUnlinkedResearchJobsToChatSessions\(owner\.uid\)/u);
});
