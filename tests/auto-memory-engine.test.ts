import assert from "node:assert/strict";
import {
  analyzeConversationForMemory,
  findAutoMemoryTarget,
  mergeAutoMemoryMetadata
} from "../src/lib/memory/auto-memory-engine";
import type { ApprovedMemory } from "../src/lib/memory/memory.types";

test("analyzeConversationForMemory ignores trivial chat", () => {
  assert.equal(
    analyzeConversationForMemory({
      userMessage: "안녕",
      assistantAnswer: "안녕하세요."
    }),
    null
  );

  assert.equal(
    analyzeConversationForMemory({
      userMessage: "테스트",
      assistantAnswer: "테스트 응답입니다."
    }),
    null
  );
});

test("analyzeConversationForMemory extracts durable personal brain memory metadata", () => {
  const extraction = analyzeConversationForMemory({
    userMessage:
      "Personal Brain AI Memory Engine이 모든 대화를 자동 분석해서 RAG, Embedding, Knowledge Graph를 업데이트하게 해줘.",
    assistantAnswer:
      "자동 메모리 엔진을 추가하고 채팅 응답 후 조용히 실행되도록 연결했습니다."
  });

  assert.ok(extraction);
  assert.equal(extraction.category, "Automation");
  assert.equal(extraction.projectId, "Personal Brain AI");
  assert.ok(extraction.tags.includes("#AI"));
  assert.ok(extraction.tags.includes("#Memory"));
  assert.ok(extraction.tags.includes("#RAG"));
  assert.ok(extraction.relatedConcepts.includes("Knowledge Graph"));
  assert.ok(extraction.relatedLinks.some((link) => link.type === "project" && link.label === "Personal Brain AI"));
  assert.ok(extraction.relatedLinks.some((link) => link.type === "document"));
  assert.ok(extraction.summary.split("\n").length <= 3);
  assert.match(extraction.content, /Original conversation/u);
});

test("findAutoMemoryTarget reuses the same project memory instead of creating duplicates", () => {
  const extraction = analyzeConversationForMemory({
    userMessage: "Personal Brain AI 메모리 엔진의 자동 저장 방식을 수정해줘.",
    assistantAnswer: "같은 프로젝트 메모리를 업데이트하도록 처리했습니다."
  });
  assert.ok(extraction);

  const existingMemory = {
    id: "memory-1",
    sourceId: extraction.sourceId,
    projectId: "Personal Brain AI",
    category: "Automation",
    tags: ["#AI", "#Memory"],
    relatedConcepts: ["Personal Brain"],
    history: []
  } as unknown as ApprovedMemory;

  assert.equal(findAutoMemoryTarget([existingMemory], extraction)?.id, "memory-1");

  const merged = mergeAutoMemoryMetadata(existingMemory, extraction, "2026-07-10T00:00:00.000Z");
  assert.equal(merged.id, "memory-1");
  assert.equal(merged.projectId, "Personal Brain AI");
  assert.ok(merged.tags?.includes("#Automation"));
  assert.ok(merged.relatedConcepts?.includes("Memory Engine"));
  assert.equal(merged.history?.length, 1);
});
