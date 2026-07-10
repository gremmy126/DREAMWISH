export type MemorySource =
  | "chat"
  | "manual"
  | "knowledge"
  | "file"
  | "web"
  | "gmail"
  | "google-calendar"
  | "slack";

export type MemorySignal =
  | "fact"
  | "repeated"
  | "preference"
  | "project"
  | "idea"
  | "todo"
  | "person"
  | "company"
  | "relationship";

export type MemoryStatus = "pending" | "approved" | "rejected";

export type MemoryCategory =
  | "Projects"
  | "Knowledge"
  | "Ideas"
  | "Tasks"
  | "Meetings"
  | "Learning"
  | "Coding"
  | "CRM"
  | "Business"
  | "Automation"
  | "Documents"
  | "Settings"
  | "Personal Workflow";

export type MemoryHistoryEntry = {
  at: string;
  event: string;
  sourceId: string | null;
  summary: string;
};

export type MemoryRelatedLinkType = "document" | "project" | "code" | "schedule" | "crm" | "task";

export type MemoryRelatedLink = {
  type: MemoryRelatedLinkType;
  label: string;
  confidence: number;
  sourceId?: string | null;
};

export type MemoryCandidate = {
  id: string;
  title: string;
  content: string;
  source: MemorySource;
  sourceId: string | null;
  projectId: string | null;
  signals: MemorySignal[];
  importance: number;
  recency: number;
  frequency: number;
  confidence: number;
  status: MemoryStatus;
  createdAt: string;
  updatedAt: string;
  preview: string;
  category?: MemoryCategory;
  summary?: string;
  tags?: string[];
  relatedConcepts?: string[];
  relatedLinks?: MemoryRelatedLink[];
  relatedMemoryIds?: string[];
  history?: MemoryHistoryEntry[];
  executionTrail?: ExternalCaptureStep[];
};

export type ApprovedMemory = MemoryCandidate & {
  status: "approved";
  approvedAt: string;
  approvedBy: string;
  approvalNote: string | null;
  markdownPath: string;
  embeddingId: string;
  graphUpdatedAt: string;
};

export type EmbeddingRecord = {
  id: string;
  memoryId: string;
  textHash: string;
  vector: number[];
  chunks: string[];
  createdAt: string;
};

export type KnowledgeEntityType =
  | "person"
  | "company"
  | "project"
  | "document"
  | "idea"
  | "schedule"
  | "event"
  | "tag"
  | "memory";

export type KnowledgeEdgeType =
  | "works_on"
  | "created"
  | "meeting"
  | "related_to"
  | "depends_on"
  | "mentions"
  | "references";

export type KnowledgeEntity = {
  id: string;
  label: string;
  type: KnowledgeEntityType;
  confidence: number;
  sourceIds: string[];
  metadata?: Record<string, string | number | boolean | null>;
};

export type KnowledgeEdge = {
  id: string;
  from: string;
  to: string;
  type: KnowledgeEdgeType;
  confidence: number;
  sourceIds: string[];
};

export type KnowledgeGraph = {
  nodes: KnowledgeEntity[];
  edges: KnowledgeEdge[];
  updatedAt: string;
};

export type MemorySearchResult = {
  id: string;
  title: string;
  snippet: string;
  score: number;
  sourceType: "memory" | "knowledge" | "file";
  sourceId: string;
  path?: string;
  projectId: string | null;
};

export type QuickMemorySearchResponse = {
  query: string;
  results: MemorySearchResult[];
};

export type DeepThinkSearchResponse = {
  query: string;
  summary: string;
  sources: Array<{ id: string; title: string; path?: string }>;
  evidence: string[];
  missingInformation: string[];
  contradictions: string[];
  nextInformationNeeded: string[];
};

export type DailyMemoryBrief = {
  date: string;
  todayTasks: string[];
  recentProjects: string[];
  staleProjects: string[];
  recentPeople: string[];
  importantMemories: string[];
  unresolvedIssues: string[];
  likelyForgotten: string[];
};

export type MemoryDashboardSnapshot = {
  inbox: MemoryCandidate[];
  recentMemory: ApprovedMemory[];
  people: KnowledgeEntity[];
  projects: KnowledgeEntity[];
  knowledgeNetwork: KnowledgeGraph;
  dailyBrief: DailyMemoryBrief;
  timeline: Array<{
    id: string;
    title: string;
    type: "candidate" | "approved" | "external";
    createdAt: string;
  }>;
  health: {
    duplicateSuggestions: Array<{ ids: string[]; reason: string }>;
    brokenLinks: string[];
    brokenLinkCount: number;
    approvalQueueSize: number;
  };
  statistics: {
    totalCandidates: number;
    totalMemories: number;
    totalPeople: number;
    totalProjects: number;
    totalEdges: number;
  };
};

export type ExternalCaptureStep =
  | "Planner"
  | "Permission"
  | "Preview"
  | "Approval"
  | "Capture"
  | "Knowledge Update";

export type MemoryChangeAction = "capture" | "update" | "delete";

export type MemoryChangePreview = {
  id: string;
  action: MemoryChangeAction;
  targetId: string | null;
  proposedContent: string;
  approvalRequired: true;
  status: "preview" | "approved" | "undone";
  createdAt: string;
  updatedAt: string;
  history: Array<{
    at: string;
    event: string;
    actor: "system" | "user";
  }>;
};

export type MemoryMcpTool = {
  name: string;
  description: string;
  approvalRequired: boolean;
};
