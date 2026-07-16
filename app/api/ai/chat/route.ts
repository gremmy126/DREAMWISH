import { NextResponse } from "next/server";
import { apiFailure, apiSuccess } from "@/src/lib/api/api-response";
import { parseJsonRequestBody } from "@/src/lib/api/json-request";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { chatWithAI } from "@/src/lib/ai/ai.service";
import { buildBusinessAiContext, type BusinessAiContext } from "@/src/lib/ai/business-tools";
import {
  appendApprovedMemoryToMessages,
  appendBusinessContextToMessages
} from "@/src/lib/ai/prompts";
import { toClientAIError } from "@/src/lib/ai/errors";
import { runChatGraph } from "@/src/lib/ai/graph/chat-graph";
import { emptyAnswerVerification } from "@/src/lib/ai/graph/chat-state";
import { parseProviderName } from "@/src/lib/ai/provider-options";
import { getChatExecutionPlan, getWebSearchQuery } from "@/src/lib/ai/question-classifier";
import {
  appendWebAnswerReferences,
  buildWebAnswerMessages,
  buildWebAnswerReferences,
  selectWebAnswerContext
} from "@/src/lib/ai/web-answer";
import {
  type AnswerConfidence,
  type AnswerVerification,
  type ChatMessageRecord,
  type SourceDocument
} from "@/src/lib/chat/chat.types";
import {
  addMessage,
  ChatSessionNotFoundError,
  ensureSession
} from "@/src/lib/db/repositories/chat.repository";
import { runAutoMemoryEngineQuietly } from "@/src/lib/memory/auto-memory-engine";
import {
  buildApprovedMemoryContext,
  type ApprovedMemoryContext
} from "@/src/lib/memory/approved-memory-context";
import {
  checkDocumentQuality,
  formatQualityReport,
  isQualityCommand
} from "@/src/lib/quality/document-quality.service";
import {
  buildUnverifiedWebFallbackMessages,
  searchWebSafely
} from "@/src/lib/web-search/web-search-outcome";

type ChatRequestBody = {
  message?: unknown;
  sessionId?: unknown;
  model?: unknown;
  provider?: unknown;
};

export async function POST(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    const parsed = await parseJsonRequestBody<ChatRequestBody>(request);

    if (!parsed.ok) {
      return NextResponse.json(
        { ok: false, error: parsed.error },
        { status: parsed.status }
      );
    }

    const body = parsed.data;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (
      Object.prototype.hasOwnProperty.call(body, "sessionId") &&
      typeof body.sessionId !== "string"
    ) {
      throw new ChatSessionNotFoundError();
    }
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
    const providerName = parseProviderName(body.model || body.provider);

    if (!message) {
      const failure = apiFailure(400, "EMPTY_MESSAGE", "Message is required.");
      return NextResponse.json({ ok: false, error: failure.error }, { status: failure.status });
    }

    if (message.length > 4000) {
      const failure = apiFailure(413, "INVALID_REQUEST", "Message is too long.");
      return NextResponse.json(
        { ok: false, error: failure.error },
        { status: failure.status }
      );
    }

    const session = await ensureSession(owner.uid, sessionId, message);
    const userMessageRecord = await addMessage({
      ownerId: owner.uid,
      sessionId: session.id,
      role: "user",
      content: message
    });
    const memoryContext = await buildApprovedMemoryContext(owner.uid, message).catch(
      (): ApprovedMemoryContext => ({
        status: "degraded",
        contextText: "",
        memories: [],
        sources: []
      })
    );
    const businessContext = await buildBusinessAiContext(owner.uid, message).catch(
      (): BusinessAiContext => ({ detected: false, contextText: "", sources: [] })
    );

    if (isQualityCommand(message)) {
      const report = await checkDocumentQuality(message);
      const answer = formatQualityReport(report);
      const confidence: AnswerConfidence = {
        level: "high",
        score: 1,
        reason: "Local document quality report."
      };
      const verification = emptyAnswerVerification();
      const capture = await saveAssistantExchange(
        owner.uid,
        session.id,
        userMessageRecord,
        message,
        answer,
        [],
        confidence,
        verification
      );
      return NextResponse.json(apiSuccess({
        answer,
        sources: [],
        confidence,
        verification,
        sessionId: session.id,
        memoryStatus: capture?.status || memoryContext.status,
        memoryCandidates: summarizeCandidates(capture?.candidates || [])
      }));
    }

    const plan = getChatExecutionPlan(message);
    let answer = "";
    let sources: SourceDocument[] = [];
    let confidence: AnswerConfidence = {
      level: "none",
      score: 0,
      reason: "General AI answer."
    };
    let verification: AnswerVerification = emptyAnswerVerification();

    if (plan.intent === "WEB") {
      const webOutcome = await searchWebSafely(getWebSearchQuery(message));
      const webContext = selectWebAnswerContext(message, webOutcome.results);
      const references = buildWebAnswerReferences(webContext);
      answer =
        webContext.length === 0
          ? await chatWithAI(
              appendBusinessContextToMessages(
                appendApprovedMemoryToMessages(
                  buildUnverifiedWebFallbackMessages(
                    message,
                    webOutcome.warning || "No usable live web sources were found."
                  ),
                  memoryContext.contextText
                ),
                businessContext.contextText
              ),
              providerName
            )
          : appendWebAnswerReferences(
              await chatWithAI(
                appendBusinessContextToMessages(
                  appendApprovedMemoryToMessages(
                    buildWebAnswerMessages(message, webContext),
                    memoryContext.contextText
                  ),
                  businessContext.contextText
                ),
                providerName
              ),
              references
            );
      confidence = {
        level: references.length > 0 ? "medium" : "none",
        score: references.length > 0 ? 0.72 : 0,
        reason: references.length > 0 ? "Web search context was used." : "No web context was found."
      };
      if (webContext.length === 0) {
        verification = {
          ...verification,
          warning: webOutcome.warning || "Live web sources could not be verified."
        };
      }
    } else {
      const graphResult = await runChatGraph({
        userId: owner.uid,
        conversationId: session.id,
        userMessage: message,
        provider: providerName,
        shouldUseRag: plan.intent === "LOCAL",
        memoryContextText: memoryContext.contextText,
        businessContextText: businessContext.contextText
      });
      if (graphResult.error) throw graphResult.error;
      answer = graphResult.answer || "";
      sources = graphResult.citations || [];
      confidence = graphResult.confidence || confidence;
      verification = graphResult.verification || verification;
    }
    sources = mergeSources(sources, [...memoryContext.sources, ...businessContext.sources]);

    const capture = await saveAssistantExchange(
      owner.uid,
      session.id,
      userMessageRecord,
      message,
      answer,
      sources,
      confidence,
      verification
    );

    return NextResponse.json(apiSuccess({
      answer,
      sources,
      confidence,
      verification,
      sessionId: session.id,
      memoryStatus: capture?.status || memoryContext.status,
      memoryCandidates: summarizeCandidates(capture?.candidates || [])
    }));
  } catch (error) {
    if (error instanceof ChatSessionNotFoundError) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: error.code, message: error.message, retryable: false }
        },
        { status: error.status }
      );
    }
    const clientError = toClientAIError(error);
    const status = clientError.code === "PROVIDER_NOT_CONFIGURED" ? 503 : 500;
    return NextResponse.json(
      { ok: false, error: clientError },
      { status }
    );
  }
}

async function saveAssistantExchange(
  ownerId: string,
  sessionId: string,
  userMessageRecord: ChatMessageRecord,
  userMessage: string,
  answer: string,
  sources: SourceDocument[],
  confidence: AnswerConfidence,
  verification: AnswerVerification
) {
  const assistantMessageRecord = await addMessage({
    ownerId,
    sessionId,
    role: "assistant",
    content: answer,
    sources,
    confidence,
    verification
  });
  return runAutoMemoryEngineQuietly({
    ownerId,
    sessionId,
    userMessageId: userMessageRecord.id,
    assistantMessageId: assistantMessageRecord.id,
    userMessage,
    assistantAnswer: answer
  });
}

function mergeSources(primary: SourceDocument[], memory: SourceDocument[]) {
  const seen = new Map<string, SourceDocument>();
  for (const source of [...primary, ...memory]) seen.set(source.path, source);
  return [...seen.values()];
}

function summarizeCandidates(candidates: Array<{
  id: string;
  title: string;
  content: string;
  preview: string;
  version: number;
  category?: string;
  importance: number;
  recency: number;
  frequency: number;
  confidence: number;
}>) {
  return candidates.map(({ id, title, content, preview, version, category, importance, recency, frequency, confidence }) => ({
    id, title, content, preview, version, category, importance, recency, frequency, confidence
  }));
}
