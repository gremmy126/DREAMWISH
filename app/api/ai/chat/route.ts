import { NextResponse } from "next/server";
import { apiFailure, apiSuccess } from "@/src/lib/api/api-response";
import { parseJsonRequestBody } from "@/src/lib/api/json-request";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { chatWithAI } from "@/src/lib/ai/ai.service";
import { toClientAIError } from "@/src/lib/ai/errors";
import { runChatGraph } from "@/src/lib/ai/graph/chat-graph";
import { emptyAnswerVerification } from "@/src/lib/ai/graph/chat-state";
import { parseProviderName } from "@/src/lib/ai/provider-options";
import { getChatExecutionPlan, getWebSearchQuery } from "@/src/lib/ai/question-classifier";
import {
  appendWebAnswerReferences,
  buildWebAnswerMessages,
  buildWebAnswerReferences,
  createInsufficientWebAnswer,
  selectWebAnswerContext
} from "@/src/lib/ai/web-answer";
import {
  type AnswerConfidence,
  type AnswerVerification,
  type SourceDocument
} from "@/src/lib/chat/chat.types";
import {
  addMessage,
  ChatSessionNotFoundError,
  ensureSession
} from "@/src/lib/db/repositories/chat.repository";
import { runAutoMemoryEngineQuietly } from "@/src/lib/memory/auto-memory-engine";
import {
  checkDocumentQuality,
  formatQualityReport,
  isQualityCommand
} from "@/src/lib/quality/document-quality.service";
import { searchWeb } from "@/src/lib/web-search/web-search.service";

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
    await addMessage({
      ownerId: owner.uid,
      sessionId: session.id,
      role: "user",
      content: message
    });

    if (isQualityCommand(message)) {
      const report = await checkDocumentQuality(message);
      const answer = formatQualityReport(report);
      const confidence: AnswerConfidence = {
        level: "high",
        score: 1,
        reason: "Local document quality report."
      };
      const verification = emptyAnswerVerification();
      await saveAssistantExchange(
        owner.uid,
        session.id,
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
        sessionId: session.id
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
      const webResults = await searchWeb(getWebSearchQuery(message));
      const webContext = selectWebAnswerContext(message, webResults);
      const references = buildWebAnswerReferences(webContext);
      answer =
        webContext.length === 0
          ? createInsufficientWebAnswer()
          : appendWebAnswerReferences(
              await chatWithAI(buildWebAnswerMessages(message, webContext), providerName),
              references
            );
      confidence = {
        level: references.length > 0 ? "medium" : "none",
        score: references.length > 0 ? 0.72 : 0,
        reason: references.length > 0 ? "Web search context was used." : "No web context was found."
      };
    } else {
      const graphResult = await runChatGraph({
        conversationId: session.id,
        userMessage: message,
        provider: providerName,
        shouldUseRag: plan.intent === "LOCAL"
      });
      if (graphResult.error) throw graphResult.error;
      answer = graphResult.answer || "";
      sources = graphResult.citations || [];
      confidence = graphResult.confidence || confidence;
      verification = graphResult.verification || verification;
    }

    await saveAssistantExchange(
      owner.uid,
      session.id,
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
      sessionId: session.id
    }));
  } catch (error) {
    const clientError = toClientAIError(error);
    const status =
      error instanceof ChatSessionNotFoundError
        ? error.status
        : clientError.code === "PROVIDER_NOT_CONFIGURED"
          ? 503
          : 500;
    return NextResponse.json(
      { ok: false, error: clientError },
      { status }
    );
  }
}

async function saveAssistantExchange(
  ownerId: string,
  sessionId: string,
  userMessage: string,
  answer: string,
  sources: SourceDocument[],
  confidence: AnswerConfidence,
  verification: AnswerVerification
) {
  await addMessage({
    ownerId,
    sessionId,
    role: "assistant",
    content: answer,
    sources,
    confidence,
    verification
  });
  await runAutoMemoryEngineQuietly({
    sessionId,
    userMessage,
    assistantAnswer: answer
  });
}
