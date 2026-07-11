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
