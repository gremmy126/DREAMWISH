import type { SearchResult } from "@/src/lib/search/search.types";
import type { SuggestedConnection } from "@/src/lib/connections/connections.types";
import type { KnowledgeNetwork } from "@/src/lib/network/network.types";

export type ContextPayload = {
  query: string;
  results: SearchResult[];
  conversationMatches: SearchResult[];
  webResults: SearchResult[];
  suggestions: SuggestedConnection[];
  network: KnowledgeNetwork;
  relatedDocuments: SearchResult[];
  relatedProjects: SearchResult[];
  relatedNotes: SearchResult[];
  relatedFiles: SearchResult[];
};
