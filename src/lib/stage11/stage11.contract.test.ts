import {
  buildMemoryDashboardSnapshot,
  createMemoryCandidate,
  generateDailyMemoryBrief,
  listApprovedMemories,
  listMemoryCandidates
} from "@/src/lib/memory/memory-engine";
import { approveCandidate } from "@/src/lib/memory/memory-lifecycle";
import {
  captureExternalMemoryCandidate
} from "@/src/lib/memory/external-memory-capture";
import {
  buildKnowledgeNetwork,
  extractKnowledgeEntities
} from "@/src/lib/memory/knowledge-network";
import {
  deepThinkSearch,
  quickMemorySearch
} from "@/src/lib/memory/memory-search";
import {
  createMemoryChangePreview,
  undoMemoryChange
} from "@/src/lib/memory/memory-execution";
import {
  listMemoryMcpTools,
  runMemoryMcpTool
} from "@/src/lib/memory/mcp-memory-server";

async function assertStage11MemoryContracts() {
  const ownerId = "stage11-owner";
  const candidate = await createMemoryCandidate({
    ownerId,
    source: "manual",
    sourceId: "stage11-manual-candidate",
    content:
      "The user prefers approval-first memory capture for the DREAMWISH CRM project.",
    signals: ["preference", "project"],
    projectId: "project-dreamwish",
    importance: 0.88,
    confidence: 0.82
  });

  if (candidate.status !== "pending") {
    throw new Error("Memory candidates must start pending");
  }
  candidate.frequency satisfies number;
  candidate.recency satisfies number;

  const candidates = await listMemoryCandidates(ownerId, { status: "pending" });
  candidates[0].status satisfies "pending" | "approved" | "rejected" | "forgotten";

  const approved = await approveCandidate(ownerId, candidate.id, {
    expectedVersion: 1,
    note: "Contract test approval"
  });
  if (!approved.markdownPath || !approved.embeddingId) {
    throw new Error("Approved memories must create Markdown and embedding cache records");
  }

  const memories = await listApprovedMemories(ownerId, { projectId: "project-dreamwish" });
  memories[0].importance satisfies number;

  const entities = extractKnowledgeEntities(
    "# DREAMWISH CRM\n\n김민수 works on Project Atlas with DREAMWISH #crm"
  );
  if (!entities.some((entity) => entity.type === "project")) {
    throw new Error("Knowledge extraction must detect projects");
  }

  const graph = await buildKnowledgeNetwork({ ownerId, projectId: "project-dreamwish" });
  graph.nodes[0].type satisfies "person" | "company" | "project" | "document" | "idea" | "schedule" | "event" | "tag" | "memory";
  graph.edges[0]?.type satisfies "works_on" | "created" | "meeting" | "related_to" | "depends_on" | "mentions" | "references";

  const quick = await quickMemorySearch("approval memory", { ownerId, projectId: "project-dreamwish" });
  quick.results[0]?.sourceType satisfies "memory" | "knowledge" | "file";

  const deep = await deepThinkSearch("What should be remembered about CRM?", {
    ownerId,
    projectId: "project-dreamwish"
  });
  deep.summary satisfies string;
  deep.sources satisfies Array<{ id: string; title: string; path?: string }>;
  deep.evidence satisfies string[];
  deep.missingInformation satisfies string[];
  deep.contradictions satisfies string[];
  deep.nextInformationNeeded satisfies string[];

  const daily = await generateDailyMemoryBrief(ownerId, { date: "2026-07-09" });
  daily.todayTasks satisfies string[];
  daily.staleProjects satisfies string[];

  const external = await captureExternalMemoryCandidate({
    ownerId,
    connectorId: "gmail",
    sourceId: "gmail-message-1",
    title: "Customer renewal request",
    content: "A customer asked for a renewal follow-up next week.",
    preview: "Renewal follow-up candidate"
  });
  if (external.status !== "pending" || external.executionTrail[0] !== "Planner") {
    throw new Error("External capture must remain pending and follow the approval trail");
  }

  const preview = await createMemoryChangePreview(ownerId, {
    action: "update",
    targetId: approved.id,
    proposedContent: "Updated memory content"
  });
  if (!preview.approvalRequired) {
    throw new Error("Memory changes must require approval");
  }
  const undo = await undoMemoryChange(ownerId, preview.id);
  undo.ok satisfies boolean;

  const dashboard = await buildMemoryDashboardSnapshot(ownerId);
  dashboard.inbox satisfies typeof candidates;
  dashboard.health.brokenLinkCount satisfies number;
  dashboard.statistics.totalMemories satisfies number;

  const tools = listMemoryMcpTools();
  if (!tools.some((tool) => tool.name === "memory.search")) {
    throw new Error("MCP tool registry must expose memory.search");
  }
  const mcpResult = await runMemoryMcpTool(ownerId, "knowledge.graph", { projectId: "project-dreamwish" });
  mcpResult.ok satisfies boolean;
}

void assertStage11MemoryContracts;
