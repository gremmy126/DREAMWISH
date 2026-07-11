import { randomUUID } from "node:crypto";
import { createMemoryCandidate } from "@/src/lib/memory/memory-engine";
import {
  buildMemoryDashboardSnapshot,
  generateDailyMemoryBrief
} from "@/src/lib/memory/memory-engine";
import { createMemoryChangePreview } from "@/src/lib/memory/memory-execution";
import { buildKnowledgeNetwork, extractKnowledgeEntities } from "@/src/lib/memory/knowledge-network";
import { deepThinkSearch, quickMemorySearch } from "@/src/lib/memory/memory-search";
import type { MemoryMcpTool, MemorySignal, MemorySource } from "@/src/lib/memory/memory.types";

const TOOLS: MemoryMcpTool[] = [
  { name: "memory.search", description: "Quick local memory search", approvalRequired: false },
  { name: "memory.capture", description: "Create a pending memory candidate", approvalRequired: true },
  { name: "memory.update", description: "Create an update preview for an approved memory", approvalRequired: true },
  { name: "memory.delete", description: "Create a delete preview for an approved memory", approvalRequired: true },
  { name: "memory.timeline", description: "List memory timeline events", approvalRequired: false },
  { name: "memory.people", description: "List people entities from the knowledge graph", approvalRequired: false },
  { name: "memory.projects", description: "List project entities from the knowledge graph", approvalRequired: false },
  { name: "memory.graph", description: "Return the memory knowledge graph", approvalRequired: false },
  { name: "memory.related", description: "Find related memory and knowledge records", approvalRequired: false },
  { name: "memory.daily", description: "Generate a daily memory briefing", approvalRequired: false },
  { name: "memory.summary", description: "Deep Think summary over local memory", approvalRequired: false },
  { name: "memory.query", description: "Deep Think memory query", approvalRequired: false },
  { name: "memory.similar", description: "Find similar local memory records", approvalRequired: false },
  { name: "knowledge.entities", description: "Extract entities from Markdown text", approvalRequired: false },
  { name: "knowledge.relationships", description: "Return graph relationships", approvalRequired: false },
  { name: "knowledge.timeline", description: "Return knowledge timeline", approvalRequired: false },
  { name: "knowledge.graph", description: "Return the knowledge graph", approvalRequired: false }
];

export function listMemoryMcpTools() {
  return TOOLS;
}

export async function runMemoryMcpTool(
  ownerId: string,
  name: string,
  payload: Record<string, unknown> = {}
) {
  try {
    switch (name) {
      case "memory.search":
        return ok(await quickMemorySearch(asString(payload.query), { ownerId, projectId: asNullableString(payload.projectId) }));
      case "memory.capture":
        return ok(
          await createMemoryCandidate({
            ownerId,
            source: asMemorySource(payload.source),
            sourceId: asOptionalString(payload.sourceId) || `mcp:${randomUUID()}`,
            content: asString(payload.content),
            title: asOptionalString(payload.title),
            projectId: asNullableString(payload.projectId),
            signals: asSignals(payload.signals)
          })
        );
      case "memory.update":
        return ok(
          await createMemoryChangePreview(ownerId, {
            action: "update",
            targetId: asNullableString(payload.targetId),
            proposedContent: asString(payload.proposedContent)
          })
        );
      case "memory.delete":
        return ok(
          await createMemoryChangePreview(ownerId, {
            action: "delete",
            targetId: asNullableString(payload.targetId),
            proposedContent: "Delete requested. Awaiting user approval."
          })
        );
      case "memory.timeline":
        return ok((await buildMemoryDashboardSnapshot(ownerId)).timeline);
      case "memory.people":
        return ok((await buildMemoryDashboardSnapshot(ownerId)).people);
      case "memory.projects":
        return ok((await buildMemoryDashboardSnapshot(ownerId)).projects);
      case "memory.graph":
      case "knowledge.graph":
        return ok(await buildKnowledgeNetwork({ ownerId, projectId: asNullableString(payload.projectId) }));
      case "memory.related":
      case "memory.similar":
        return ok(await quickMemorySearch(asString(payload.query), { ownerId, projectId: asNullableString(payload.projectId), limit: 6 }));
      case "memory.daily":
        return ok(await generateDailyMemoryBrief(ownerId, { date: asOptionalString(payload.date) }));
      case "memory.summary":
      case "memory.query":
        return ok(await deepThinkSearch(asString(payload.query), { ownerId, projectId: asNullableString(payload.projectId) }));
      case "knowledge.entities":
        return ok(extractKnowledgeEntities(asString(payload.markdown || payload.content)));
      case "knowledge.relationships":
        return ok((await buildKnowledgeNetwork({ ownerId, projectId: asNullableString(payload.projectId) })).edges);
      case "knowledge.timeline":
        return ok((await buildMemoryDashboardSnapshot(ownerId)).timeline);
      default:
        return { ok: false as const, error: `Unknown MCP tool: ${name}` };
    }
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "MCP tool failed"
    };
  }
}

function ok(data: unknown) {
  return { ok: true as const, data };
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function asMemorySource(value: unknown): MemorySource {
  const allowed: MemorySource[] = ["chat", "manual", "knowledge", "file", "web", "gmail", "google-calendar", "slack"];
  return allowed.includes(value as MemorySource) ? (value as MemorySource) : "manual";
}

function asSignals(value: unknown): MemorySignal[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const allowed: MemorySignal[] = [
    "fact",
    "repeated",
    "preference",
    "project",
    "idea",
    "todo",
    "person",
    "company",
    "relationship"
  ];
  return value.filter((item): item is MemorySignal => allowed.includes(item as MemorySignal));
}
