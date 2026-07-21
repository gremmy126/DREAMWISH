import { randomUUID } from "node:crypto";
import {
  mutateOwnerState,
  readOwnerState,
  type OwnerStateStore
} from "../db/owner-state-store";
import { listDecisions } from "../decisions/decision.repository";
import type { Decision } from "../decisions/decision.types";
import { readMemoryDb } from "../memory/memory-repository";
import {
  MEMORY_OS_TYPE_LABELS,
  isMemoryOsStatus,
  isMemoryOsType,
  type MemoryOsItem,
  type MemoryOsOverview,
  type MemoryOsPattern,
  type MemoryOsState,
  type MemoryOsType
} from "./memory-os.types";

export const MEMORY_OS_STORE: OwnerStateStore<MemoryOsState> = {
  namespace: "memory-os-state",
  fileName: "memory-os.json",
  fallback: () => ({ items: [], lastSyncAt: null })
};

// ---------------------------------------------------------------------------
// Derivation — decisions, retrospectives, research, and legacy memories flow
// into the Memory OS automatically (idempotent via sourceRef). The AI only
// creates suggestions; the user confirms them.
// ---------------------------------------------------------------------------

const LEGACY_CATEGORY_MAP: Record<string, MemoryOsType> = {
  Projects: "knowledge",
  Knowledge: "knowledge",
  Ideas: "idea",
  Tasks: "knowledge",
  Meetings: "meeting",
  Learning: "lesson",
  Coding: "knowledge",
  CRM: "customer",
  Business: "knowledge",
  Automation: "knowledge",
  Documents: "knowledge",
  Settings: "policy"
};

export async function syncDerivedMemories(ownerId: string): Promise<void> {
  const [legacyDb, decisions] = await Promise.all([
    readMemoryDb(ownerId),
    listDecisions(ownerId)
  ]);

  const candidates = legacyDb.candidates.filter(
    (candidate) => candidate.ownerId === ownerId && candidate.status === "pending"
  );
  const approved = legacyDb.memories.filter(
    (memory) => memory.ownerId === ownerId && memory.status === "approved"
  );

  await mutateOwnerState(MEMORY_OS_STORE, ownerId, (state) => {
    const known = new Set(
      state.items.map((item) => item.sourceRef).filter((ref): ref is string => Boolean(ref))
    );
    const push = (item: MemoryOsItem) => {
      if (item.sourceRef && known.has(item.sourceRef)) return;
      if (item.sourceRef) known.add(item.sourceRef);
      state.items.push(item);
    };

    for (const memory of approved) {
      push(
        buildItem({
          sourceRef: `legacy:${memory.id}`,
          title: memory.title,
          content: memory.content,
          type: LEGACY_CATEGORY_MAP[memory.category || ""] || "knowledge",
          status: "confirmed",
          source: "ai",
          tags: memory.tags || [],
          confidence: Math.round((memory.confidence || 0.6) * 100),
          importance: Math.max(1, Math.min(5, Math.round((memory.importance || 0.5) * 5))),
          createdAt: memory.createdAt
        })
      );
    }
    for (const candidate of candidates) {
      push(
        buildItem({
          sourceRef: `legacy-candidate:${candidate.id}`,
          title: candidate.title,
          content: candidate.content,
          type: LEGACY_CATEGORY_MAP[candidate.category || ""] || "knowledge",
          status: "suggestion",
          source: "ai",
          tags: candidate.tags || [],
          confidence: Math.round((candidate.confidence || 0.5) * 100),
          importance: Math.max(1, Math.min(5, Math.round((candidate.importance || 0.4) * 5))),
          createdAt: candidate.createdAt
        })
      );
    }

    for (const decision of decisions) {
      deriveFromDecision(decision).forEach(push);
    }

    state.lastSyncAt = new Date().toISOString();
  });
}

function deriveFromDecision(decision: Decision): MemoryOsItem[] {
  const items: MemoryOsItem[] = [];
  const confidenceMap = { low: 55, medium: 72, high: 90 } as const;
  const project = decision.title.slice(0, 60);

  if (decision.recommendation) {
    items.push(
      buildItem({
        sourceRef: `decision:${decision.id}`,
        title: decision.title,
        content:
          `${decision.problem.statement || decision.title}\n\n권고: ${decision.recommendation.summary}\n` +
          `근거: ${decision.recommendation.rationale}`,
        type: "decision",
        status: decision.finalDecision ? "confirmed" : "suggestion",
        source: "ai",
        project,
        decisionId: decision.id,
        tags: dedupe(["의사결정", ...decision.problem.constraints.slice(0, 3)]),
        confidence: confidenceMap[decision.recommendation.confidence],
        importance: decision.finalDecision ? 5 : 4,
        insights: decision.recommendation.counterpoints.slice(0, 4),
        createdAt: decision.createdAt
      })
    );
  }
  if (decision.research?.status === "completed" && decision.research.summary) {
    items.push(
      buildItem({
        sourceRef: `research:${decision.id}`,
        title: `딥리서치: ${decision.title.slice(0, 60)}`,
        content: `${decision.research.summary}\n\n${decision.research.findings}`.trim(),
        type: "research",
        status: "confirmed",
        source: "ai",
        project,
        decisionId: decision.id,
        tags: ["딥리서치", `출처 ${decision.research.sourceCount}건`],
        confidence: Math.min(90, 50 + decision.research.sourceCount * 4),
        importance: 4,
        createdAt: decision.research.updatedAt
      })
    );
  }
  if (decision.simulationResult) {
    const top = decision.simulationResult.ranking[0];
    items.push(
      buildItem({
        sourceRef: `simulation:${decision.id}`,
        title: `시뮬레이션: ${decision.title.slice(0, 56)}`,
        content:
          decision.simulationResult.scenarios
            .map((scenario) => `${scenario.label} ${scenario.probability}% — ${scenario.expectedOutcome}`)
            .join("\n") + (top ? `\n1위 대안: ${top.title} ${top.total}점` : ""),
        type: "simulation",
        status: "confirmed",
        source: "ai",
        project,
        decisionId: decision.id,
        tags: ["시뮬레이션", ...(top ? [top.title] : [])],
        confidence: 70,
        importance: 3,
        createdAt: decision.simulationResult.computedAt
      })
    );
  }
  if (decision.retrospective) {
    items.push(
      buildItem({
        sourceRef: `outcome:${decision.id}`,
        title: `결과: ${decision.title.slice(0, 60)}`,
        content: decision.retrospective.outcome,
        type: "outcome",
        status: "confirmed",
        source: "human",
        project,
        decisionId: decision.id,
        tags: ["결과 회고"],
        confidence: 85,
        importance: 5,
        createdAt: decision.retrospective.reviewedAt
      })
    );
    decision.retrospective.lessons.forEach((lesson, index) => {
      items.push(
        buildItem({
          sourceRef: `lesson:${decision.id}:${index}`,
          title: `교훈: ${lesson.slice(0, 70)}`,
          content: lesson,
          type: "lesson",
          status: "confirmed",
          source: "human",
          project,
          decisionId: decision.id,
          tags: ["교훈"],
          confidence: 80,
          importance: 4,
          createdAt: decision.retrospective?.reviewedAt || decision.updatedAt
        })
      );
    });
  }
  return items;
}

export function buildItem(input: {
  sourceRef?: string | null;
  title: string;
  content: string;
  type: MemoryOsType;
  status?: MemoryOsItem["status"];
  source?: "ai" | "human";
  project?: string;
  decisionId?: string | null;
  tags?: string[];
  confidence?: number;
  importance?: number;
  insights?: string[];
  createdAt?: string;
  createdBy?: string;
}): MemoryOsItem {
  const now = new Date().toISOString();
  const content = input.content.trim();
  return {
    id: randomUUID(),
    sourceRef: input.sourceRef || null,
    title: input.title.trim().slice(0, 160),
    description: content.replace(/\s+/gu, " ").slice(0, 140),
    content,
    type: input.type,
    status: input.status || "suggestion",
    source: input.source || "human",
    project: (input.project || "").slice(0, 80),
    decisionId: input.decisionId || null,
    tags: dedupe(input.tags || []).slice(0, 8),
    confidence: clampPercent(input.confidence ?? 60),
    importance: Math.max(1, Math.min(5, input.importance ?? 3)),
    usageCount: 0,
    favorite: false,
    insights: (input.insights || []).slice(0, 6),
    aiSummary: null,
    versions: [
      { version: 1, content, summary: "최초 생성", editedBy: input.source === "human" ? "user" : "ai", editedAt: now }
    ],
    createdBy: input.createdBy || (input.source === "human" ? "나" : "AI"),
    createdAt: input.createdAt || now,
    updatedAt: input.createdAt || now,
    lastUsedAt: null
  };
}

// ---------------------------------------------------------------------------
// Query / search / related / overview
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  "관련", "관련된", "했던", "하는", "그리고", "또는", "대한", "위한", "작년에", "올해",
  "어떤", "무엇", "the", "a", "of", "and"
]);

export function searchScore(item: MemoryOsItem, query: string): number {
  const tokens = query
    .toLowerCase()
    .split(/[\s,./]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
  if (!tokens.length) return 1;
  const haystacks: Array<[string, number]> = [
    [item.title.toLowerCase(), 5],
    [item.tags.join(" ").toLowerCase(), 4],
    [item.project.toLowerCase(), 3],
    [item.description.toLowerCase(), 2],
    [item.content.toLowerCase(), 1],
    [MEMORY_OS_TYPE_LABELS[item.type], 4]
  ];
  let score = 0;
  for (const token of tokens) {
    for (const [text, weight] of haystacks) {
      if (text.includes(token)) score += weight;
    }
  }
  return score;
}

export function relatedScore(a: MemoryOsItem, b: MemoryOsItem): number {
  if (a.id === b.id) return 0;
  let score = 0;
  if (a.decisionId && a.decisionId === b.decisionId) score += 6;
  if (a.project && a.project === b.project) score += 4;
  const sharedTags = a.tags.filter((tag) => b.tags.includes(tag)).length;
  score += sharedTags * 2;
  if (a.type === b.type) score += 1;
  return score;
}

export function findRelated(item: MemoryOsItem, all: MemoryOsItem[], limit = 6) {
  return all
    .filter((candidate) => candidate.id !== item.id && candidate.status !== "archived")
    .map((candidate) => ({ item: candidate, score: relatedScore(item, candidate) }))
    .filter((entry) => entry.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function detectPatterns(items: MemoryOsItem[]): MemoryOsPattern[] {
  const learningItems = items.filter(
    (item) =>
      item.status === "confirmed" &&
      (item.type === "lesson" || item.type === "outcome" || item.type === "risk")
  );
  const byTag = new Map<string, MemoryOsItem[]>();
  for (const item of learningItems) {
    for (const tag of item.tags) {
      if (tag === "교훈" || tag === "결과 회고") continue;
      const bucket = byTag.get(tag) || [];
      bucket.push(item);
      byTag.set(tag, bucket);
    }
  }
  const patterns: MemoryOsPattern[] = [];
  for (const [tag, bucket] of byTag) {
    if (bucket.length < 2) continue;
    patterns.push({
      id: `pattern-${tag}`,
      title: `반복 패턴: ${tag}`,
      description: `${tag} 관련 교훈·결과가 ${bucket.length}회 반복되었습니다. 다음 결정에서 우선 검토하세요.`,
      evidenceCount: bucket.length,
      memoryIds: bucket.map((item) => item.id)
    });
  }
  return patterns.sort((a, b) => b.evidenceCount - a.evidenceCount).slice(0, 4);
}

export function buildOverview(items: MemoryOsItem[]): MemoryOsOverview {
  const active = items.filter((item) => item.status !== "expired");
  const confirmed = active.filter((item) => item.status === "confirmed");
  const suggestions = active.filter((item) => item.status === "suggestion");
  const archived = active.filter((item) => item.status === "archived");
  const monthAgo = Date.now() - 30 * 86_400_000;
  const recentCount = (list: MemoryOsItem[]) =>
    list.filter((item) => Date.parse(item.createdAt) >= monthAgo).length;

  const withRelated = active.map((item) => ({
    item,
    relatedCount: findRelated(item, active, 12).length
  }));
  const mostUsed = [...active].sort((a, b) => b.usageCount - a.usageCount)[0] || null;
  const mostConnected = [...withRelated].sort((a, b) => b.relatedCount - a.relatedCount)[0] || null;
  const mostValuable =
    [...withRelated]
      .map((entry) => ({
        ...entry,
        score:
          entry.item.importance * 20 +
          entry.relatedCount * 8 +
          entry.item.usageCount * 4 +
          Math.round(entry.item.confidence / 5)
      }))
      .sort((a, b) => b.score - a.score)[0] || null;
  const aiPick =
    suggestions.sort((a, b) => b.confidence - a.confidence)[0] ||
    confirmed.find((item) => item.type === "lesson") ||
    null;

  const distribution = (Object.keys(MEMORY_OS_TYPE_LABELS) as MemoryOsType[])
    .map((type) => ({
      type,
      count: active.filter((item) => item.type === type).length,
      percent: active.length
        ? Math.round((active.filter((item) => item.type === type).length / active.length) * 1000) / 10
        : 0
    }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count);

  return {
    kpis: {
      total: active.length,
      confirmed: confirmed.length,
      suggestions: suggestions.length,
      archived: archived.length,
      recentlyUsed: active.filter(
        (item) => item.lastUsedAt && Date.parse(item.lastUsedAt) >= monthAgo
      ).length,
      deltas: {
        total: recentCount(active),
        confirmed: recentCount(confirmed),
        suggestions: recentCount(suggestions),
        archived: recentCount(archived)
      }
    },
    distribution,
    patterns: detectPatterns(active),
    insights: {
      mostUsed: mostUsed
        ? { id: mostUsed.id, title: mostUsed.title, usageCount: mostUsed.usageCount }
        : null,
      mostConnected: mostConnected
        ? {
            id: mostConnected.item.id,
            title: mostConnected.item.title,
            relatedCount: mostConnected.relatedCount
          }
        : null,
      mostValuable: mostValuable
        ? { id: mostValuable.item.id, title: mostValuable.item.title, score: mostValuable.score }
        : null,
      aiPick: aiPick
        ? {
            id: aiPick.id,
            title: aiPick.title,
            reason:
              aiPick.status === "suggestion"
                ? "승인 대기 중인 신뢰도 최상위 제안입니다."
                : "다음 결정에 재사용 가치가 높은 교훈입니다."
          }
        : null
    }
  };
}

// ---------------------------------------------------------------------------
// CRUD + lifecycle
// ---------------------------------------------------------------------------

export async function listMemoryOs(ownerId: string): Promise<MemoryOsState> {
  return readOwnerState(MEMORY_OS_STORE, ownerId);
}

export async function createMemoryOsItem(
  ownerId: string,
  input: Record<string, unknown>
): Promise<MemoryOsItem> {
  const title = String(input.title || "").trim();
  const content = String(input.content || "").trim();
  if (!title || !content) throw new Error("제목과 내용을 입력하세요.");
  const item = buildItem({
    title,
    content,
    type: isMemoryOsType(input.type) ? input.type : "knowledge",
    status: input.status === "suggestion" ? "suggestion" : "confirmed",
    source: input.status === "suggestion" ? "ai" : "human",
    project: typeof input.project === "string" ? input.project : "",
    tags: Array.isArray(input.tags) ? input.tags.map((tag) => String(tag)) : [],
    importance: typeof input.importance === "number" ? input.importance : 3,
    confidence: typeof input.confidence === "number" ? input.confidence : 75
  });
  await mutateOwnerState(MEMORY_OS_STORE, ownerId, (state) => {
    state.items.unshift(item);
  });
  return item;
}

export async function updateMemoryOsItem(
  ownerId: string,
  itemId: string,
  patch: Record<string, unknown>
): Promise<MemoryOsItem | null> {
  return mutateOwnerState(MEMORY_OS_STORE, ownerId, (state) => {
    const item = state.items.find((candidate) => candidate.id === itemId);
    if (!item) return null;
    const now = new Date().toISOString();

    if (typeof patch.title === "string" && patch.title.trim()) {
      item.title = patch.title.trim().slice(0, 160);
    }
    if (typeof patch.content === "string" && patch.content.trim() && patch.content !== item.content) {
      item.content = patch.content.trim();
      item.description = item.content.replace(/\s+/gu, " ").slice(0, 140);
      item.versions.push({
        version: item.versions.length + 1,
        content: item.content,
        summary: typeof patch.versionNote === "string" ? patch.versionNote.slice(0, 120) : "내용 수정",
        editedBy: "user",
        editedAt: now
      });
    }
    if (isMemoryOsType(patch.type)) item.type = patch.type;
    if (isMemoryOsStatus(patch.status)) item.status = patch.status;
    if (typeof patch.favorite === "boolean") item.favorite = patch.favorite;
    if (Array.isArray(patch.tags)) {
      item.tags = dedupe(patch.tags.map((tag) => String(tag))).slice(0, 8);
    }
    if (typeof patch.project === "string") item.project = patch.project.slice(0, 80);
    if (typeof patch.importance === "number") {
      item.importance = Math.max(1, Math.min(5, Math.round(patch.importance)));
    }
    if (typeof patch.confidence === "number") item.confidence = clampPercent(patch.confidence);
    if (patch.recordUsage === true) {
      item.usageCount += 1;
      item.lastUsedAt = now;
      return structuredClone(item);
    }
    if (typeof patch.restoreVersion === "number") {
      const version = item.versions.find((entry) => entry.version === patch.restoreVersion);
      if (version) {
        item.content = version.content;
        item.description = version.content.replace(/\s+/gu, " ").slice(0, 140);
        item.versions.push({
          version: item.versions.length + 1,
          content: version.content,
          summary: `v${version.version} 복원`,
          editedBy: "user",
          editedAt: now
        });
      }
    }
    if (patch.aiSummary && typeof patch.aiSummary === "object") {
      item.aiSummary = patch.aiSummary as MemoryOsItem["aiSummary"];
    }
    item.updatedAt = now;
    return structuredClone(item);
  });
}

export async function deleteMemoryOsItem(ownerId: string, itemId: string): Promise<boolean> {
  return mutateOwnerState(MEMORY_OS_STORE, ownerId, (state) => {
    const index = state.items.findIndex((candidate) => candidate.id === itemId);
    if (index < 0) return false;
    state.items.splice(index, 1);
    return true;
  });
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
