import assert from "node:assert/strict";
import fs from "node:fs";
import {
  buildInitialKnowledgeLayout,
  buildKnowledgeTimeline
} from "../src/lib/knowledge/knowledge-layout";

test("Obsidian layout centers highly connected knowledge and keeps real edge endpoints", () => {
  const graph = {
    updatedAt: "2026-07-13T00:00:00.000Z",
    nodes: [
      node("hub", "개인두뇌 AI", "project"),
      node("memory", "승인된 기억", "memory"),
      node("person", "김민수", "person")
    ],
    edges: [
      edge("e1", "hub", "memory"),
      edge("e2", "hub", "person")
    ]
  } as const;
  const layout = buildInitialKnowledgeLayout(graph, 800, 480);
  const hub = layout.nodes.find((item) => item.id === "hub")!;
  assert.equal(hub.degree, 2);
  assert.ok(Math.abs(hub.x - 400) < 1);
  assert.ok(Math.abs(hub.y - 240) < 1);
  assert.deepEqual(layout.edges.map(({ source, target }) => ({ source, target })), [
    { source: "hub", target: "memory" },
    { source: "hub", target: "person" }
  ]);
});

test("knowledge timeline preserves durable event chronology and monthly groups", () => {
  const timeline = buildKnowledgeTimeline([
    { id: "new", title: "새 지식", type: "approved", createdAt: "2026-07-13T09:00:00.000Z" },
    { id: "old", title: "프로젝트 시작", type: "candidate", createdAt: "2026-05-02T09:00:00.000Z" }
  ]);
  assert.deepEqual(timeline.events.map((item) => item.id), ["old", "new"]);
  assert.deepEqual(timeline.groups.map((item) => item.key), ["2026-05", "2026-07"]);
});

test("shared knowledge workspace is mounted in Memory and AI Chat context", () => {
  const workspace = read("components/Knowledge/KnowledgeWorkspace.tsx");
  const memory = read("components/Memory/MemoryView.tsx");
  const chatContext = read("components/context/ConnectedContextWorkspace.tsx");
  const knowledge = read("components/Knowledge/KnowledgeView.tsx");
  const api = read("app/api/knowledge/workspace/route.ts");

  assert.match(workspace, /forceSimulation/u);
  assert.match(workspace, /forceLink/u);
  assert.match(workspace, /지식 타임라인/u);
  assert.match(workspace, /선택한 지식/u);
  assert.match(memory, /<KnowledgeWorkspace/u);
  assert.match(chatContext, /<ChatKnowledgeTimeline/u);
  assert.match(knowledge, /<KnowledgeWorkspace/u);
  assert.match(api, /requireOwnerContext/u);
  assert.match(api, /buildMemoryDashboardSnapshot/u);
});

function node(id: string, label: string, type: "project" | "memory" | "person") {
  return { id, label, type, confidence: 0.9, sourceIds: [id] };
}

function edge(id: string, from: string, to: string) {
  return { id, from, to, type: "related_to" as const, confidence: 0.8, sourceIds: [id] };
}

function read(file: string) {
  assert.equal(fs.existsSync(file), true, `${file} must exist`);
  return fs.readFileSync(file, "utf8");
}
