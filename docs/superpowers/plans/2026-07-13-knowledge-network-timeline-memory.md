# Knowledge Network Timeline Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 메모리 페이지를 실제 관계를 그리는 Obsidian형 지식 네트워크, 시간 필터 타임라인, 승인 기억 작업 공간으로 통합한다.

**Architecture:** 채팅·메모리·지식 노트·파일·CRM·회의·연동·자동화 결과를 owner-scoped GraphSnapshot으로 정규화한다. 서버는 실제 source/target id와 타임라인 사건을 반환하고 브라우저의 `d3-force`가 좌표를 계산한다. 승인된 기억만 AI recall에 사용한다.

**Tech Stack:** React 19, Next.js 15, TypeScript, `d3-force`, PostgreSQL append-only owner document store

## Global Constraints

- 지식 원본 자동 누적과 승인 장기 기억을 분리한다.
- 그래프 선은 실제 edge source node와 target node를 잇는다.
- 기본 snapshot은 120개 노드와 300개 관계를 넘지 않는다.
- 모든 패널 자식은 `min-w-0`이며 긴 텍스트는 truncate, line clamp, `overflow-wrap:anywhere`를 사용한다.
- 1024px 미만에서는 필터와 상세를 drawer로 전환한다.
- 과거 사라진 메모리는 복구하지 않고 새 사건부터 누적한다.

---

### Task 1: Unified graph domain and timeline filters

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/lib/knowledge/graph.types.ts`
- Create: `src/lib/knowledge/graph-snapshot.ts`
- Create: `src/lib/knowledge/timeline.ts`
- Test: `tests/knowledge-graph-snapshot.test.ts`

**Interfaces:**
- Produces: `GraphNode`, `GraphEdge`, `GraphEvidence`, `TimelineEvent`, `GraphSnapshot`
- Produces: `filterGraphSnapshot(snapshot, filter)`
- Produces: `buildTimelineBuckets(events, granularity)`

- [ ] **Step 1: Write failing endpoint and time filter tests**

```ts
const filtered = filterGraphSnapshot(snapshot, { from: "2026-07-01", to: "2026-07-31" });
assert.ok(filtered.edges.every((edge) => filtered.nodes.some((node) => node.id === edge.sourceNodeId)));
assert.ok(filtered.edges.every((edge) => filtered.nodes.some((node) => node.id === edge.targetNodeId)));
assert.deepEqual(buildTimelineBuckets(events, "month").map((bucket) => bucket.key), ["2026-06", "2026-07"]);
```

- [ ] **Step 2: Run tests and verify the unified graph modules are missing**

Run: `npm test`

Expected: FAIL loading `graph-snapshot`.

- [ ] **Step 3: Implement exact graph DTOs and filters**

```ts
export type GraphEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationType: string;
  weight: number;
  firstSeenAt: string;
  lastSeenAt: string;
  evidenceIds: string[];
};
```

Filtering first selects nodes by query/type/tag/status/time, then includes only edges whose two endpoints remain. Timeline selection includes nodes first seen at or before the selected instant and highlights nodes changed inside a selected range.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test`

Expected: graph endpoint and timeline bucket tests pass.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/knowledge/graph.types.ts src/lib/knowledge/graph-snapshot.ts src/lib/knowledge/timeline.ts tests/knowledge-graph-snapshot.test.ts
git commit -m "feat: define unified knowledge graph snapshots"
```

### Task 2: Durable knowledge ingestion and evidence

**Files:**
- Create: `src/lib/knowledge/knowledge-graph.repository.ts`
- Create: `src/lib/knowledge/knowledge-ingestion.ts`
- Modify: `src/lib/knowledge/knowledge.repository.ts`
- Modify: `src/lib/memory/memory-lifecycle.ts`
- Modify: `src/lib/memory/knowledge-network.ts`
- Test: `tests/knowledge-ingestion.test.ts`

**Interfaces:**
- Produces: `ingestKnowledgeEvent(event): Promise<KnowledgeIngestionResult>`
- Produces: `getGraphSnapshot(ownerId, filter): Promise<GraphSnapshot>`
- Event idempotency key: `sha256(ownerId + sourceType + sourceRecordId + fingerprint)`

- [ ] **Step 1: Write failing ingestion tests**

```ts
await ingestKnowledgeEvent(event);
await ingestKnowledgeEvent(event);
const snapshot = await getGraphSnapshot("owner-a", {});
assert.equal(snapshot.nodes.filter((node) => node.normalizedKey === "project:dreamwish").length, 1);
assert.equal(snapshot.timelineEvents.filter((item) => item.sourceId === event.sourceRecordId).length, 1);
assert.equal((await getGraphSnapshot("owner-b", {})).nodes.length, 0);
```

- [ ] **Step 2: Run tests and verify ingestion is absent**

Run: `npm test`

Expected: FAIL importing `knowledge-ingestion`.

- [ ] **Step 3: Implement idempotent owner graph revisions**

Store owner graph state in namespace `knowledge-graph`. Resolver normalizes labels with Unicode NFKC, trim, lowercase, and type prefix. Each edge contains real node ids and at least one evidence id. Note creation and memory approval call ingestion after their canonical transaction succeeds; a failure appends a failed ingestion job instead of erasing the canonical record.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test`

Expected: idempotency, evidence, memory approval, and owner isolation pass.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/knowledge/knowledge-graph.repository.ts src/lib/knowledge/knowledge-ingestion.ts src/lib/knowledge/knowledge.repository.ts src/lib/memory/memory-lifecycle.ts src/lib/memory/knowledge-network.ts tests/knowledge-ingestion.test.ts
git commit -m "feat: accumulate durable knowledge evidence"
```

### Task 3: Graph, node, neighbors, timeline, and reindex APIs

**Files:**
- Create: `app/api/knowledge/graph/route.ts`
- Create: `app/api/knowledge/nodes/[nodeId]/route.ts`
- Create: `app/api/knowledge/nodes/[nodeId]/neighbors/route.ts`
- Create: `app/api/knowledge/timeline/route.ts`
- Create: `app/api/knowledge/reindex/route.ts`
- Test: `tests/knowledge-graph-api.test.ts`

**Interfaces:**
- `GET /api/knowledge/graph` returns `GraphSnapshot`
- `GET /api/knowledge/timeline` returns `{ events, buckets, trend }`

- [ ] **Step 1: Write failing route contracts**

```ts
const response = await graphRoute.GET(requestForOwnerA);
const body = await response.json() as GraphSnapshot;
assert.ok(body.edges.every((edge) => body.nodes.some((node) => node.id === edge.sourceNodeId)));
assert.equal((await nodeRoute.GET(requestForOwnerB, contextForOwnerANode)).status, 404);
```

- [ ] **Step 2: Run tests and verify route files are absent**

Run: `npm test`

Expected: FAIL loading graph routes.

- [ ] **Step 3: Implement entitled owner routes**

Parse query, type, tag, status, strength, from, to, center, depth with bounded values. Every route calls `requireEntitledOwnerContext`. Node deletion appends a tombstone and never deletes prior evidence. Reindex creates an owner job and returns 202; duplicate active jobs return the existing id.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test`

Expected: filter, limit, endpoint, tombstone, and owner isolation pass.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/api/knowledge/graph app/api/knowledge/nodes app/api/knowledge/timeline app/api/knowledge/reindex tests/knowledge-graph-api.test.ts
git commit -m "feat: expose knowledge graph and timeline APIs"
```

### Task 4: Obsidian-style graph canvas

**Files:**
- Create: `components/Memory/knowledge/KnowledgeGraphCanvas.tsx`
- Create: `components/Memory/knowledge/KnowledgeNode.tsx`
- Create: `components/Memory/knowledge/KnowledgeMiniMap.tsx`
- Create: `components/Memory/knowledge/useForceGraph.ts`
- Test: `tests/knowledge-graph-ui.test.ts`

**Interfaces:**
- `KnowledgeGraphCanvas({ snapshot, selectedNodeId, onSelectNode })`
- `useForceGraph(nodes, edges)` returns positioned nodes and endpoint paths

- [ ] **Step 1: Write failing actual-endpoint and overflow contracts**

```ts
assert.match(canvas, /edge\.sourceNodeId/u);
assert.match(canvas, /edge\.targetNodeId/u);
assert.doesNotMatch(canvas, /nodePosition\(index/u);
assert.match(node, /truncate/u);
assert.match(node, /overflow-wrap-anywhere|break-words/u);
```

- [ ] **Step 2: Run tests and verify graph components are absent**

Run: `npm test`

Expected: FAIL loading KnowledgeGraphCanvas.

- [ ] **Step 3: Implement force layout and interactions**

`useForceGraph` clones nodes, maps edge endpoints by id, and configures `forceLink().id(node => node.id)`, many-body, center, and collision. The canvas supports wheel zoom, pointer pan, node drag, fit view, reset, selected neighbor emphasis, and minimap. Invalid endpoints are filtered before simulation and reported to `console.warn` without clearing valid nodes.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test`

Expected: endpoint and overflow contracts pass.

Run: `npm run typecheck`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add components/Memory/knowledge tests/knowledge-graph-ui.test.ts
git commit -m "feat: render Obsidian-style knowledge graph"
```

### Task 5: Timeline, filters, inspector, and memory workspace

**Files:**
- Create: `components/Memory/knowledge/KnowledgeWorkspace.tsx`
- Create: `components/Memory/knowledge/KnowledgeToolbar.tsx`
- Create: `components/Memory/knowledge/KnowledgeFilterPanel.tsx`
- Create: `components/Memory/knowledge/KnowledgeInspector.tsx`
- Create: `components/Memory/knowledge/KnowledgeTimeline.tsx`
- Create: `components/Memory/knowledge/KnowledgeListView.tsx`
- Replace: `components/Memory/MemoryView.tsx`
- Modify: `components/Knowledge/KnowledgeView.tsx`
- Test: `tests/knowledge-memory-workspace.test.ts`

**Interfaces:**
- `MemoryView` renders `KnowledgeWorkspace`
- `KnowledgeView` reuses `KnowledgeWorkspace` instead of a second graph model

- [ ] **Step 1: Write failing image-structure contracts**

```ts
for (const token of ["KnowledgeFilterPanel", "KnowledgeGraphCanvas", "KnowledgeInspector", "KnowledgeTimeline"]) {
  assert.match(workspace, new RegExp(token, "u"));
}
assert.match(workspace, /grid-cols-\[190px_minmax\(0,1fr\)_280px\]/u);
assert.match(timeline, /week|month|year/u);
assert.doesNotMatch(memoryView, /function nodePosition/u);
```

- [ ] **Step 2: Run tests and verify current fixed-position UI fails**

Run: `npm test`

Expected: FAIL because the unified workspace does not exist and `nodePosition` remains.

- [ ] **Step 3: Implement the user-image workspace**

Top toolbar contains search, filter, new note, network/graph/list tabs. Desktop body uses `190px minmax(0,1fr) 280px`; inspector collapses below 1440px and both panels become drawers below 1024px. Timeline sits below the graph with week/month/year tabs, range filter, event cards, and an SVG trend area. The memory tab preserves candidate approval and approved-memory correction/forget controls inside the inspector/list view.

- [ ] **Step 4: Run tests, typecheck, and build**

Run: `npm test`

Expected: image structure, timeline interaction, memory controls, and overflow tests pass.

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm run build`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add components/Memory components/Knowledge/KnowledgeView.tsx tests/knowledge-memory-workspace.test.ts
git commit -m "feat: integrate knowledge timeline into memory"
```

### Task 6: Automatic source ingestion and AI Chat memory bridge

**Files:**
- Create: `src/lib/knowledge/ingestion-hooks.ts`
- Modify: `app/api/ai/chat/route.ts`
- Modify: `app/api/chat/route.ts`
- Modify: `app/api/knowledge/notes/route.ts`
- Modify: `app/api/files/route.ts`
- Modify: `app/api/crm/customers/route.ts`
- Create: `app/api/business/meetings/route.ts`
- Modify: `src/lib/automation/scenario-runner.ts`
- Modify: `components/Chat/ChatView.tsx`
- Test: `tests/knowledge-source-ingestion.test.ts`

**Interfaces:**
- Produces: `recordKnowledgeSource(input): Promise<{ eventId: string; status: "completed" | "failed" }>`
- Chat memory result adds `knowledgeEventId?: string`

- [ ] **Step 1: Write failing source coverage tests**

```ts
for (const file of [
  "app/api/knowledge/notes/route.ts",
  "app/api/files/route.ts",
  "app/api/crm/customers/route.ts",
  "app/api/business/meetings/route.ts",
  "src/lib/automation/scenario-runner.ts"
]) {
  assert.match(fs.readFileSync(file, "utf8"), /recordKnowledgeSource/u, file);
}
assert.doesNotMatch(chatAnswerRenderer, /관련도/u);
```

- [ ] **Step 2: Run tests and verify ingestion hooks are missing**

Run: `npm test`

Expected: FAIL in source coverage contracts.

- [ ] **Step 3: Connect canonical saves to ingestion**

After each canonical save succeeds, enqueue a bounded source event with owner, source type, source id, title, text preview, occurrence time, and fingerprint. Chat capture creates a memory candidate and a knowledge source independently; only approved memory enters recall. Chat success UI links `메모리에서 보기` by dispatching `dreamwish:navigate` with view `memory` and event id. Related document relevance stays only in the right source panel.

- [ ] **Step 4: Run full verification**

Run: `npm test`

Expected: source coverage, idempotency, approved-only recall, and no-relatedness-copy tests pass.

Run: `npm run typecheck`

Expected: exit 0.

Run: `npm run build`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/knowledge/ingestion-hooks.ts app/api/ai/chat/route.ts app/api/chat/route.ts app/api/knowledge/notes/route.ts app/api/files/route.ts app/api/crm/customers/route.ts app/api/business/meetings/route.ts src/lib/automation/scenario-runner.ts components/Chat/ChatView.tsx tests/knowledge-source-ingestion.test.ts
git commit -m "feat: accumulate knowledge from app activity"
```
