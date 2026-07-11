import { listFileRecords } from "@/src/lib/files/file.repository";
import { listKnowledgeNotes } from "@/src/lib/knowledge/knowledge.repository";
import { readMemoryDb } from "@/src/lib/memory/memory-repository";
import type {
  KnowledgeEdge,
  KnowledgeEdgeType,
  KnowledgeEntity,
  KnowledgeEntityType,
  KnowledgeGraph
} from "@/src/lib/memory/memory.types";

type SourceDocument = {
  id: string;
  title: string;
  body: string;
  sourceType: "memory" | "knowledge" | "file";
  path?: string;
  projectId: string | null;
};

export function extractKnowledgeEntities(markdown: string, sourceId = "inline") {
  const entities = new Map<string, KnowledgeEntity>();
  const title = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (title) addEntity(entities, "document", title, sourceId, 0.98);

  for (const tag of markdown.match(/#[a-zA-Z0-9가-힣_-]+/gu) || []) {
    addEntity(entities, "tag", tag.slice(1), sourceId, 0.95);
  }

  for (const match of markdown.matchAll(/\b(?:project|프로젝트)\s*[:\-]?\s*([A-Za-z0-9가-힣 _-]{2,40})/giu)) {
    addEntity(entities, "project", cleanLabel(match[1]), sourceId, 0.88);
  }

  for (const match of markdown.matchAll(/\b([A-Z][A-Z0-9&._-]{2,}|DREAMWISH|드림위시|\(주\)[가-힣A-Za-z0-9 ]{2,20})\b/gu)) {
    addEntity(entities, "company", cleanLabel(match[1]), sourceId, 0.78);
  }

  for (const match of markdown.matchAll(/\b([가-힣]{2,4})(?:님|대표|매니저|담당자|고객)?\b/gu)) {
    const label = cleanLabel(match[1]);
    if (!isCommonKoreanWord(label)) addEntity(entities, "person", label, sourceId, 0.62);
  }

  for (const match of markdown.matchAll(/\b(?:idea|아이디어)\s*[:\-]?\s*([A-Za-z0-9가-힣 ,._-]{2,44})/giu)) {
    addEntity(entities, "idea", cleanLabel(match[1]), sourceId, 0.74);
  }

  for (const match of markdown.matchAll(/\b(20\d{2}[-./년]\s?\d{1,2}[-./월]\s?\d{1,2}|오늘|내일|이번 주|다음 주)\b/gu)) {
    addEntity(entities, "schedule", cleanLabel(match[1]), sourceId, 0.7);
  }

  if (/(meeting|미팅|회의|상담|통화)/iu.test(markdown)) {
    addEntity(entities, "event", title || "Meeting event", sourceId, 0.72);
  }

  return Array.from(entities.values());
}

export async function buildKnowledgeNetwork(
  options: { ownerId?: string; projectId?: string | null } = {}
): Promise<KnowledgeGraph> {
  const documents = options.ownerId
    ? await loadSourceDocuments(options.ownerId, options.projectId)
    : [];
  const nodes = new Map<string, KnowledgeEntity>();
  const edges = new Map<string, KnowledgeEdge>();

  for (const document of documents) {
    const memoryNodeType: KnowledgeEntityType = document.sourceType === "memory" ? "memory" : "document";
    const documentNode = addEntity(nodes, memoryNodeType, document.title, document.id, 0.99, {
      sourceType: document.sourceType,
      path: document.path || null,
      projectId: document.projectId
    });
    const entities = extractKnowledgeEntities(`# ${document.title}\n\n${document.body}`, document.id);

    for (const entity of entities) {
      const merged = mergeEntity(nodes, entity);
      addEdge(edges, documentNode.id, merged.id, "mentions", document.id, entity.confidence);
      if (entity.type === "tag") addEdge(edges, documentNode.id, merged.id, "references", document.id, 0.74);
    }

    addSemanticEdges(edges, document, entities);
  }

  addRelatedEdges(edges, nodes);

  return {
    nodes: Array.from(nodes.values()),
    edges: Array.from(edges.values()),
    updatedAt: new Date().toISOString()
  };
}

async function loadSourceDocuments(
  ownerId: string,
  projectId?: string | null
): Promise<SourceDocument[]> {
  const [memoryDb, notes, files] = await Promise.all([
    readMemoryDb(),
    listKnowledgeNotes(ownerId, projectId),
    listFileRecords(ownerId, projectId)
  ]);
  const memories = memoryDb.memories.filter(
    (memory) =>
      (memory as typeof memory & { ownerId?: string }).ownerId === ownerId &&
      (projectId === undefined || memory.projectId === projectId)
  );

  return [
    ...memories.map((memory) => ({
      id: memory.id,
      title: memory.title,
      body: memory.content,
      sourceType: "memory" as const,
      path: memory.markdownPath,
      projectId: memory.projectId
    })),
    ...notes.map((note) => ({
      id: note.id,
      title: note.title,
      body: note.body,
      sourceType: "knowledge" as const,
      projectId: note.projectId
    })),
    ...files
      .filter((file) => file.textPreview.trim().length > 0)
      .map((file) => ({
        id: file.id,
        title: file.name,
        body: file.textPreview,
        sourceType: "file" as const,
        projectId: file.projectId
      }))
  ];
}

function addSemanticEdges(
  edges: Map<string, KnowledgeEdge>,
  document: SourceDocument,
  entities: KnowledgeEntity[]
) {
  const people = entities.filter((entity) => entity.type === "person");
  const projects = entities.filter((entity) => entity.type === "project");
  const companies = entities.filter((entity) => entity.type === "company");
  const events = entities.filter((entity) => entity.type === "event");

  for (const person of people) {
    for (const project of projects) addEdge(edges, person.id, project.id, "works_on", document.id, 0.7);
    for (const company of companies) addEdge(edges, person.id, company.id, "related_to", document.id, 0.56);
    for (const event of events) addEdge(edges, person.id, event.id, "meeting", document.id, 0.68);
  }

  if (/(created|만들|생성|작성)/iu.test(document.body)) {
    for (const project of projects) addEdge(edges, document.id, project.id, "created", document.id, 0.64);
  }

  if (/(depends on|의존|선행|필요)/iu.test(document.body)) {
    for (const project of projects) addEdge(edges, document.id, project.id, "depends_on", document.id, 0.62);
  }
}

function addRelatedEdges(edges: Map<string, KnowledgeEdge>, nodes: Map<string, KnowledgeEntity>) {
  const tags = Array.from(nodes.values()).filter((node) => node.type === "tag");
  for (const tag of tags) {
    const sources = tag.sourceIds;
    for (let index = 0; index < sources.length - 1; index += 1) {
      addEdge(edges, sources[index], sources[index + 1], "related_to", tag.id, 0.48);
    }
  }
}

function mergeEntity(nodes: Map<string, KnowledgeEntity>, entity: KnowledgeEntity) {
  const existing = nodes.get(entity.id);
  if (!existing) {
    nodes.set(entity.id, entity);
    return entity;
  }
  existing.sourceIds = Array.from(new Set([...existing.sourceIds, ...entity.sourceIds]));
  existing.confidence = Math.max(existing.confidence, entity.confidence);
  return existing;
}

function addEntity(
  nodes: Map<string, KnowledgeEntity>,
  type: KnowledgeEntityType,
  label: string,
  sourceId: string,
  confidence: number,
  metadata?: KnowledgeEntity["metadata"]
) {
  const clean = cleanLabel(label);
  const id = entityId(type, clean);
  const existing = nodes.get(id);
  if (existing) {
    existing.sourceIds = Array.from(new Set([...existing.sourceIds, sourceId]));
    existing.confidence = Math.max(existing.confidence, confidence);
    return existing;
  }
  const entity: KnowledgeEntity = {
    id,
    type,
    label: clean,
    confidence,
    sourceIds: [sourceId],
    metadata
  };
  nodes.set(id, entity);
  return entity;
}

function addEdge(
  edges: Map<string, KnowledgeEdge>,
  from: string,
  to: string,
  type: KnowledgeEdgeType,
  sourceId: string,
  confidence: number
) {
  if (from === to) return;
  const id = `${type}:${from}:${to}`;
  const existing = edges.get(id);
  if (existing) {
    existing.sourceIds = Array.from(new Set([...existing.sourceIds, sourceId]));
    existing.confidence = Math.max(existing.confidence, confidence);
    return;
  }
  edges.set(id, { id, from, to, type, confidence, sourceIds: [sourceId] });
}

function entityId(type: KnowledgeEntityType, label: string) {
  return `${type}:${label.toLowerCase().replace(/[^a-z0-9가-힣]+/gu, "-")}`;
}

function cleanLabel(value: string) {
  return value.replace(/\s+/g, " ").replace(/[.,;:]+$/g, "").trim().slice(0, 80);
}

function isCommonKoreanWord(value: string) {
  return [
    "사용자",
    "프로젝트",
    "회사",
    "관계",
    "일정",
    "이벤트",
    "문서",
    "아이디어",
    "오늘",
    "내일"
  ].includes(value);
}
