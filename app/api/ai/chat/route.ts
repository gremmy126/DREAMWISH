import { NextResponse } from "next/server";
import { apiFailure, apiSuccess } from "@/src/lib/api/api-response";
import { parseJsonRequestBody } from "@/src/lib/api/json-request";
import { chatWithAI } from "@/src/lib/ai/ai.service";
import { parseProviderName } from "@/src/lib/ai/provider-options";
import { buildChatMessages, buildGeneralChatMessages } from "@/src/lib/ai/prompts";
import { getChatExecutionPlan, getWebSearchQuery } from "@/src/lib/ai/question-classifier";
import {
  type AnswerConfidence,
  type AnswerVerification,
  type SourceDocument,
} from "@/src/lib/chat/chat.types";
import {
  appendWebAnswerReferences,
  buildWebAnswerMessages,
  buildWebAnswerReferences,
  createInsufficientWebAnswer,
  selectWebAnswerContext
} from "@/src/lib/ai/web-answer";
import { addMessage, ensureSession } from "@/src/lib/db/repositories/chat.repository";
import { runAutoMemoryEngineQuietly } from "@/src/lib/memory/auto-memory-engine";
import {
  checkDocumentQuality,
  formatQualityReport,
  isQualityCommand
} from "@/src/lib/quality/document-quality.service";
import { buildRagContext } from "@/src/lib/rag/context-builder";
import { calculateConfidence } from "@/src/lib/rag/confidence";
import { hybridSearch } from "@/src/lib/rag/rag.service";
import { verifyAnswer } from "@/src/lib/rag/verification";
import { searchWeb } from "@/src/lib/web-search/web-search.service";

type ChatRequestBody = {
  message?: unknown;
  sessionId?: unknown;
  model?: unknown;
  provider?: unknown;
};

export async function POST(request: Request) {
  try {
    const parsed = await parseJsonRequestBody<ChatRequestBody>(request);

    if (!parsed.ok) {
      return NextResponse.json(
        { ok: false, error: parsed.error },
        { status: parsed.status }
      );
    }

    const body = parsed.data;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
    const providerName = parseProviderName(body.model || body.provider);

    if (!message) {
      const failure = apiFailure(400, "MESSAGE_REQUIRED", "Message is required.");
      return NextResponse.json({ ok: false, error: failure.error }, { status: failure.status });
    }

    if (message.length > 4000) {
      const failure = apiFailure(413, "MESSAGE_TOO_LONG", "Message is too long.");
      return NextResponse.json(
        { ok: false, error: failure.error },
        { status: failure.status }
      );
    }

    const session = await ensureSession(sessionId, message);
    await addMessage({ sessionId: session.id, role: "user", content: message });

    if (isQualityCommand(message)) {
      const report = await checkDocumentQuality(message);
      const answer = formatQualityReport(report);
      await addMessage({
        sessionId: session.id,
        role: "assistant",
        content: answer,
        sources: [],
        confidence: {
          level: "high",
          score: 1,
          reason: "로컬 문서 품질검사 결과입니다."
        },
        verification: {
          supportedClaims: [],
          weakClaims: [],
          unsupportedClaims: [],
          warning: null
        }
      });
      await runAutoMemoryEngineQuietly({
        sessionId: session.id,
        userMessage: message,
        assistantAnswer: answer
      });
      return NextResponse.json(apiSuccess({
        answer,
        sources: [],
        confidence: {
          level: "high",
          score: 1,
          reason: "로컬 문서 품질검사 결과입니다."
        },
        verification: {
          supportedClaims: [],
          weakClaims: [],
          unsupportedClaims: [],
          warning: null
        },
        sessionId: session.id
      }));
    }

    const plan = getChatExecutionPlan(message);
    let answer = "";
    let sources: SourceDocument[] = [];
    let confidence: AnswerConfidence = {
      level: "none" as const,
      score: 0,
      reason: "일반 LLM 답변입니다."
    };
    let verification: AnswerVerification = emptyVerification();

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
        reason: references.length > 0 ? "웹 검색 결과를 종합한 답변입니다." : "웹 검색 근거가 부족합니다."
      };
    } else if (plan.intent === "LOCAL") {
      const chunks = await hybridSearch(message, 8);
      const context = buildRagContext(chunks);
      sources = context.sources;
      confidence = calculateConfidence(chunks);
      answer = await chatWithAI(buildChatMessages(context.contextText, message), providerName);
      verification = verifyAnswer(answer, sources);
    } else {
      answer = await chatWithAI(buildGeneralChatMessages(message), providerName);
    }

    await addMessage({
      sessionId: session.id,
      role: "assistant",
      content: answer,
      sources,
      confidence,
      verification
    });
    await runAutoMemoryEngineQuietly({
      sessionId: session.id,
      userMessage: message,
      assistantAnswer: answer
    });

    return NextResponse.json(apiSuccess({
      answer,
      sources,
      confidence,
      verification,
      sessionId: session.id
    }));
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "GENERATION_FAILED",
          message: getReadableError(error)
        }
      },
      { status: 500 }
    );
  }
}

function getReadableError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "AI 채팅 처리 중 알 수 없는 오류가 발생했습니다.";
}

function emptyVerification() {
  return {
    supportedClaims: [],
    weakClaims: [],
    unsupportedClaims: [],
    warning: null
  };
}
