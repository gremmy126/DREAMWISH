import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  approveResearchMemory,
  buildResearchMemoryContent,
  jaccardSimilarity,
  saveResearchToMemory,
  tokenize
} from "../src/lib/deep-research/research-memory";
import { readMemoryDb } from "../src/lib/memory/memory-repository";
import type { ResearchJob } from "../src/lib/deep-research/deep-research.types";
import { resolveResearchSettings } from "../src/lib/deep-research/research-budget";
import {
  createResearchJob,
  getResearchJob,
  mutateResearchJob
} from "../src/lib/deep-research/deep-research.repository";
import { classifyResearchVideo } from "../src/lib/deep-research/research-videos";
import { parseResearchReportSections } from "../src/lib/deep-research/research-report";

test("completed research is saved once and re-runs merge into the same memory", async () => {
  await withTempDataDir(async () => {
    const first = await saveResearchToMemory(fakeJob("LangGraph 체크포인트 사용법", "결론은 A이다."));
    assert.equal(first?.status, "created");

    const second = await saveResearchToMemory(fakeJob("LangGraph 체크포인트 사용법 정리", "결론은 B이다."));
    assert.equal(second?.status, "merged");
    assert.equal(second?.memoryId, first?.memoryId);

    const db = await readMemoryDb("alice");
    const memories = db.memories.filter((memory) => (memory.tags || []).includes("deep-research"));
    assert.equal(memories.length, 1);
    assert.match(memories[0].content, /재조사/u);
    assert.match(memories[0].content, /다른 결론이 포함되어 있습니다/u);
    assert.equal(memories[0].version, 2);

    const different = await saveResearchToMemory(fakeJob("서울 부동산 시장 전망", "결론"));
    assert.equal(different?.status, "created");
  });
});

test("research memory content keeps only distilled results with sources and videos", () => {
  const job = fakeJob("주제", "결론입니다.");
  const content = buildResearchMemoryContent(job, "2026-07-16T00:00:00.000Z");
  assert.match(content, /원본 프롬프트: 주제/u);
  assert.match(content, /사용한 검색어/u);
  assert.match(content, /## 핵심 요약/u);
  assert.match(content, /## 출처/u);
  assert.match(content, /## 참고 영상/u);
  assert.doesNotMatch(content, /progressEvents|checkpoint/u);
});

test("legacy completed research without videos can still be saved to memory", async () => {
  await withTempDataDir(async () => {
    const legacyJob = fakeJob("오래된 조사", "저장되어야 합니다.");
    delete (legacyJob as Partial<ResearchJob>).videos;

    const saved = await saveResearchToMemory(legacyJob);

    assert.equal(saved?.status, "created");
  });
});

test("incomplete jobs are never saved to memory", async () => {
  await withTempDataDir(async () => {
    const job = { ...fakeJob("미완료", "x"), status: "failed" as const };
    assert.equal(await saveResearchToMemory(job), null);
  });
});

test("approving the same completed research twice saves it only once", async () => {
  await withTempDataDir(async () => {
    const job = fakeJob("중복 승인 방지", "한 번만 저장한다.");
    const first = await saveResearchToMemory(job);
    const second = await saveResearchToMemory(job);

    assert.equal(first?.status, "created");
    assert.equal(second?.status, "existing");
    assert.equal(second?.memoryId, first?.memoryId);

    const db = await readMemoryDb("alice");
    assert.equal(db.memories.length, 1);
    assert.equal(db.memories[0].version, 1);
  });
});

test("research memory approval is owner-scoped and records durable approval state", async () => {
  await withTempDataDir(async () => {
    const job = await createResearchJob({
      ownerId: "alice",
      query: "승인 저장 테스트",
      settings: resolveResearchSettings({ mode: "standard" })
    });
    await mutateResearchJob("alice", job.id, (record) => {
      record.status = "completed";
      record.progress = 100;
      record.report = "## 핵심 요약\n승인된 결과";
      record.reportSections = {
        summary: "승인된 결과",
        findings: "",
        conclusion: "",
        followUp: ""
      };
      record.completedAt = "2026-07-16T00:00:00.000Z";
    });

    await assert.rejects(
      approveResearchMemory("bob", job.id),
      /조사를 찾을 수 없습니다/u
    );

    const approved = await approveResearchMemory("alice", job.id);
    assert.equal(approved.saved.status, "created");
    assert.ok(
      approved.job.progressEvents.some((event) => event.step === "memory-approved")
    );
    assert.equal((await getResearchJob("alice", job.id))?.currentStep, "조사가 완료되었습니다.");
    assert.equal((await readMemoryDb("alice")).memories.length, 1);
  });
});

test("similarity tokenizer treats reworded same-topic queries as related", () => {
  const left = tokenize("LangGraph 체크포인트 사용법");
  const right = tokenize("LangGraph 체크포인트 사용법 정리");
  assert.ok(jaccardSimilarity(left, right) >= 0.55);
  assert.ok(jaccardSimilarity(tokenize("완전히 다른 주제"), left) < 0.2);
});

test("video classification accepts only validated video URLs", () => {
  const video = classifyResearchVideo(
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "튜토리얼",
    "설명",
    "질문"
  );
  assert.ok(video);
  assert.match(video!.thumbnailUrl || "", /i\.ytimg\.com/u);
  assert.equal(classifyResearchVideo("https://example.com/page", "t", "s", "q"), null);
  assert.equal(
    classifyResearchVideo("https://youtube.com/watch?v=<script>", "t", "s", "q"),
    null
  );
});

test("report sections parse deterministically from markdown headers", () => {
  const sections = parseResearchReportSections(
    "## 핵심 요약\n요약 내용\n\n## 상세 분석\n분석\n\n## 결론\n결론 내용\n\n## 상충되는 정보와 한계\n한계"
  );
  assert.equal(sections.summary, "요약 내용");
  assert.equal(sections.conclusion, "결론 내용");
  assert.equal(sections.followUp, "한계");
});

function fakeJob(query: string, conclusion: string): ResearchJob {
  const now = "2026-07-16T00:00:00.000Z";
  return {
    id: `job_${Math.random()}`,
    ownerId: "alice",
    chatSessionId: null,
    query,
    mode: "standard",
    settings: resolveResearchSettings({ mode: "standard" }),
    status: "completed",
    progress: 100,
    currentStep: "완료",
    progressEvents: [],
    checkpoint: {
      stage: "done",
      subQuestions: [query],
      pendingQueries: [],
      usedQueries: [query, `${query} 공식 자료`],
      evidence: [],
      iteration: 1
    },
    report: `## 핵심 요약\n요약\n\n## 결론\n${conclusion}`,
    reportSections: { summary: "요약", findings: "", conclusion, followUp: "" },
    sources: [
      {
        id: "s1",
        url: "https://docs.example.com/guide",
        title: "공식 문서",
        domain: "docs.example.com",
        snippet: "",
        query,
        sourceType: "web",
        fetched: true,
        official: true,
        credibilityScore: 0.9,
        accessedAt: now,
        publishedAt: null,
        contentChars: 100,
        duplicate: false
      }
    ],
    videos: [
      {
        id: "v1",
        url: "https://www.youtube.com/watch?v=abcdefghijk",
        title: "관련 영상",
        channel: null,
        description: "",
        thumbnailUrl: null,
        publishedAt: null,
        durationLabel: null,
        relatedQuery: query
      }
    ],
    error: null,
    usage: { searches: 2, pagesFetched: 1, aiCalls: 2 },
    cancelRequested: false,
    pauseRequested: false,
    heartbeatAt: now,
    createdAt: now,
    startedAt: now,
    completedAt: now,
    updatedAt: now
  };
}

async function withTempDataDir(run: () => Promise<void>) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dreamwish-research-memory-"));
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
