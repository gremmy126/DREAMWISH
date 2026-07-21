import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDecision, updateDecision } from "../src/lib/decisions/decision.repository";
import { buildDeterministicSummary } from "../src/lib/memory-os/memory-os-summary";
import {
  buildItem,
  buildOverview,
  createMemoryOsItem,
  detectPatterns,
  findRelated,
  listMemoryOs,
  searchScore,
  syncDerivedMemories,
  updateMemoryOsItem
} from "../src/lib/memory-os/memory-os.service";
import { relevanceStars } from "../src/lib/memory-os/memory-os.types";

const OWNER = "owner-org-1";

async function withTempDataDir(run: () => Promise<void>) {
  const previous = process.env.DATA_DIR;
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "dreamwish-memory-os-"));
  process.env.DATA_DIR = dataDir;
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = previous;
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}

test("decisions, research, simulation, and retrospectives derive memories idempotently", async () => {
  await withTempDataDir(async () => {
    const decision = await createDecision(OWNER, { title: "일본 시장 진출" });
    await updateDecision(OWNER, decision.id, {
      recommendation: {
        summary: "파일럿 이후 확장을 권고합니다.",
        rationale: "리스크 대비 학습 효과가 큼",
        confidence: "high",
        assumptions: [],
        counterpoints: ["전면 진출이 낫다는 의견 → 손실 2배"],
        updatedAt: new Date().toISOString()
      },
      research: {
        jobId: "job-1",
        status: "completed",
        summary: "일본 시장은 연 12% 성장",
        findings: "경쟁 3사 존재",
        sourceCount: 8,
        updatedAt: new Date().toISOString()
      },
      retrospective: {
        outcome: "파일럿 성공, 전환율 목표 초과",
        lessons: ["파일럿이 성공률이 높다"],
        reviewedAt: new Date().toISOString()
      }
    });

    await syncDerivedMemories(OWNER);
    const first = await listMemoryOs(OWNER);
    const refs = first.items.map((item) => item.sourceRef).sort();
    assert.ok(refs.includes(`decision:${decision.id}`));
    assert.ok(refs.includes(`research:${decision.id}`));
    assert.ok(refs.includes(`outcome:${decision.id}`));
    assert.ok(refs.includes(`lesson:${decision.id}:0`));

    // Re-sync must not duplicate.
    await syncDerivedMemories(OWNER);
    const second = await listMemoryOs(OWNER);
    assert.equal(second.items.length, first.items.length);
  });
});

test("natural-language search scores across title, tags, project, and content", () => {
  const item = buildItem({
    title: "일본 시장 진출 결정",
    content: "파일럿 이후 확장이 성공 확률이 높았다.",
    type: "decision",
    project: "일본 진출",
    tags: ["시장조사", "일본"]
  });
  assert.ok(searchScore(item, "작년에 했던 일본 진출") > 0);
  assert.ok(searchScore(item, "시장조사") > 0);
  assert.ok(searchScore(item, "마케팅 예산") === 0);
  // Type-label search (semantic-ish): "의사결정" matches the decision type.
  assert.ok(searchScore(item, "의사결정") > 0);
});

test("related memories connect through decision, project, and tags", () => {
  const a = buildItem({
    title: "A",
    content: "-",
    type: "decision",
    decisionId: "d1",
    project: "일본 진출",
    tags: ["일본"]
  });
  const b = buildItem({
    title: "B",
    content: "-",
    type: "lesson",
    decisionId: "d1",
    project: "일본 진출",
    tags: ["일본"]
  });
  const c = buildItem({ title: "C", content: "-", type: "idea", tags: ["미국"] });
  const related = findRelated(a, [a, b, c]);
  assert.equal(related.length, 1);
  assert.equal(related[0].item.title, "B");
  assert.ok(relevanceStars(related.length, a.importance) >= 1);
});

test("patterns surface when lessons repeat under the same tag", () => {
  const items = [
    buildItem({ title: "L1", content: "-", type: "lesson", status: "confirmed", tags: ["마케팅"] }),
    buildItem({ title: "L2", content: "-", type: "outcome", status: "confirmed", tags: ["마케팅"] }),
    buildItem({ title: "L3", content: "-", type: "lesson", status: "confirmed", tags: ["채용"] })
  ];
  const patterns = detectPatterns(items);
  assert.equal(patterns.length, 1);
  assert.match(patterns[0].title, /마케팅/u);
  assert.equal(patterns[0].evidenceCount, 2);
});

test("suggestion lifecycle: approve, archive, versions, and usage tracking", async () => {
  await withTempDataDir(async () => {
    const created = await createMemoryOsItem(OWNER, {
      title: "테스트 메모리",
      content: "첫 내용",
      type: "knowledge"
    });
    assert.equal(created.status, "confirmed");
    assert.equal(created.versions.length, 1);

    const edited = await updateMemoryOsItem(OWNER, created.id, { content: "수정된 내용" });
    assert.equal(edited?.versions.length, 2);

    const restored = await updateMemoryOsItem(OWNER, created.id, { restoreVersion: 1 });
    assert.equal(restored?.content, "첫 내용");
    assert.equal(restored?.versions.length, 3);

    const used = await updateMemoryOsItem(OWNER, created.id, { recordUsage: true });
    assert.equal(used?.usageCount, 1);
    assert.ok(used?.lastUsedAt);

    const archived = await updateMemoryOsItem(OWNER, created.id, { status: "archived" });
    assert.equal(archived?.status, "archived");
  });
});

test("overview KPIs and insights are computed from active items", () => {
  const items = [
    buildItem({ title: "확정1", content: "-", type: "decision", status: "confirmed", tags: ["a"] }),
    buildItem({ title: "제안1", content: "-", type: "lesson", status: "suggestion", tags: ["a"] }),
    buildItem({ title: "보관1", content: "-", type: "idea", status: "archived" })
  ];
  const overview = buildOverview(items);
  assert.equal(overview.kpis.total, 3);
  assert.equal(overview.kpis.confirmed, 1);
  assert.equal(overview.kpis.suggestions, 1);
  assert.equal(overview.kpis.archived, 1);
  assert.ok(overview.distribution.length >= 2);
  assert.ok(overview.insights.aiPick);
});

test("the deterministic AI summary always completes with core outcome and next use", () => {
  const item = buildItem({
    title: "일본 진출 교훈",
    content: "일본 시장 진출은 파일럿 이후 확장이 가장 성공 확률이 높았다. 전면 진출은 위험했다.",
    type: "lesson",
    insights: ["물류 비용 과소평가 주의"]
  });
  const summary = buildDeterministicSummary(item);
  assert.ok(summary.threeLines.length >= 1);
  assert.ok(summary.coreOutcome.includes("파일럿"));
  assert.ok(summary.nextUse.length >= 1);
  assert.equal(summary.source, "deterministic");
});
