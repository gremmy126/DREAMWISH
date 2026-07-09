export type ChatRole = "system" | "user" | "assistant";

export type SourceDocument = {
  title: string;
  path: string;
  relevance: number;
  updated: string | null;
  preview: string;
};

export type AnswerConfidence = {
  level: "high" | "medium" | "low" | "none";
  score: number;
  reason: string;
};

export type AnswerVerification = {
  supportedClaims: string[];
  weakClaims: string[];
  unsupportedClaims: string[];
  warning: string | null;
};

export type ChatSessionRecord = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type ChatMessageRecord = {
  id: string;
  session_id: string;
  role: Exclude<ChatRole, "system">;
  content: string;
  sources_json: SourceDocument[] | null;
  confidence_json: AnswerConfidence | null;
  verification_json: AnswerVerification | null;
  created_at: string;
};

export type ChatSessionDetail = {
  session: ChatSessionRecord;
  messages: ChatMessageRecord[];
};
