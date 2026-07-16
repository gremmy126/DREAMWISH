import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  appendResearchProgress,
  createResearchJob,
  getResearchJob,
  listResearchJobs,
  mutateResearchJob,
  recoverStaleResearchJobs,
  requestResearchCancel,
  requestResearchPause
} from "../src/lib/deep-research/deep-research.repository";
import { resolveResearchSettings, RESEARCH_LIMITS } from "../src/lib/deep-research/research-budget";
import {
  canonicalizeUrl,
  computeCredibility,
  decideNextResearchStep,
  parsePlanResponse,
  parseQueryList,
  runResearchJob
} from "../src/lib/deep-research/research-runner";
import { toResearchJobView } from "../src/lib/deep-research/deep-research.types";
import { readMemoryDb } from "../src/lib/memory/memory-repository";

test("research settings clamp custom budgets to hard limits", () => {
  const settings = resolveResearchSettings({
    mode: "custom",
    maxDurationMs: 100 * 60_000,
    maxSearchQueries: 500,
    maxPages: 999,
    maxSources: 999,
    minSources: 999,
    concurrency: 50
  });
  assert.equal(settings.maxDurationMs, RESEARCH_LIMITS.maxDurationMs);
  assert.equal(settings.maxSearchQueries, RESEARCH_LIMITS.maxSearchQueries);
  assert.equal(settings.maxPages, RESEARCH_LIMITS.maxPages);
  assert.equal(settings.maxSources, RESEARCH_LIMITS.maxSources);
  assert.ok(settings.minSources <= settings.maxSources);
  assert.equal(settings.concurrency, RESEARCH_LIMITS.maxConcurrency);
});

test("mode presets fill budgets and duration override is respected", () => {
  const deep = resolveResearchSettings({ mode: "deep" });
  assert.equal(deep.maxDurationMs, 10 * 60_000);
  assert.equal(deep.autoSave, false);
  const custom = resolveResearchSettings({ mode: "deep", maxDurationMs: 60_000 });
  assert.equal(custom.maxDurationMs, 60_000);
  const tooShort = resolveResearchSettings({ mode: "custom", maxDurationMs: 5 });
  assert.equal(tooShort.maxDurationMs, RESEARCH_LIMITS.minDurationMs);
});

test("research jobs are owner-scoped and single-active per owner", async () => {
  await withTempDataDir(async () => {
    const settings = resolveResearchSettings({ mode: "standard" });
    const job = await createResearchJob({ ownerId: "alice", query: "질문", settings });
    await assert.rejects(
      createResearchJob({ ownerId: "alice", query: "두번째", settings }),
      /진행 중인 심층 조사/u
    );
    await createResearchJob({ ownerId: "bob", query: "다른 사용자", settings });

    assert.equal((await listResearchJobs("alice")).length, 1);
    assert.equal((await listResearchJobs("bob")).length, 1);
    assert.equal(await getResearchJob("bob", job.id), null);
  });
});

test("cancel and pause requests transition safely", async () => {
  await withTempDataDir(async () => {
    const settings = resolveResearchSettings({ mode: "standard" });
    const job = await createResearchJob({ ownerId: "alice", query: "취소 테스트", settings });

    const cancelled = await requestResearchCancel("alice", job.id);
    assert.equal(cancelled?.status, "cancelled");

    const second = await createResearchJob({ ownerId: "alice", query: "일시정지 테스트", settings });
    await appendResearchProgress("alice", second.id, {
      status: "searching",
      step: "search",
      message: "검색 중"
    });
    const paused = await requestResearchPause("alice", second.id);
    assert.equal(paused?.pauseRequested, true);

    assert.equal(await requestResearchCancel("bob", second.id), null);
  });
});

test("stale running jobs are recovered to a resumable paused state", async () => {
  await withTempDataDir(async () => {
    const settings = resolveResearchSettings({ mode: "standard" });
    const job = await createResearchJob({ ownerId: "alice", query: "복구 테스트", settings });
    await mutateResearchJob("alice", job.id, (record) => {
      record.status = "reading";
      record.heartbeatAt = new Date(Date.now() - 10 * 60_000).toISOString();
      record.checkpoint = {
        stage: "read",
        subQuestions: ["질문"],
        pendingQueries: [],
        usedQueries: ["질문"],
        evidence: [],
        iteration: 1
      };
    });

    const recovered = await recoverStaleResearchJobs({ now: new Date() });
    assert.equal(recovered, 1);
    const after = await getResearchJob("alice", job.id);
    assert.equal(after?.status, "paused");
    assert.equal(toResearchJobView(after!).resumable, true);

    const runningKept = await recoverStaleResearchJobs({
      isLocallyRunning: () => true,
      now: new Date()
    });
    assert.equal(runningKept, 0);
  });
});

test("plan parsing falls back deterministically when AI output is not JSON", () => {
  const parsed = parsePlanResponse("모델이 JSON을 반환하지 않음", "LangGraph 사용법", 6);
  assert.ok(parsed.queries.length >= 1);
  assert.equal(parsed.queries[0], "LangGraph 사용법");
  assert.deepEqual(parsed.subQuestions, ["LangGraph 사용법"]);

  const json = parsePlanResponse(
    '설명 {"subQuestions": ["a"], "queries": ["q1", "q2"]} 끝',
    "주제",
    6
  );
  assert.deepEqual(json.queries, ["q1", "q2"]);

  assert.deepEqual(parseQueryList('{"queries": ["다음 검색"]}', 4), ["다음 검색"]);
});

test("assessment finishes early with enough evidence and stops at deadline", () => {
  const settings = resolveResearchSettings({ mode: "standard" });
  const evidence = [
    { sourceId: "s1", excerpt: "a" },
    { sourceId: "s2", excerpt: "b" },
    { sourceId: "s3", excerpt: "c" }
  ];
  const base = {
    evidence,
    sources: [],
    iteration: 1,
    usedQueries: ["q1"]
  };
  assert.equal(decideNextResearchStep(base, settings, 120_000), "write");
  assert.equal(
    decideNextResearchStep({ ...base, evidence: [] }, settings, 120_000),
    "search"
  );
  assert.equal(decideNextResearchStep({ ...base, evidence: [] }, settings, 5_000), "write");
  assert.equal(
    decideNextResearchStep({ ...base, evidence: [], iteration: 99 }, settings, 120_000),
    "write"
  );
});

test("URL canonicalization dedupes tracking variants and credibility ranks official sources", () => {
  assert.equal(
    canonicalizeUrl("https://example.com/page/?utm_source=x&utm_medium=y"),
    canonicalizeUrl("https://example.com/page")
  );
  const official = computeCredibility("https://docs.python.org/3/", true);
  const community = computeCredibility("https://someone.tistory.com/1", true);
  assert.ok(official.official);
  assert.ok(official.score > community.score);
  assert.ok(!community.official);
});

test("research runner completes end-to-end with injected search, fetch and AI", async () => {
  await withTempDataDir(async () => {
    const settings = resolveResearchSettings({ mode: "custom", minSources: 1, maxSearchQueries: 3 });
    const job = await createResearchJob({ ownerId: "alice", query: "테스트 주제", settings });

    await runResearchJob("alice", job.id, {
      searchFn: async () => [
        { title: "공식 문서", url: "https://docs.example.com/guide", snippet: "가이드" }
      ],
      fetchFn: async (url: string) => ({
        url,
        finalUrl: url,
        title: "공식 문서",
        text: "테스트 주제에 대한 핵심 내용. 결론은 A이다.",
        contentChars: 30
      }),
      aiFn: async (messages) => {
        const system = messages[0]?.content || "";
        if (system.includes("research planner")) {
          return '{"subQuestions": ["핵심?"], "queries": ["테스트 주제"]}';
        }
        return "## 핵심 요약\n결론은 A이다 [1]\n\n## 상세 분석\n내용 [1]";
      }
    });

    const finished = await getResearchJob("alice", job.id);
    assert.equal(finished?.status, "completed");
    assert.ok(finished?.report);
    assert.match(finished!.report!, /참고 출처/u);
    assert.match(finished!.report!, /docs\.example\.com/u);
    assert.equal(finished?.progress, 100);
    assert.ok(finished!.usage.searches >= 1);
    assert.ok(finished!.usage.pagesFetched >= 1);
    assert.equal((await readMemoryDb("alice")).memories.length, 0);
  });
});

test("research runner honors a pre-set cancel request", async () => {
  await withTempDataDir(async () => {
    const settings = resolveResearchSettings({ mode: "standard" });
    const job = await createResearchJob({ ownerId: "alice", query: "중단 주제", settings });
    await mutateResearchJob("alice", job.id, (record) => {
      record.cancelRequested = true;
    });

    await runResearchJob("alice", job.id, {
      searchFn: async () => [],
      fetchFn: async () => {
        throw new Error("호출되면 안 됨");
      },
      aiFn: async () => "{}"
    });

    const finished = await getResearchJob("alice", job.id);
    assert.equal(finished?.status, "cancelled");
  });
});

async function withTempDataDir(run: () => Promise<void>) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dreamwish-research-"));
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
