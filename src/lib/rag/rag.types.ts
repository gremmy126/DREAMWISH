import type { SourceDocument } from "@/src/lib/chat/chat.types";

export type LocalDocument = {
  title: string;
  relativePath: string;
  absolutePath: string;
  updated: string | null;
  tags: string[];
  content: string;
};

export type RagChunk = {
  id: string;
  title: string;
  path: string;
  updated: string | null;
  content: string;
  relevance: number;
};

export type BuiltContext = {
  contextText: string;
  sources: SourceDocument[];
};
