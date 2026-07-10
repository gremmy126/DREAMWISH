import { createHash, randomUUID } from "node:crypto";
import type {
  ApprovedMemory,
  MemoryCategory,
  MemoryHistoryEntry,
  MemoryRelatedLink,
  MemorySignal
} from "./memory.types";

export type AutoMemoryConversationInput = {
  userMessage: string;
  assistantAnswer: string;
  sessionId?: string;
  createdAt?: string;
};

export type AutoMemoryExtraction = {
  key: string;
  sourceId: string;
  title: string;
  summary: string;
  content: string;
  category: MemoryCategory;
  tags: string[];
  relatedConcepts: string[];
  relatedLinks: MemoryRelatedLink[];
  signals: MemorySignal[];
  importance: number;
  confidence: number;
  projectId: string | null;
};

type CategoryRule = {
  category: MemoryCategory;
  pattern: RegExp;
};

const CATEGORY_RULES: CategoryRule[] = [
  { category: "Meetings", pattern: /(meeting|회의|미팅|통화|상담|agenda|minutes)/iu },
  { category: "CRM", pattern: /(crm|customer|client|고객|lead|pipeline|deal)/iu },
  { category: "Business", pattern: /(business|sales|revenue|pricing|billing|결제|매출|사업|상품)/iu },
  { category: "Automation", pattern: /(automation|자동|백그라운드|workflow|engine|scheduler|trigger|실행 시점)/iu },
  { category: "Settings", pattern: /(preference|prefer|settings|설정|선호|규칙|말투|출력 규칙|항상|절대)/iu },
  { category: "Coding", pattern: /(code|coding|bug|fix|test|lint|build|typescript|react|next\.?js|api|route|component|코드|버그|수정|구현|테스트|빌드|라우트)/iu },
  { category: "Documents", pattern: /(document|docs|markdown|pdf|문서|보고서|노트|메모(?!리))/iu },
  { category: "Projects", pattern: /(project|프로젝트|제품|서비스|앱|application)/iu },
  { category: "Tasks", pattern: /(todo|task|해야|할 일|계획|목표|다음 단계|follow[- ]?up)/iu },
  { category: "Ideas", pattern: /(idea|아이디어|구상|proposal|concept)/iu },
  { category: "Learning", pattern: /(learn|study|학습|공부|배운|개념|설명)/iu },
  { category: "Personal Workflow", pattern: /(workflow|작업 흐름|루틴|프로세스|사용자 작업)/iu },
  { category: "Knowledge", pattern: /(knowledge|지식|rag|embedding|graph|검색|자료|정보)/iu }
];

const TAG_RULES: Array<{ tag: string; pattern: RegExp }> = [
  { tag: "#AI", pattern: /(ai|llm|groq|rag|embedding|prompt|classifier|personal brain)/iu },
  { tag: "#Memory", pattern: /(memory|메모리|기억|저장|second brain|personal brain)/iu },
  { tag: "#RAG", pattern: /\brag\b|로컬 rag|검색 증강/iu },
  { tag: "#Embedding", pattern: /(embedding|임베딩|vector|semantic)/iu },
  { tag: "#Knowledge", pattern: /(knowledge|지식|graph|문서|docs|markdown)/iu },
  { tag: "#LocalFirst", pattern: /(local[- ]?first|로컬|사용자 pc|pc에 저장)/iu },
  { tag: "#Automation", pattern: /(automation|자동|백그라운드|engine|trigger|scheduler)/iu },
  { tag: "#Workflow", pattern: /(workflow|작업 흐름|flow|프로세스)/iu },
  { tag: "#React", pattern: /\breact\b/iu },
  { tag: "#NextJS", pattern: /(next\.?js|next)/iu },
  { tag: "#TypeScript", pattern: /(typescript|\bts\b)/iu },
  { tag: "#Code", pattern: /(code|coding|api|route|component|코드|구현)/iu },
  { tag: "#Bug", pattern: /(bug|error|오류|버그|실패|안됨)/iu },
  { tag: "#Task", pattern: /(todo|task|해야|할 일|목표)/iu },
  { tag: "#Preference", pattern: /(preference|prefer|선호|말투|규칙|항상|절대)/iu },
  { tag: "#CRM", pattern: /(crm|customer|client|고객)/iu },
  { tag: "#Business", pattern: /(business|pricing|billing|매출|사업|결제)/iu },
  { tag: "#Documents", pattern: /(document|docs|문서|pdf|markdown)/iu }
];

const RELATED_CONCEPT_RULES: Array<{ concept: string; pattern: RegExp }> = [
  { concept: "Personal Brain", pattern: /(personal brain|second brain|제2의 두뇌)/iu },
  { concept: "Memory Engine", pattern: /(memory engine|메모리 엔진|자동 저장|기억)/iu },
  { concept: "Knowledge", pattern: /(knowledge|지식)/iu },
  { concept: "Markdown", pattern: /(markdown|마크다운|문서)/iu },
  { concept: "RAG", pattern: /\brag\b|검색 증강/iu },
  { concept: "Embedding", pattern: /(embedding|임베딩|vector|semantic)/iu },
  { concept: "Knowledge Graph", pattern: /(knowledge graph|graph|그래프|연결)/iu },
  { concept: "Semantic Search", pattern: /(semantic search|의미 검색|semantic)/iu },
  { concept: "Local First", pattern: /(local[- ]?first|로컬|사용자 pc)/iu },
  { concept: "Chat Flow", pattern: /(chat flow|채팅|질문|답변)/iu },
  { concept: "Automation", pattern: /(automation|자동|백그라운드|trigger)/iu }
];

const CATEGORY_TAGS: Record<MemoryCategory, string> = {
  Projects: "#Project",
  Knowledge: "#Knowledge",
  Ideas: "#Idea",
  Tasks: "#Task",
  Meetings: "#Meeting",
  Learning: "#Learning",
  Coding: "#Code",
  CRM: "#CRM",
  Business: "#Business",
  Automation: "#Automation",
  Documents: "#Documents",
  Settings: "#Preference",
  "Personal Workflow": "#Workflow"
};

export function analyzeConversationForMemory(
  input: AutoMemoryConversationInput
): AutoMemoryExtraction | null {
  const userMessage = input.userMessage.trim();
  const assistantAnswer = input.assistantAnswer.trim();
  if (!shouldStoreConversation(userMessage, assistantAnswer)) return null;

  const combined = `${userMessage}\n${assistantAnswer}`;
  const category = classifyMemoryCategory(combined);
  const tags = inferTags(combined, category);
  const relatedConcepts = inferRelatedConcepts(combined, category, tags);
  const projectId = inferProjectId(combined, relatedConcepts);
  const relatedLinks = inferRelatedLinks(combined, category, projectId, relatedConcepts);
  const summary = buildSummary(userMessage, assistantAnswer, category, projectId);
  const key = buildMemoryKey(projectId, category, combined);
  const sourceId = `auto-memory:${key}`;
  const title = buildTitle(projectId, category, summary);
  const signals = inferSignals(combined, category);

  return {
    key,
    sourceId,
    title,
    summary,
    content: renderAutoMemoryContent({
      userMessage,
      assistantAnswer,
      summary,
      category,
      tags,
      relatedConcepts,
      relatedLinks,
      sessionId: input.sessionId
    }),
    category,
    tags,
    relatedConcepts,
    relatedLinks,
    signals,
    importance: scoreImportance(combined, category, tags),
    confidence: scoreConfidence(combined, tags),
    projectId
  };
}

export async function runAutoMemoryEngine(
  input: AutoMemoryConversationInput
): Promise<ApprovedMemory | null> {
  const extraction = analyzeConversationForMemory(input);
  if (!extraction) return null;

  const [{ createEmbeddingRecord }, { writeApprovedMemoryMarkdown }, { readMemoryDb, upsertApprovedMemory }] =
    await Promise.all([
      import("./memory-embedding"),
      import("./memory-markdown"),
      import("./memory-repository")
    ]);
  const db = await readMemoryDb();
  const now = input.createdAt || new Date().toISOString();
  const existing = findAutoMemoryTarget(db.memories, extraction);
  const memory = existing
    ? mergeAutoMemoryMetadata(existing, extraction, now)
    : createApprovedAutoMemory(extraction, now);
  const embedding = createEmbeddingRecord({ ...memory, embeddingId: "", markdownPath: "" });
  const markdownPath = await writeApprovedMemoryMarkdown({
    ...memory,
    embeddingId: embedding.id
  });
  const savedMemory: ApprovedMemory = {
    ...memory,
    embeddingId: embedding.id,
    markdownPath,
    graphUpdatedAt: now
  };

  return upsertApprovedMemory(savedMemory, embedding);
}

export async function runAutoMemoryEngineQuietly(input: AutoMemoryConversationInput) {
  try {
    return await runAutoMemoryEngine(input);
  } catch (error) {
    console.error("Auto memory update failed", error);
    return null;
  }
}

export function findAutoMemoryTarget(
  memories: ApprovedMemory[],
  extraction: AutoMemoryExtraction
) {
  const bySource = memories.find((memory) => memory.sourceId === extraction.sourceId);
  if (bySource) return bySource;
  if (!extraction.projectId) return undefined;
  return memories.find(
    (memory) =>
      memory.projectId === extraction.projectId &&
      (memory.category === extraction.category || memory.sourceId?.startsWith("auto-memory:"))
  );
}

export function mergeAutoMemoryMetadata(
  existing: ApprovedMemory,
  extraction: AutoMemoryExtraction,
  now: string
): ApprovedMemory {
  const history = appendHistory(existing.history, {
    at: now,
    event: "Auto memory update",
    sourceId: extraction.sourceId,
    summary: extraction.summary
  });

  return {
    ...existing,
    sourceId: existing.sourceId || extraction.sourceId,
    projectId: existing.projectId || extraction.projectId,
    signals: unique([...(existing.signals || []), ...extraction.signals]),
    importance: Math.max(existing.importance || 0, extraction.importance),
    recency: 1,
    frequency: Math.max(1, existing.frequency || 1) + 1,
    confidence: Math.max(existing.confidence || 0, extraction.confidence),
    updatedAt: now,
    preview: extraction.summary.slice(0, 220),
    content: mergeContent(existing.content || "", extraction.content, now),
    category: extraction.category,
    summary: extraction.summary,
    tags: unique([...(existing.tags || []), ...extraction.tags]),
    relatedConcepts: unique([...(existing.relatedConcepts || []), ...extraction.relatedConcepts]),
    relatedLinks: uniqueLinks([...(existing.relatedLinks || []), ...extraction.relatedLinks]),
    history
  };
}

function createApprovedAutoMemory(extraction: AutoMemoryExtraction, now: string): ApprovedMemory {
  return {
    id: randomUUID(),
    title: extraction.title,
    content: extraction.content,
    source: "chat",
    sourceId: extraction.sourceId,
    projectId: extraction.projectId,
    signals: extraction.signals,
    importance: extraction.importance,
    recency: 1,
    frequency: 1,
    confidence: extraction.confidence,
    status: "approved",
    createdAt: now,
    updatedAt: now,
    preview: extraction.summary.slice(0, 220),
    approvedAt: now,
    approvedBy: "auto-memory-engine",
    approvalNote: null,
    markdownPath: "",
    embeddingId: "",
    graphUpdatedAt: now,
    category: extraction.category,
    summary: extraction.summary,
    tags: extraction.tags,
    relatedConcepts: extraction.relatedConcepts,
    relatedLinks: extraction.relatedLinks,
    history: [
      {
        at: now,
        event: "Auto memory created",
        sourceId: extraction.sourceId,
        summary: extraction.summary
      }
    ]
  };
}

function shouldStoreConversation(userMessage: string, assistantAnswer: string) {
  const normalizedUser = normalizeForMatching(userMessage);
  if (!normalizedUser) return false;
  if (isTrivialMessage(normalizedUser)) return false;

  const combined = `${userMessage}\n${assistantAnswer}`;
  if (hasDurableSignal(combined)) return true;
  if (userMessage.length >= 80 && /[.!?。]|다|요|해줘|해주세요/u.test(userMessage)) return true;
  return false;
}

function isTrivialMessage(normalizedUser: string) {
  return /^(hi|hello|hey|안녕|안녕하세요|테스트|test|ok|okay|네|응|ㅇㅇ|감사|고마워|ㅋㅋ+|ㅎㅎ+|오타)$/iu.test(
    normalizedUser
  );
}

function hasDurableSignal(text: string) {
  return /(project|프로젝트|memory|메모리|기억|저장|rag|embedding|knowledge|graph|workflow|자동|계획|목표|해야|todo|결정|선호|규칙|코드|구현|수정|버그|오류|문서|crm|고객|사업|업무|회의|학습|배운|아이디어|local[- ]?first|personal brain)/iu.test(
    text
  );
}

function classifyMemoryCategory(text: string): MemoryCategory {
  return CATEGORY_RULES.find((rule) => rule.pattern.test(text))?.category || "Knowledge";
}

function inferTags(text: string, category: MemoryCategory) {
  return unique([
    CATEGORY_TAGS[category],
    ...TAG_RULES.filter((rule) => rule.pattern.test(text)).map((rule) => rule.tag)
  ]).slice(0, 12);
}

function inferRelatedConcepts(text: string, category: MemoryCategory, tags: string[]) {
  const concepts = RELATED_CONCEPT_RULES.filter((rule) => rule.pattern.test(text)).map(
    (rule) => rule.concept
  );
  if (tags.includes("#Memory") && !concepts.includes("Memory Engine")) {
    concepts.unshift("Memory Engine");
  }
  if (tags.includes("#AI") && !concepts.includes("Personal Brain")) {
    concepts.unshift("Personal Brain");
  }
  if (category === "Automation" && !concepts.includes("Automation")) {
    concepts.push("Automation");
  }
  return unique(concepts).slice(0, 12);
}

function inferRelatedLinks(
  text: string,
  category: MemoryCategory,
  projectId: string | null,
  relatedConcepts: string[]
) {
  const links: MemoryRelatedLink[] = [];
  if (projectId) links.push({ type: "project", label: projectId, confidence: 0.92 });
  if (
    category === "Documents" ||
    /(document|docs|markdown|pdf|문서|노트)/iu.test(text) ||
    relatedConcepts.some((concept) => ["Knowledge", "Markdown", "Knowledge Graph"].includes(concept))
  ) {
    links.push({ type: "document", label: "Knowledge documents", confidence: 0.72 });
  }
  if (category === "Coding" || /(code|api|route|component|typescript|react|next\.?js|코드|구현|수정)/iu.test(text)) {
    links.push({ type: "code", label: "Code workspace", confidence: 0.7 });
  }
  if (category === "Tasks" || /(todo|task|해야|할 일|follow[- ]?up|다음 단계)/iu.test(text)) {
    links.push({ type: "task", label: "Task workspace", confidence: 0.7 });
  }
  if (category === "Meetings" || /(calendar|schedule|일정|캘린더|회의|미팅|오늘|내일)/iu.test(text)) {
    links.push({ type: "schedule", label: "Calendar", confidence: 0.66 });
  }
  if (category === "CRM" || /(crm|customer|client|고객|lead)/iu.test(text)) {
    links.push({ type: "crm", label: "CRM", confidence: 0.72 });
  }
  return uniqueLinks(links).slice(0, 8);
}

function inferProjectId(text: string, relatedConcepts: string[]) {
  if (/personal brain|second brain|제2의 두뇌/iu.test(text)) return "Personal Brain AI";
  if (/\bgremmy\b/iu.test(text)) return "gremmy";

  const explicit = text.match(/(?:project|프로젝트)\s*[:\-]?\s*([A-Za-z0-9가-힣 _-]{2,40})/iu);
  if (explicit?.[1]) return cleanProjectName(explicit[1]);

  if (relatedConcepts.includes("Personal Brain")) return "Personal Brain AI";
  return null;
}

function inferSignals(text: string, category: MemoryCategory): MemorySignal[] {
  const signals = new Set<MemorySignal>();
  if (/(preference|prefer|선호|규칙|말투|항상|절대)/iu.test(text) || category === "Settings") {
    signals.add("preference");
  }
  if (/(project|프로젝트|personal brain|gremmy)/iu.test(text) || category === "Projects") {
    signals.add("project");
  }
  if (/(idea|아이디어|구상)/iu.test(text) || category === "Ideas") signals.add("idea");
  if (/(todo|task|해야|할 일|목표|다음 단계)/iu.test(text) || category === "Tasks") {
    signals.add("todo");
  }
  if (/(company|회사|business|사업)/iu.test(text) || category === "Business") {
    signals.add("company");
  }
  if (/(crm|고객|관계|related|link|연결)/iu.test(text)) signals.add("relationship");
  if (signals.size === 0) signals.add("fact");
  return Array.from(signals);
}

function buildSummary(
  userMessage: string,
  assistantAnswer: string,
  category: MemoryCategory,
  projectId: string | null
) {
  const lines = [
    `${projectId ? `${projectId}: ` : ""}${compactSentence(userMessage)}`,
    compactSentence(assistantAnswer),
    `Category: ${category}`
  ].filter((line) => line.trim().length > 0);
  return lines.slice(0, 3).join("\n");
}

function buildTitle(projectId: string | null, category: MemoryCategory, summary: string) {
  if (projectId) return `${projectId} - ${category}`;
  return `${category} - ${summary.split("\n")[0]}`.slice(0, 80);
}

function buildMemoryKey(projectId: string | null, category: MemoryCategory, text: string) {
  if (projectId) return `${slug(projectId)}:${slug(category)}`;
  return `${slug(category)}:${hashText(text).slice(0, 12)}`;
}

function renderAutoMemoryContent(input: {
  userMessage: string;
  assistantAnswer: string;
  summary: string;
  category: MemoryCategory;
  tags: string[];
  relatedConcepts: string[];
  relatedLinks: MemoryRelatedLink[];
  sessionId?: string;
}) {
  return [
    "Summary:",
    ...input.summary.split("\n").map((line) => `- ${line}`),
    "",
    `Category: ${input.category}`,
    `Tags: ${input.tags.join(" ")}`,
    `Related concepts: ${input.relatedConcepts.join(" -> ") || "none"}`,
    `Related links: ${input.relatedLinks.map((link) => `${link.type}:${link.label}`).join(" | ") || "none"}`,
    input.sessionId ? `Session: ${input.sessionId}` : "",
    "",
    "Original conversation:",
    "User:",
    input.userMessage,
    "",
    "Assistant:",
    input.assistantAnswer
  ]
    .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
    .join("\n")
    .trim();
}

function mergeContent(existingContent: string, nextContent: string, now: string) {
  if (!existingContent.trim()) return nextContent;
  const nextHash = hashText(nextContent);
  if (existingContent.includes(nextHash) || existingContent.includes(nextContent.slice(0, 160))) {
    return existingContent;
  }
  return `${existingContent}\n\n---\nAuto memory update: ${now}\nContent hash: ${nextHash}\n\n${nextContent}`;
}

function appendHistory(history: MemoryHistoryEntry[] | undefined, next: MemoryHistoryEntry) {
  return [...(history || []), next].slice(-50);
}

function scoreImportance(text: string, category: MemoryCategory, tags: string[]) {
  let score = 0.52;
  score += Math.min(0.18, text.length / 4000);
  if (["Projects", "Tasks", "Settings", "Automation", "Coding"].includes(category)) score += 0.16;
  if (tags.includes("#Memory") || tags.includes("#AI")) score += 0.08;
  return clamp(score);
}

function scoreConfidence(text: string, tags: string[]) {
  let score = text.length > 40 ? 0.7 : 0.52;
  if (tags.length >= 3) score += 0.08;
  if (/[.!?。]|다|요/u.test(text)) score += 0.04;
  return clamp(score);
}

function compactSentence(value: string) {
  return normalizeWhitespace(value)
    .replace(/\s+/g, " ")
    .slice(0, 180)
    .trim();
}

function cleanProjectName(value: string) {
  return normalizeWhitespace(value)
    .replace(/(?:진행|수정|업데이트|요약|기반|관련).*$/u, "")
    .trim()
    .slice(0, 60);
}

function normalizeForMatching(value: string) {
  return normalizeWhitespace(value).toLowerCase();
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
}

function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function uniqueLinks(values: MemoryRelatedLink[]) {
  const seen = new Set<string>();
  const links: MemoryRelatedLink[] = [];
  for (const value of values) {
    const key = `${value.type}:${value.label.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(value);
  }
  return links;
}

function clamp(value: number) {
  return Number(Math.min(1, Math.max(0, value)).toFixed(2));
}
