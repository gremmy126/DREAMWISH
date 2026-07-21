// DreamWish Memory OS — the AI's long-term memory, the user's second brain,
// and the organization's decision asset. Not a note app: every item carries
// decision context (type, confidence, insights, outcome learning, versions)
// and is linked to decisions, research, and surveys.

export type MemoryOsType =
  | "decision"
  | "research"
  | "lesson"
  | "outcome"
  | "pattern"
  | "policy"
  | "knowledge"
  | "meeting"
  | "idea"
  | "question"
  | "risk"
  | "customer"
  | "market"
  | "competitor"
  | "simulation";

export type MemoryOsStatus = "suggestion" | "confirmed" | "archived" | "expired";

export type MemoryOsVersion = {
  version: number;
  content: string;
  summary: string;
  editedBy: "ai" | "user";
  editedAt: string;
};

export type MemoryOsAiSummary = {
  threeLines: string[];
  coreOutcome: string;
  cautions: string[];
  nextUse: string[];
  generatedAt: string;
  source: "ai" | "deterministic";
};

export type MemoryOsItem = {
  id: string;
  // Idempotency key for derived items (legacy:<id>, decision:<id>, ...).
  sourceRef: string | null;
  title: string;
  description: string;
  content: string;
  type: MemoryOsType;
  status: MemoryOsStatus;
  source: "ai" | "human";
  project: string;
  decisionId: string | null;
  tags: string[];
  confidence: number;
  importance: number;
  usageCount: number;
  favorite: boolean;
  insights: string[];
  aiSummary: MemoryOsAiSummary | null;
  versions: MemoryOsVersion[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
};

export type MemoryOsState = {
  items: MemoryOsItem[];
  lastSyncAt: string | null;
};

export type MemoryOsKpis = {
  total: number;
  confirmed: number;
  suggestions: number;
  archived: number;
  recentlyUsed: number;
  deltas: { total: number; confirmed: number; suggestions: number; archived: number };
};

export type MemoryOsDistributionEntry = {
  type: MemoryOsType;
  count: number;
  percent: number;
};

export type MemoryOsPattern = {
  id: string;
  title: string;
  description: string;
  evidenceCount: number;
  memoryIds: string[];
};

export type MemoryOsInsights = {
  mostUsed: { id: string; title: string; usageCount: number } | null;
  mostConnected: { id: string; title: string; relatedCount: number } | null;
  mostValuable: { id: string; title: string; score: number } | null;
  aiPick: { id: string; title: string; reason: string } | null;
};

export type MemoryOsOverview = {
  kpis: MemoryOsKpis;
  distribution: MemoryOsDistributionEntry[];
  patterns: MemoryOsPattern[];
  insights: MemoryOsInsights;
};

export const MEMORY_OS_TYPES: MemoryOsType[] = [
  "decision",
  "research",
  "lesson",
  "outcome",
  "pattern",
  "policy",
  "knowledge",
  "meeting",
  "idea",
  "question",
  "risk",
  "customer",
  "market",
  "competitor",
  "simulation"
];

export const MEMORY_OS_TYPE_LABELS: Record<MemoryOsType, string> = {
  decision: "의사결정",
  research: "리서치",
  lesson: "교훈",
  outcome: "결과",
  pattern: "패턴",
  policy: "정책",
  knowledge: "지식",
  meeting: "회의",
  idea: "아이디어",
  question: "질문",
  risk: "리스크",
  customer: "고객",
  market: "시장",
  competitor: "경쟁사",
  simulation: "시뮬레이션"
};

export function isMemoryOsType(value: unknown): value is MemoryOsType {
  return MEMORY_OS_TYPES.includes(value as MemoryOsType);
}

export function isMemoryOsStatus(value: unknown): value is MemoryOsStatus {
  return (
    value === "suggestion" || value === "confirmed" || value === "archived" || value === "expired"
  );
}

// 관련도 별점(1~5): 연결 수와 중요도의 결합. 문서화된 결정론 수식.
export function relevanceStars(relatedCount: number, importance: number): number {
  const connection = Math.min(3, Math.ceil(relatedCount / 2));
  return Math.max(1, Math.min(5, connection + Math.round(importance / 2.5)));
}
