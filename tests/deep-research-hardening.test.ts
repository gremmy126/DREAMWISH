import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  appendResearchProgress,
  createResearchJob,
  getResearchJob,
  mutateResearchJob,
  prepareResearchResume
} from "../src/lib/deep-research/deep-research.repository";
import { resolveResearchSettings, RESEARCH_LIMITS } from "../src/lib/deep-research/research-budget";
import { buildEvidenceOnlyReport, runResearchJob } from "../src/lib/deep-research/research-runner";

test("custom research duration accepts up to 120 minutes", () => {
  assert.equal(RESEARCH_LIMITS.maxDurationMs, 120 * 60_000);
  const settings = resolveResearchSettings({ mode: "custom", maxDurationMs: 120 * 60_000 });
  assert.equal(settings.maxDurationMs, 120 * 60_000);
  const clamped = resolveResearchSettings({ mode: "custom", maxDurationMs: 999 * 60_000 });
  assert.equal(clamped.maxDurationMs, 120 * 60_000);
});

test("failed jobs can be retried from their checkpoint with a fresh budget", async () => {
  await withTempDataDir(async () => {
    const settings = resolveResearchSettings({ mode: "standard" });
    const job = await createResearchJob({ ownerId: "alice", query: "재시도", settings });
    await mutateResearchJob("alice", job.id, (record) => {
      record.status = "failed";
      record.error = "보고서 생성 실패";
      record.startedAt = "2026-07-16T00:00:00.000Z";
      record.completedAt = "2026-07-16T00:05:00.000Z";
      record.checkpoint = {
        stage: "write",
        subQuestions: ["재시도"],
        pendingQueries: [],
        usedQueries: ["재시도"],
        evidence: [{ sourceId: "s1", excerpt: "근거" }],
        iteration: 2
      };
    });

    const resumed = await prepareResearchResume("alice", job.id);
    assert.equal(resumed?.status, "queued");
    assert.equal(resumed?.error, null);
    assert.equal(resumed?.startedAt, null);
    assert.equal(resumed?.checkpoint?.evidence.length, 1);
    assert.ok(resumed?.progressEvents.some((event) => event.step === "retry"));

    const running = await createResearchJob({ ownerId: "bob", query: "다른 사용자", settings });
    await appendResearchProgress("bob", running.id, {
      status: "searching",
      step: "search",
      message: "진행 중"
    });
    await assert.rejects(prepareResearchResume("bob", running.id), /다시 시작할 수/u);
  });
});

test("AI synthesis failure completes with an evidence-only report instead of failing", async () => {
  await withTempDataDir(async () => {
    const settings = resolveResearchSettings({ mode: "custom", minSources: 1, maxSearchQueries: 2 });
    const job = await createResearchJob({ ownerId: "alice", query: "폴백 주제", settings });

    await runResearchJob("alice", job.id, {
      searchFn: async () => [
        { title: "문서", url: "https://docs.example.com/a", snippet: "" }
      ],
      fetchFn: async (url: string) => ({
        url,
        finalUrl: url,
        title: "문서",
        text: "폴백 주제에 대한 실제 근거 내용입니다.",
        contentChars: 30
      }),
      aiFn: async (messages) => {
        const system = messages[0]?.content || "";
        if (system.includes("research planner")) {
          return '{"subQuestions": ["q"], "queries": ["폴백 주제"]}';
        }
        throw new Error("모든 프로바이더 실패");
      }
    });

    const finished = await getResearchJob("alice", job.id);
    assert.equal(finished?.status, "completed");
    assert.ok(finished?.report);
    assert.match(finished!.report!, /근거를 원문 중심으로 정리/u);
    assert.match(finished!.report!, /확인된 근거/u);
    assert.match(finished!.report!, /참고 출처/u);
    assert.ok(
      finished!.progressEvents.some((event) => /근거 중심 보고서로 완료/u.test(event.message))
    );
  });
});

test("evidence-only report contains verbatim excerpts and no invented prose", () => {
  const report = buildEvidenceOnlyReport("주제", {
    evidence: [{ sourceId: "s1", excerpt: "원문 발췌 내용" }],
    sources: [
      {
        id: "s1",
        url: "https://example.com",
        title: "출처 제목",
        domain: "example.com",
        snippet: "",
        query: "주제",
        sourceType: "web",
        fetched: true,
        official: false,
        credibilityScore: 0.5,
        accessedAt: "2026-07-16T00:00:00.000Z",
        publishedAt: null,
        contentChars: 10,
        duplicate: false
      }
    ],
    usedQueries: ["주제"]
  });
  assert.match(report, /\[1\] 출처 제목/u);
  assert.match(report, /원문 발췌 내용/u);
  assert.match(report, /별도의 해석이 더해지지 않았습니다/u);
});

async function withTempDataDir(run: () => Promise<void>) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dreamwish-research-hardening-"));
  const original = process.env.DATA_DIR;
  process.env.DATA_DIR = directory;
  try {
    await run();
  } finally {
    if (original === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = original;
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
