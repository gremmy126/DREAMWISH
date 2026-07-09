import type { SuggestedConnection } from "@/src/lib/connections/connections.types";
import type { KnowledgeNetwork } from "@/src/lib/network/network.types";
import type { SearchResult } from "@/src/lib/search/search.types";

export type ContextRelevanceInput = {
  query: string;
  results: SearchResult[];
  conversationMatches: SearchResult[];
  webResults: SearchResult[];
  suggestions: SuggestedConnection[];
  network: KnowledgeNetwork;
};

export function buildRelevantContextPayload(input: ContextRelevanceInput) {
  const results = filterRelevantResults(input.query, input.results, 10);
  const conversationMatches = filterRelevantResults(input.query, input.conversationMatches, 8);
  const webResults = filterRelevantResults(input.query, input.webResults, 6);
  const suggestions = filterRelevantSuggestions(input.query, input.suggestions, 6);
  const allowedNodeIds = new Set([
    "query",
    ...results.map((result) => result.documentId),
    ...conversationMatches.map((result) => result.documentId),
    ...webResults.map((result) => result.documentId),
    ...suggestions.map((suggestion) => suggestion.targetId)
  ]);
  const allowedNetworkNodeIds = new Set(
    input.network.nodes
      .filter((node) => allowedNodeIds.has(node.id) || node.type === "tag")
      .map((node) => node.id)
  );
  const network = {
    nodes: input.network.nodes.filter((node) => allowedNetworkNodeIds.has(node.id)),
    edges: input.network.edges.filter(
      (edge) =>
        allowedNetworkNodeIds.has(edge.sourceId) && allowedNetworkNodeIds.has(edge.targetId)
    )
  };

  return {
    query: input.query,
    results,
    conversationMatches,
    webResults,
    suggestions,
    network,
    relatedDocuments: [...results.filter(isDocumentLike), ...webResults].slice(0, 10),
    relatedProjects: results.filter((result) => result.path.includes("02_Projects")),
    relatedNotes: results.filter((result) => result.path.toLowerCase().includes("note")),
    relatedFiles: results.filter((result) => !result.path.endsWith(".md") && !result.path.startsWith("chat://"))
  };
}

export function filterRelevantResults(query: string, results: SearchResult[], limit: number) {
  const terms = tokenize(query);
  if (terms.length === 0) return [];

  return results
    .filter((result) => {
      if (result.matchedBy === "recent") return false;
      if (result.score >= 0.72) return true;
      if (result.matchedBy === "chat" && result.score >= 0.35) return true;
      return overlapsQuery(terms, result) > 0 && result.score >= 0.18;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function filterRelevantSuggestions(
  query: string,
  suggestions: SuggestedConnection[],
  limit: number
) {
  const terms = tokenize(query);
  if (terms.length === 0) return [];

  return suggestions
    .filter((suggestion) => {
      const text = [
        suggestion.targetTitle,
        suggestion.targetPath,
        suggestion.reason,
        suggestion.externalTargetId || ""
      ]
        .join(" ")
        .toLowerCase();
      const directOverlap = terms.some((term) => text.includes(term));
      if (suggestion.targetType === "app" || suggestion.targetType === "website") {
        return directOverlap && suggestion.strength >= 0.65;
      }
      return directOverlap || suggestion.strength >= 0.7;
    })
    .slice(0, limit);
}

export function shouldUseExternalWebContext(query: string) {
  return /(?:웹|검색|사이트|뉴스|web|search|site|news|github|slack|google|firebase|notion|http|www\.)/iu.test(query);
}

function overlapsQuery(terms: string[], result: SearchResult) {
  const text = `${result.title} ${result.path} ${result.snippet}`.toLowerCase();
  return terms.filter((term) => text.includes(term)).length;
}

function isDocumentLike(result: SearchResult) {
  return (
    result.path.includes("00_") ||
    result.path.endsWith(".md") ||
    result.sourceType === "web"
  );
}

function tokenize(text: string) {
  return Array.from(new Set(text.toLowerCase().match(/[가-힣a-z0-9_]{2,}/giu) || []));
}
