export type ResearchMode = "standard" | "deep" | "deepest" | "custom";

export type ResearchJobStatus =
  | "queued"
  | "planning"
  | "searching"
  | "reading"
  | "analyzing"
  | "verifying"
  | "writing"
  | "completed"
  | "failed"
  | "cancelled"
  | "paused";

export const ACTIVE_RESEARCH_STATUSES: ResearchJobStatus[] = [
  "queued",
  "planning",
  "searching",
  "reading",
  "analyzing",
  "verifying",
  "writing"
];

export type ResearchSettings = {
  mode: ResearchMode;
  /** Upper execution budget. The job may finish earlier once evidence suffices. */
  maxDurationMs: number;
  maxSearchQueries: number;
  maxPages: number;
  minSources: number;
  maxSources: number;
  concurrency: number;
  includeCrm: boolean;
  includeErp: boolean;
  includeLocalDocs: boolean;
  preferOfficial: boolean;
  preferRecent: boolean;
  includeNews: boolean;
  includeGithub: boolean;
  resultLanguage: "ko" | "en";
  reportLength: "short" | "medium" | "long";
  autoSave: boolean;
};

export type ResearchSource = {
  id: string;
  url: string;
  title: string;
  domain: string;
  snippet: string;
  query: string;
  sourceType: "web" | "internal";
  fetched: boolean;
  official: boolean;
  credibilityScore: number;
  accessedAt: string;
  publishedAt: string | null;
  contentChars: number;
  duplicate: boolean;
};

export type ResearchEvidence = {
  sourceId: string;
  excerpt: string;
};

export type ResearchProgressEvent = {
  at: string;
  step: string;
  message: string;
};

export type ResearchVideo = {
  id: string;
  url: string;
  title: string;
  channel: string | null;
  description: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  durationLabel: string | null;
  relatedQuery: string;
};

export type ResearchReportSections = {
  summary: string;
  findings: string;
  conclusion: string;
  followUp: string;
};

export type ResearchCheckpoint = {
  stage: "plan" | "search" | "read" | "analyze" | "write" | "done";
  subQuestions: string[];
  pendingQueries: string[];
  usedQueries: string[];
  evidence: ResearchEvidence[];
  iteration: number;
};

export type ResearchUsage = {
  searches: number;
  pagesFetched: number;
  aiCalls: number;
};

export type ResearchJob = {
  id: string;
  ownerId: string;
  chatSessionId: string | null;
  query: string;
  mode: ResearchMode;
  settings: ResearchSettings;
  status: ResearchJobStatus;
  progress: number;
  currentStep: string;
  progressEvents: ResearchProgressEvent[];
  checkpoint: ResearchCheckpoint | null;
  report: string | null;
  reportSections: ResearchReportSections | null;
  sources: ResearchSource[];
  videos: ResearchVideo[];
  error: string | null;
  usage: ResearchUsage;
  cancelRequested: boolean;
  pauseRequested: boolean;
  heartbeatAt: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
};

export type ResearchJobView = Omit<ResearchJob, "checkpoint"> & {
  resumable: boolean;
  usedQueries: string[];
  /** Source ids in citation order: [n] in the report refers to entry n-1. */
  citedSourceIds: string[];
};

export function toResearchJobView(job: ResearchJob): ResearchJobView {
  const { checkpoint, ...visible } = job;
  return {
    ...visible,
    videos: job.videos || [],
    reportSections: job.reportSections || null,
    resumable: job.status === "paused" && checkpoint !== null,
    usedQueries: checkpoint?.usedQueries || [],
    citedSourceIds: (checkpoint?.evidence || []).map((item) => item.sourceId)
  };
}

export function isActiveResearchStatus(status: ResearchJobStatus) {
  return ACTIVE_RESEARCH_STATUSES.includes(status);
}
