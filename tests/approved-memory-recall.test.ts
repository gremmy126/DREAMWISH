import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildContextAwareChatMessages } from "../src/lib/ai/prompts";

test("approved memory context is owner scoped ranked and bounded", async () => {
  const modulePath = "../src/lib/memory/approved-memory-context";
  assert.equal(fs.existsSync("src/lib/memory/approved-memory-context.ts"), true);
  const { buildApprovedMemoryContext } = require(modulePath) as {
    buildApprovedMemoryContext: (ownerId: string, query: string) => Promise<{
      status: "used" | "empty" | "degraded";
      contextText: string;
      memories: Array<{ id: string; score: number; title: string }>;
      sources: Array<{ path: string }>;
    }>;
  };
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dreamwish-memory-recall-"));
  const originalDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = dataDir;
  try {
    fs.writeFileSync(
      path.join(dataDir, "memory.json"),
      JSON.stringify({
        candidates: [],
        captureJobs: [],
        changes: [],
        embeddings: [],
        memories: [
          memoryRecord("memory-a", "uid-a", "사용자는 한국어로 간결한 답변을 선호한다."),
          memoryRecord("memory-b", "uid-b", "uid-b-secret 사용자는 영어 답변만 선호한다.")
        ]
      }),
      "utf8"
    );

    const context = await buildApprovedMemoryContext("uid-a", "내 답변 언어 선호는 무엇인가?");
    assert.equal(context.status, "used");
    assert.ok(context.memories.length > 0 && context.memories.length <= 6);
    assert.ok(context.memories.every((memory) => memory.score >= 0.25));
    assert.ok(context.contextText.length <= 2400);
    assert.doesNotMatch(context.contextText, /uid-b-secret/u);
    assert.ok(context.sources.every((source) => source.path.startsWith("memory://")));
  } finally {
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
  }
});

test("chat prompts delimit approved memory as untrusted reference data", () => {
  const messages = buildContextAwareChatMessages({
    question: "내 선호는?",
    contextText: "",
    contextAvailable: false,
    memoryContextText: "사용자는 한국어 답변을 선호한다."
  });
  assert.match(messages[0].content, /untrusted reference data/iu);
  assert.match(messages[0].content, /<approved_memory>/u);
  assert.match(messages[0].content, /<\/approved_memory>/u);
});

test("both chat routes recall approved memory and capture persisted message ids", () => {
  for (const filePath of ["app/api/ai/chat/route.ts", "app/api/ai/chat/stream/route.ts"]) {
    const source = fs.readFileSync(filePath, "utf8").replace(/\s+/gu, " ");
    assert.match(source, /buildApprovedMemoryContext\(owner\.uid, message\)/u);
    assert.match(source, /const userMessageRecord = await addMessage/u);
    assert.match(source, /const assistantMessageRecord = await addMessage/u);
    assert.match(source, /ownerId,/u);
    assert.match(source, /userMessageId: userMessageRecord\.id/u);
    assert.match(source, /assistantMessageId: assistantMessageRecord\.id/u);
  }
});

function memoryRecord(id: string, ownerId: string, content: string) {
  const now = "2026-07-11T00:00:00.000Z";
  return {
    id,
    ownerId,
    title: "답변 언어 선호",
    content,
    source: "manual",
    sourceId: id,
    sourceSessionId: null,
    sourceMessageIds: [],
    projectId: null,
    signals: ["preference"],
    importance: 0.9,
    recency: 0.9,
    frequency: 2,
    confidence: 0.95,
    status: "approved",
    version: 1,
    createdAt: now,
    updatedAt: now,
    preview: content,
    approvedAt: now,
    approvedBy: ownerId,
    approvalNote: null,
    markdownPath: `memory-markdown/${ownerId}/${id}.md`,
    embeddingId: `embedding-${id}`,
    graphUpdatedAt: now
  };
}
