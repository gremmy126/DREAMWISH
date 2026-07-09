import { randomUUID } from "node:crypto";
import { createEmbeddingRecord } from "@/src/lib/memory/memory-embedding";
import { buildKnowledgeNetwork } from "@/src/lib/memory/knowledge-network";
import { writeApprovedMemoryMarkdown } from "@/src/lib/memory/memory-markdown";
import {
  addApprovedMemory,
  readMemoryDb,
  upsertMemoryCandidate
} from "@/src/lib/memory/memory-repository";
import type {
  ApprovedMemory,
  DailyMemoryBrief,
  MemoryCandidate,
  MemoryDashboardSnapshot,
  MemorySignal,
  MemorySource,
  MemoryStatus
} from "@/src/lib/memory/memory.types";

export async function createMemoryCandidate(input: {
  source: MemorySource;
  content: string;
  signals?: MemorySignal[];
  projectId?: string | null;
  sourceId?: string | null;
  title?: string;
  preview?: string;
  importance?: number;
  confidence?: number;
}) {
  const now = new Date().toISOString();
  const content = input.content.trim();
  const signals = input.signals?.length ? input.signals : inferSignals(content);
  const db = await readMemoryDb();
  const frequency = countSimilar(content, [
    ...db.candidates.map((candidate) => candidate.content),
    ...db.memories.map((memory) => memory.content)
  ]);
  const candidate: MemoryCandidate = {
    id: randomUUID(),
    title: input.title?.trim() || summarizeTitle(content),
    content,
    source: input.source,
    sourceId: input.sourceId || null,
    projectId: input.projectId || null,
    signals,
    importance: clampMetric(input.importance ?? scoreImportance(content, signals, frequency)),
    recency: 1,
    frequency,
    confidence: clampMetric(input.confidence ?? scoreConfidence(content, signals)),
    status: "pending",
    createdAt: now,
    updatedAt: now,
    preview: input.preview?.trim() || content.slice(0, 220)
  };
  return upsertMemoryCandidate(candidate);
}

export async function listMemoryCandidates(filter: { status?: MemoryStatus; projectId?: string | null } = {}) {
  const candidates = (await readMemoryDb()).candidates;
  return candidates.filter((candidate) => {
    if (filter.status && candidate.status !== filter.status) return false;
    if (filter.projectId !== undefined && candidate.projectId !== filter.projectId) return false;
    return true;
  });
}

export async function approveMemoryCandidate(
  candidateId: string,
  approval: { approvedBy: string; note?: string | null }
) {
  const db = await readMemoryDb();
  const existing = db.memories.find((memory) => memory.id === candidateId);
  if (existing) return existing;

  const candidate = db.candidates.find((item) => item.id === candidateId);
  if (!candidate) throw new Error("Memory candidate not found");
  const now = new Date().toISOString();
  const approvedBase: Omit<ApprovedMemory, "markdownPath"> = {
    ...candidate,
    status: "approved",
    updatedAt: now,
    approvedAt: now,
    approvedBy: approval.approvedBy,
    approvalNote: approval.note || null,
    embeddingId: "",
    graphUpdatedAt: now
  };
  const embedding = createEmbeddingRecord({ ...approvedBase, markdownPath: "" });
  const memory: ApprovedMemory = {
    ...approvedBase,
    embeddingId: embedding.id,
    markdownPath: await writeApprovedMemoryMarkdown({ ...approvedBase, embeddingId: embedding.id })
  };
  return addApprovedMemory(memory, embedding);
}

export async function listApprovedMemories(filter: { projectId?: string | null } = {}) {
  const memories = (await readMemoryDb()).memories;
  if (filter.projectId === undefined) return memories;
  return memories.filter((memory) => memory.projectId === filter.projectId);
}

export async function generateDailyMemoryBrief(input: { date?: string } = {}): Promise<DailyMemoryBrief> {
  const date = input.date || new Date().toISOString().slice(0, 10);
  const db = await readMemoryDb();
  const graph = await buildKnowledgeNetwork();
  const memories = db.memories;
  const tasks = memories
    .filter((memory) => memory.signals.includes("todo") || /(해야|todo|follow[- ]?up|후속|미해결)/iu.test(memory.content))
    .slice(0, 8)
    .map((memory) => memory.title);
  const projectNodes = graph.nodes.filter((node) => node.type === "project");
  const peopleNodes = graph.nodes.filter((node) => node.type === "person");
  const staleProjects = findStaleProjectNames(memories);
  const unresolvedIssues = memories
    .filter((memory) => /(issue|blocked|미해결|문제|오류|확인 필요)/iu.test(memory.content))
    .slice(0, 8)
    .map((memory) => memory.title);
  const likelyForgotten = memories
    .filter((memory) => memory.importance >= 0.7 && memory.recency < 0.45)
    .slice(0, 8)
    .map((memory) => memory.title);

  return {
    date,
    todayTasks: tasks,
    recentProjects: projectNodes.slice(0, 8).map((node) => node.label),
    staleProjects,
    recentPeople: peopleNodes.slice(0, 8).map((node) => node.label),
    importantMemories: memories
      .filter((memory) => memory.importance >= 0.75)
      .slice(0, 8)
      .map((memory) => memory.title),
    unresolvedIssues,
    likelyForgotten
  };
}

export async function buildMemoryDashboardSnapshot(): Promise<MemoryDashboardSnapshot> {
  const db = await readMemoryDb();
  const graph = await buildKnowledgeNetwork();
  const inbox = db.candidates.filter((candidate) => candidate.status === "pending");
  const people = graph.nodes.filter((node) => node.type === "person");
  const projects = graph.nodes.filter((node) => node.type === "project");
  const duplicateSuggestions = findDuplicateSuggestions(db.memories);
  const brokenLinks = db.memories
    .filter((memory) => memory.markdownPath && !memory.markdownPath.startsWith("SecondBrain/"))
    .map((memory) => memory.markdownPath);
  const timeline = [
    ...db.memories.map((memory) => ({
      id: memory.id,
      title: memory.title,
      type: "approved" as const,
      createdAt: memory.approvedAt
    })),
    ...db.candidates.map((candidate) => ({
      id: candidate.id,
      title: candidate.title,
      type: candidate.executionTrail ? ("external" as const) : ("candidate" as const),
      createdAt: candidate.createdAt
    }))
  ].sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return {
    inbox,
    recentMemory: db.memories.slice(0, 8),
    people,
    projects,
    knowledgeNetwork: graph,
    dailyBrief: await generateDailyMemoryBrief(),
    timeline: timeline.slice(0, 20),
    health: {
      duplicateSuggestions,
      brokenLinks,
      brokenLinkCount: brokenLinks.length,
      approvalQueueSize: inbox.length
    },
    statistics: {
      totalCandidates: db.candidates.length,
      totalMemories: db.memories.length,
      totalPeople: people.length,
      totalProjects: projects.length,
      totalEdges: graph.edges.length
    }
  };
}

function inferSignals(content: string): MemorySignal[] {
  const signals = new Set<MemorySignal>();
  if (/(prefer|선호|좋아|원함|원해)/iu.test(content)) signals.add("preference");
  if (/(project|프로젝트)/iu.test(content)) signals.add("project");
  if (/(idea|아이디어)/iu.test(content)) signals.add("idea");
  if (/(todo|해야|할 일|후속|follow[- ]?up)/iu.test(content)) signals.add("todo");
  if (/(company|회사|DREAMWISH|드림위시)/iu.test(content)) signals.add("company");
  if (/(관계|related|works with|담당)/iu.test(content)) signals.add("relationship");
  if (/[가-힣]{2,4}(?:님|대표|매니저|담당자)/u.test(content)) signals.add("person");
  if (signals.size === 0) signals.add("fact");
  return Array.from(signals);
}

function scoreImportance(content: string, signals: MemorySignal[], frequency: number) {
  let score = 0.45;
  score += Math.min(0.18, content.length / 1000);
  score += signals.length * 0.05;
  if (signals.some((signal) => ["preference", "project", "todo", "relationship"].includes(signal))) score += 0.15;
  if (frequency > 1) score += 0.1;
  return score;
}

function scoreConfidence(content: string, signals: MemorySignal[]) {
  let score = content.length > 20 ? 0.68 : 0.48;
  if (signals.length > 1) score += 0.08;
  if (/[.!?。]|다$/.test(content.trim())) score += 0.05;
  return score;
}

function countSimilar(content: string, corpus: string[]) {
  const normalized = normalizeText(content);
  if (!normalized) return 1;
  const matches = corpus.filter((item) => {
    const other = normalizeText(item);
    return other.includes(normalized.slice(0, 80)) || normalized.includes(other.slice(0, 80));
  });
  return Math.max(1, matches.length + 1);
}

function findStaleProjectNames(memories: ApprovedMemory[]) {
  const projectMap = new Map<string, string>();
  for (const memory of memories) {
    if (!memory.projectId) continue;
    const ageDays = (Date.now() - new Date(memory.updatedAt).getTime()) / 86_400_000;
    if (ageDays >= 14) projectMap.set(memory.projectId, memory.projectId);
  }
  return Array.from(projectMap.values()).slice(0, 8);
}

function findDuplicateSuggestions(memories: ApprovedMemory[]) {
  const groups = new Map<string, ApprovedMemory[]>();
  for (const memory of memories) {
    const key = normalizeText(memory.content).slice(0, 100);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) || []), memory]);
  }
  return Array.from(groups.values())
    .filter((group) => group.length > 1)
    .map((group) => ({
      ids: group.map((memory) => memory.id),
      reason: "Similar approved memory content"
    }));
}

function summarizeTitle(content: string) {
  const firstLine = content.split(/\r?\n/u).find((line) => line.trim()) || "Untitled memory";
  return firstLine.replace(/^#+\s*/u, "").trim().slice(0, 80) || "Untitled memory";
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function clampMetric(value: number) {
  return Number(Math.min(1, Math.max(0, value)).toFixed(2));
}
