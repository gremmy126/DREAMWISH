export type KnowledgeNode = {
  id: string;
  label: string;
  type:
    | "query"
    | "document"
    | "project"
    | "note"
    | "file"
    | "tag"
    | "task"
    | "decision"
    | "web";
  path?: string;
  url?: string;
  score?: number;
  updatedAt?: string;
};

export type KnowledgeEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  relationType:
    | "explicit_link"
    | "tag_relation"
    | "folder_relation"
    | "semantic_relation"
    | "temporal_relation"
    | "rag_relation"
    | "ai_suggested_relation";
  strength: number;
  reason: string;
};

export type KnowledgeNetwork = {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
};
