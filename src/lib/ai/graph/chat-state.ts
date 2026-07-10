import type { AIMessage, AIProviderName } from "../ai-provider";
import type {
  AnswerConfidence,
  AnswerVerification,
  SourceDocument
} from "@/src/lib/chat/chat.types";

export type ChatGraphError = {
  code: string;
  message: string;
  retryable: boolean;
};

export type ChatGraphState = {
  userId: string;
  conversationId?: string;
  messages: AIMessage[];
  userMessage: string;
  provider?: AIProviderName;
  model?: string;
  retrievedDocuments: unknown[];
  contextText: string;
  contextAvailable: boolean;
  answer?: string;
  citations: SourceDocument[];
  confidence?: AnswerConfidence;
  verification?: AnswerVerification;
  error?: ChatGraphError;
};

export function emptyAnswerVerification(): AnswerVerification {
  return {
    supportedClaims: [],
    weakClaims: [],
    unsupportedClaims: [],
    warning: null
  };
}
