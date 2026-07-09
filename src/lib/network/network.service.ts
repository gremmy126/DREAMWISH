import { loadMarkdownDocuments } from "@/src/lib/rag/document-loader";
import { hybridSearchResults } from "@/src/lib/search/search.service";
import type { SearchResult } from "@/src/lib/search/search.types";
import type { KnowledgeEdge, KnowledgeNetwork, KnowledgeNode } from "./network.types";

export async function buildContextNetwork(
  query: string,
  extraResults: SearchResult[] = [],
  baseResults?: SearchResult[]
): Promise<KnowledgeNetwork> {
  const results = dedupeResults([
    ...(baseResults || (await hybridSearchResults(query, 10))),
    ...extraResults
  ]).slice(0, 16);
  const documents = await loadMarkdownDocuments();
  const byPath = new Map(documents.map((document) => [document.relativePath, document]));
  const nodes: KnowledgeNode[] = [
    {
      id: "query",
      label: query.trim() || "Current question",
      type: "query",
      score: 1
    }
  ];
  const edges: KnowledgeEdge[] = [];
  const tagNodes = new Map<string, KnowledgeNode>();

  for (const result of results) {
    const document = byPath.get(result.path);
    const node = resultToNode(result);
    nodes.push(node);
    edges.push({
      id: `query-${node.id}`,
      sourceId: "query",
      targetId: node.id,
      relationType: result.sourceType === "web" ? "ai_suggested_relation" : "rag_relation",
      strength: result.score,
      reason: relationReason(result)
    });

    for (const tag of document?.tags.slice(0, 4) || []) {
      const tagId = `tag:${tag}`;
      if (!tagNodes.has(tagId)) {
        tagNodes.set(tagId, {
          id: tagId,
          label: `#${tag}`,
          type: "tag",
          score: 0.58
        });
      }
      edges.push({
        id: `${node.id}-${tagId}`,
        sourceId: node.id,
        targetId: tagId,
        relationType: "tag_relation",
        strength: 0.58,
        reason: `Connected by shared tag: ${tag}`
      });
    }

    const folderNode = folderNodeForPath(result.path);
    if (folderNode && !nodes.some((item) => item.id === folderNode.id)) {
      nodes.push(folderNode);
    }
    if (folderNode) {
      edges.push({
        id: `${folderNode.id}-${node.id}`,
        sourceId: folderNode.id,
        targetId: node.id,
        relationType: "folder_relation",
        strength: 0.45,
        reason: `Included in folder: ${folderNode.label}`
      });
    }
  }

  nodes.push(...tagNodes.values());
  return { nodes: dedupeNodes(nodes).slice(0, 20), edges: dedupeEdges(edges).slice(0, 32) };
}

function resultToNode(result: SearchResult): KnowledgeNode {
  return {
    id: result.documentId,
    label: result.title,
    type: result.sourceType === "web" ? "web" : result.sourceType === "chat" ? "chat" : inferNodeType(result.path),
    path: result.path,
    url: result.url,
    score: result.score,
    updatedAt: result.updatedAt
  };
}

function relationReason(result: SearchResult) {
  if (result.sourceType === "chat") return "Related to previous conversation history.";
  if (result.sourceType === "web") return "Related to the current web search results.";
  return `Related through ${result.matchedBy} search.`;
}

function inferNodeType(path: string): KnowledgeNode["type"] {
  if (path.startsWith("chat://")) return "chat";
  if (path.startsWith("http")) return "web";
  if (path.includes("02_Projects")) return "project";
  if (path.includes("07_Logs/decisions")) return "decision";
  if (path.includes("tasks")) return "task";
  if (path.includes("Notes") || path.includes("note")) return "note";
  if (path.includes("Files") || path.match(/\.(pdf|docx?|xlsx?|pptx?|png|jpe?g)$/iu)) return "file";
  return "document";
}

function folderNodeForPath(path: string): KnowledgeNode | null {
  if (path.startsWith("http") || path.startsWith("chat://")) return null;
  const folder = path.split("/")[0];
  if (!folder) return null;
  return {
    id: `folder:${folder}`,
    label: folder,
    type: "document",
    score: 0.35
  };
}

function dedupeResults(results: SearchResult[]) {
  const seen = new Map<string, SearchResult>();
  for (const result of results) {
    const existing = seen.get(result.documentId);
    if (!existing || result.score > existing.score) seen.set(result.documentId, result);
  }
  return [...seen.values()].sort((a, b) => b.score - a.score);
}

function dedupeNodes(nodes: KnowledgeNode[]) {
  const seen = new Map<string, KnowledgeNode>();
  for (const node of nodes) seen.set(node.id, node);
  return [...seen.values()];
}

function dedupeEdges(edges: KnowledgeEdge[]) {
  const seen = new Map<string, KnowledgeEdge>();
  for (const edge of edges) seen.set(edge.id, edge);
  return [...seen.values()];
}
