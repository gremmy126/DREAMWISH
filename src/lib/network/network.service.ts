import { loadMarkdownDocuments } from "@/src/lib/rag/document-loader";
import { hybridSearchResults } from "@/src/lib/search/search.service";
import type { SearchResult } from "@/src/lib/search/search.types";
import type { KnowledgeEdge, KnowledgeNetwork, KnowledgeNode } from "./network.types";

export async function buildContextNetwork(
  query: string,
  extraResults: SearchResult[] = [],
  baseResults?: SearchResult[]
): Promise<KnowledgeNetwork> {
  const results = [...(baseResults || (await hybridSearchResults(query, 10))), ...extraResults].slice(0, 14);
  const documents = await loadMarkdownDocuments();
  const byPath = new Map(documents.map((document) => [document.relativePath, document]));
  const nodes: KnowledgeNode[] = [
    {
      id: "query",
      label: query.trim() || "현재 질문",
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
      relationType: "rag_relation",
      strength: result.score,
      reason: `${result.matchedBy} 검색으로 현재 질문과 연결됨`
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
        reason: `같은 태그 ${tag}로 연결됨`
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
        reason: `같은 폴더 ${folderNode.label}에 속함`
      });
    }
  }

  nodes.push(...tagNodes.values());
  return { nodes: dedupeNodes(nodes).slice(0, 18), edges: dedupeEdges(edges).slice(0, 28) };
}

function resultToNode(result: SearchResult): KnowledgeNode {
  return {
    id: result.documentId,
    label: result.title,
    type: result.sourceType === "web" ? "web" : inferNodeType(result.path),
    path: result.path,
    url: result.url,
    score: result.score,
    updatedAt: result.updatedAt
  };
}

function inferNodeType(path: string): KnowledgeNode["type"] {
  if (path.includes("02_Projects")) return "project";
  if (path.startsWith("http")) return "web";
  if (path.includes("07_Logs/decisions")) return "decision";
  if (path.includes("tasks")) return "task";
  if (path.includes("Notes") || path.includes("note")) return "note";
  if (path.includes("Files") || path.match(/\.(pdf|docx?|xlsx?|pptx?|png|jpe?g)$/iu)) return "file";
  return "document";
}

function folderNodeForPath(path: string): KnowledgeNode | null {
  if (path.startsWith("http")) return null;
  const folder = path.split("/")[0];
  if (!folder) return null;
  return {
    id: `folder:${folder}`,
    label: folder,
    type: "document",
    score: 0.35
  };
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
