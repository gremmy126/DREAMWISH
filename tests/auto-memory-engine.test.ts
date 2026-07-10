import assert from "node:assert/strict";
import {
  analyzeConversationForMemory,
  findAutoMemoryTarget,
  mergeAutoMemoryMetadata
} from "../src/lib/memory/auto-memory-engine";
import type { ApprovedMemory } from "../src/lib/memory/memory.types";

test("analyzeConversationForMemory stores every non-empty chat exchange", () => {
  const greeting = analyzeConversationForMemory({
    userMessage: "안녕",
    assistantAnswer: "안녕하세요. 무엇을 도와드릴까요?"
  });
  assert.ok(greeting);
  assert.equal(greeting.category, "Knowledge");
  assert.match(greeting.content, /Original conversation/u);
  assert.match(greeting.content, /안녕/u);

  const testExchange = analyzeConversationForMemory({
    userMessage: "테스트",
    assistantAnswer: "테스트 응답입니다."
  });
  assert.ok(testExchange);
});

test("analyzeConversationForMemory extracts durable personal brain memory metadata", () => {
  const extraction = analyzeConversationForMemory({
    userMessage:
      "Personal Brain AI Memory Engine should analyze every conversation and update RAG, Embedding, Knowledge Graph, and document memory.",
    assistantAnswer:
      "I will connect the automatic memory engine so chat answers can update the automation workflow quietly."
  });

  assert.ok(extraction);
  assert.equal(extraction.category, "Automation");
  assert.equal(extraction.projectId, "Personal Brain AI");
  assert.ok(extraction.tags.includes("#AI"));
  assert.ok(extraction.tags.includes("#Memory"));
  assert.ok(extraction.tags.includes("#RAG"));
  assert.ok(extraction.relatedConcepts.includes("Knowledge Graph"));
  assert.ok(
    extraction.relatedLinks.some(
      (link) => link.type === "project" && link.label === "Personal Brain AI"
    )
  );
  assert.ok(extraction.relatedLinks.some((link) => link.type === "document"));
  assert.ok(extraction.summary.split("\n").length <= 3);
  assert.match(extraction.content, /Original conversation/u);
});

test("findAutoMemoryTarget reuses the same project memory instead of creating duplicates", () => {
  const extraction = analyzeConversationForMemory({
    userMessage: "Personal Brain AI memory engine automation should save every chat response.",
    assistantAnswer: "The same project memory will be updated instead of creating duplicates."
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

  const merged = mergeAutoMemoryMetadata(
    existingMemory,
    extraction,
    "2026-07-10T00:00:00.000Z"
  );
  assert.equal(merged.id, "memory-1");
  assert.equal(merged.projectId, "Personal Brain AI");
  assert.ok(merged.tags?.includes("#Automation"));
  assert.ok(merged.relatedConcepts?.includes("Memory Engine"));
  assert.equal(merged.history?.length, 1);
});
