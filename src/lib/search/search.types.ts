export type SearchMatchType =
  | "keyword"
  | "vector"
  | "tag"
  | "path"
  | "title"
  | "recent"
  | "chat"
  | "web";

export type SearchResult = {
  documentId: string;
  title: string;
  path: string;
  snippet: string;
  score: number;
  matchedBy: SearchMatchType;
  sourceType?: "local" | "chat" | "web";
  url?: string;
  updatedAt: string;
};
