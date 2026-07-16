import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { chatWithAI } from "../ai.service";
import { getDefaultAIProviderName } from "../config";
import { toClientAIError } from "../errors";
import { buildContextAwareChatMessages } from "../prompts";
import {
  type ChatGraphState,
  emptyAnswerVerification
} from "./chat-state";
import type { AIMessage, AIProviderName } from "../ai-provider";
import type {
  AnswerConfidence,
  AnswerVerification,
  SourceDocument
} from "@/src/lib/chat/chat.types";
import { buildRagContext } from "@/src/lib/rag/context-builder";
import { calculateConfidence } from "@/src/lib/rag/confidence";
import { hybridSearch } from "@/src/lib/rag/rag.service";
import { verifyAnswer } from "@/src/lib/rag/verification";

const ChatStateAnnotation = Annotation.Root({
  userId: Annotation<string>,
  conversationId: Annotation<string | undefined>,
  messages: Annotation<AIMessage[]>({
    reducer: (_left, right) => right,
    default: () => []
  }),
  userMessage: Annotation<string>,
  provider: Annotation<AIProviderName | undefined>,
  model: Annotation<string | undefined>,
  retrievedDocuments: Annotation<unknown[]>({
    reducer: (_left, right) => right,
    default: () => []
  }),
  contextText: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => ""
  }),
  contextAvailable: Annotation<boolean>({
    reducer: (_left, right) => right,
    default: () => false
  }),
  memoryContextText: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => ""
  }),
  businessContextText: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => ""
  }),
  answer: Annotation<string | undefined>,
  citations: Annotation<SourceDocument[]>({
    reducer: (_left, right) => right,
    default: () => []
  }),
  confidence: Annotation<AnswerConfidence | undefined>,
  verification: Annotation<AnswerVerification | undefined>,
  error: Annotation<ChatGraphState["error"] | undefined>
});

export async function runChatGraph(input: {
  userId?: string;
  conversationId?: string;
  userMessage: string;
  provider?: AIProviderName;
  shouldUseRag: boolean;
  memoryContextText?: string;
  businessContextText?: string;
}) {
  const graph = createChatGraph(input.shouldUseRag);
  return graph.invoke({
    userId: input.userId || "local-user",
    conversationId: input.conversationId,
    userMessage: input.userMessage,
    provider: input.provider,
    messages: [],
    retrievedDocuments: [],
    contextText: "",
    contextAvailable: false,
    memoryContextText: input.memoryContextText || "",
    businessContextText: input.businessContextText || "",
    citations: []
  });
}

function createChatGraph(shouldUseRag: boolean) {
  return new StateGraph(ChatStateAnnotation)
    .addNode("validateInput", validateInput)
    .addNode("loadUserProvider", loadUserProvider)
    .addNode("retrieveContext", shouldUseRag ? retrieveContext : skipRetrieveContext)
    .addNode("generateAnswer", generateAnswer)
    .addNode("validateAnswer", validateAnswer)
    .addEdge(START, "validateInput")
    .addEdge("validateInput", "loadUserProvider")
    .addEdge("loadUserProvider", "retrieveContext")
    .addEdge("retrieveContext", "generateAnswer")
    .addEdge("generateAnswer", "validateAnswer")
    .addEdge("validateAnswer", END)
    .compile();
}

async function validateInput(state: ChatGraphState): Promise<Partial<ChatGraphState>> {
  const userMessage = state.userMessage.trim();
  if (!userMessage) {
    return {
      error: {
        code: "EMPTY_MESSAGE",
        message: "Message is required.",
        retryable: false
      }
    };
  }
  return { userMessage };
}

async function loadUserProvider(state: ChatGraphState): Promise<Partial<ChatGraphState>> {
  if (state.error) return {};
  try {
    return { provider: state.provider || getDefaultAIProviderName() };
  } catch (error) {
    return { error: toClientAIError(error) };
  }
}

async function retrieveContext(state: ChatGraphState): Promise<Partial<ChatGraphState>> {
  if (state.error) return {};
  try {
    const chunks = await hybridSearch(state.userMessage, 8);
    const context = buildRagContext(chunks);
    return {
      retrievedDocuments: chunks,
      contextText: context.contextText,
      contextAvailable: context.sources.length > 0,
      citations: context.sources,
      confidence: calculateConfidence(chunks)
    };
  } catch (error) {
    return { error: toClientAIError(error) };
  }
}

async function skipRetrieveContext(): Promise<Partial<ChatGraphState>> {
  return {
    retrievedDocuments: [],
    contextText: "",
    contextAvailable: false,
    citations: [],
    confidence: {
      level: "none",
      score: 0,
      reason: "General AI answer without local document context."
    }
  };
}

async function generateAnswer(state: ChatGraphState): Promise<Partial<ChatGraphState>> {
  if (state.error) return {};
  try {
    const messages = buildContextAwareChatMessages({
      question: state.userMessage,
      contextText: state.contextText,
      contextAvailable: state.contextAvailable,
      memoryContextText: state.memoryContextText,
      businessContextText: state.businessContextText
    });
    const answer = await chatWithAI(messages, state.provider);
    return { messages, answer };
  } catch (error) {
    return { error: toClientAIError(error) };
  }
}

async function validateAnswer(state: ChatGraphState): Promise<Partial<ChatGraphState>> {
  if (state.error || !state.answer) return {};
  return {
    verification: state.contextAvailable
      ? verifyAnswer(state.answer, state.citations)
      : emptyAnswerVerification()
  };
}
