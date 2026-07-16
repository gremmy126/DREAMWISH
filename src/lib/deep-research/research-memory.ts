import { randomUUID } from "node:crypto";
import { createEmbeddingRecord } from "../memory/memory-embedding";
import { writeApprovedMemoryMarkdown } from "../memory/memory-markdown";
import {
  addApprovedMemory,
  readMemoryDb,
  upsertApprovedMemory
} from "../memory/memory-repository";
import type { ApprovedMemory } from "../memory/memory.types";
import type { ResearchJob } from "./deep-research.types";
import {
  getResearchJob,
  mutateResearchJob,
  ResearchJobError
} from "./deep-research.repository";

const RESEARCH_TAG = "deep-research";
const SIMILARITY_THRESHOLD = 0.55;

export type ResearchMemoryResult = {
  status: "created" | "merged" | "existing";
  memoryId: string;
};

export async function approveResearchMemory(ownerId: string, jobId: string) {
  const job = await getResearchJob(ownerId, jobId);
  if (!job) {
    throw new ResearchJobError("RESEARCH_NOT_FOUND", "조사를 찾을 수 없습니다.", 404);
  }
  if (job.status !== "completed" || !job.report) {
    throw new ResearchJobError(
      "RESEARCH_NOT_COMPLETED",
      "완료된 조사 보고서만 메모리에 저장할 수 있습니다.",
      409
    );
  }

  const saved = await saveResearchToMemory(job);
  if (!saved) {
    throw new ResearchJobError(
      "RESEARCH_MEMORY_SAVE_FAILED",
      "조사 보고서를 메모리에 저장하지 못했습니다.",
      500
    );
  }

  const updated = await mutateResearchJob(ownerId, jobId, (record) => {
    if (!record.progressEvents.some((event) => event.step === "memory-approved")) {
      record.progressEvents.push({
        at: new Date().toISOString(),
        step: "memory-approved",
        message:
          saved.status === "merged"
            ? "사용자 승인으로 기존 메모리에 조사 결과를 병합했습니다."
            : "사용자 승인으로 조사 결과를 메모리에 저장했습니다."
      });
    }
    record.currentStep = "조사가 완료되었습니다.";
  });

  return { saved, job: updated! };
}

/**
 * Persists a completed research job into the owner's approved memory.
 * Only distilled results are stored (never intermediate crawl logs), a
 * similar-topic re-run merges into the existing memory with a dated history
 * section instead of duplicating, and the full text lives in the local-first
 * memory store (Markdown + JSON), not in the sync metadata.
 */
export async function saveResearchToMemory(job: ResearchJob): Promise<ResearchMemoryResult | null> {
  if (job.status !== "completed" || !job.report) return null;

  const now = new Date().toISOString();
  const content = buildResearchMemoryContent(job, now);
  const title = `조사: ${job.query.slice(0, 60)}`;

  const db = await readMemoryDb(job.ownerId);
  const alreadySaved = db.memories.find(
    (memory) =>
      memory.ownerId === job.ownerId &&
      memory.status === "approved" &&
      (memory.sourceId === job.id ||
        (memory.history || []).some((event) => event.sourceId === job.id))
  );
  if (alreadySaved) {
    return { status: "existing", memoryId: alreadySaved.id };
  }

  const existing = db.memories.find(
    (memory) =>
      memory.ownerId === job.ownerId &&
      memory.status === "approved" &&
      (memory.tags || []).includes(RESEARCH_TAG) &&
      jaccardSimilarity(tokenize(stripTitlePrefix(memory.title)), tokenize(job.query)) >=
        SIMILARITY_THRESHOLD
  );

  if (existing) {
    const previousConclusion = extractSection(existing.content, "결론");
    const nextConclusion = job.reportSections?.conclusion || "";
    const conflict =
      previousConclusion && nextConclusion && previousConclusion.slice(0, 200) !== nextConclusion.slice(0, 200);
    const mergedContent =
      `${existing.content.trim()}\n\n---\n\n## 재조사 (${now.slice(0, 10)})${conflict ? "\n\n> ⚠ 이전 조사와 다른 결론이 포함되어 있습니다. 시간순 기록을 비교하세요." : ""}\n\n${content}`;
    const base: Omit<ApprovedMemory, "markdownPath"> = {
      ...existing,
      content: mergedContent.slice(0, 120_000),
      preview: content.slice(0, 180),
      version: existing.version + 1,
      updatedAt: now,
      graphUpdatedAt: now,
      history: [
        ...(existing.history || []),
        {
          at: now,
          event: "Research merged",
          sourceId: job.id,
          summary: `같은 주제 재조사 결과를 병합했습니다${conflict ? " (결론 충돌 표시됨)" : ""}.`
        }
      ]
    };
    const embedding = createEmbeddingRecord({ ...base, markdownPath: existing.markdownPath });
    const memory: ApprovedMemory = {
      ...base,
      embeddingId: embedding.id,
      markdownPath: await writeApprovedMemoryMarkdown({ ...base, embeddingId: embedding.id })
    };
    await upsertApprovedMemory(memory, embedding);
    return { status: "merged", memoryId: memory.id };
  }

  const base: Omit<ApprovedMemory, "markdownPath"> = {
    id: randomUUID(),
    ownerId: job.ownerId,
    title,
    content: content.slice(0, 120_000),
    source: "web",
    sourceId: job.id,
    sourceSessionId: job.chatSessionId,
    sourceMessageIds: [],
    projectId: null,
    signals: [],
    importance: 0.8,
    recency: 1,
    frequency: 0.4,
    confidence: 0.8,
    status: "approved",
    version: 1,
    createdAt: now,
    updatedAt: now,
    approvedAt: now,
    approvedBy: job.ownerId,
    approvalNote: "Deep Research 사용자 승인 저장",
    embeddingId: "",
    graphUpdatedAt: now,
    preview: (job.reportSections?.summary || content).slice(0, 180),
    tags: [RESEARCH_TAG],
    history: [
      {
        at: now,
        event: "Research saved",
        sourceId: job.id,
        summary: "Deep Research 완료 결과를 사용자 승인으로 저장했습니다."
      }
    ]
  };
  const embedding = createEmbeddingRecord({ ...base, markdownPath: "" });
  const memory: ApprovedMemory = {
    ...base,
    embeddingId: embedding.id,
    markdownPath: await writeApprovedMemoryMarkdown({ ...base, embeddingId: embedding.id })
  };
  await addApprovedMemory(memory, embedding);
  return { status: "created", memoryId: memory.id };
}

export function buildResearchMemoryContent(job: ResearchJob, savedAt: string): string {
  const sections = job.reportSections;
  const lines: string[] = [
    `# 조사: ${job.query}`,
    "",
    `- 원본 프롬프트: ${job.query}`,
    `- 조사 시작: ${job.startedAt || job.createdAt}`,
    `- 조사 완료: ${job.completedAt || savedAt}`,
    `- 저장 시각: ${savedAt}`
  ];
  const queries = job.checkpoint?.usedQueries || [];
  if (queries.length > 0) lines.push(`- 사용한 검색어: ${queries.join(", ")}`);
  if (job.chatSessionId) lines.push(`- 연결된 대화: ${job.chatSessionId}`);

  if (sections?.summary) lines.push("", "## 핵심 요약", sections.summary);
  if (sections?.findings) lines.push("", "## 주요 발견사항", sections.findings);
  if (sections?.conclusion) lines.push("", "## 결론", sections.conclusion);
  if (sections?.followUp) lines.push("", "## 추가 확인이 필요한 내용", sections.followUp);
  if (!sections?.summary && job.report) lines.push("", "## 보고서", job.report.slice(0, 6000));

  const citedSources = job.sources.filter((source) => source.fetched);
  if (citedSources.length > 0) {
    lines.push(
      "",
      "## 출처",
      ...citedSources
        .slice(0, 20)
        .map(
          (source) =>
            `- [${source.title || source.domain || source.url}](${source.url}) (${source.domain}${source.official ? ", 공식" : ""}, 접근 ${source.accessedAt.slice(0, 10)})`
        )
    );
  }
  if (job.videos.length > 0) {
    lines.push(
      "",
      "## 참고 영상",
      ...job.videos.slice(0, 8).map((video) => `- [${video.title}](${video.url})`)
    );
  }
  return lines.join("\n");
}

function stripTitlePrefix(title: string) {
  return title.replace(/^조사:\s*/u, "");
}

export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9가-힣]+/u)
      .filter((token) => token.length >= 2)
  );
}

export function jaccardSimilarity(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / (left.size + right.size - shared);
}

function extractSection(content: string, heading: string): string {
  const match = content.match(new RegExp(`##\\s*${heading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`, "u"));
  return match?.[1]?.trim() || "";
}
