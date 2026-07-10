import { streamChatWithAI } from "@/src/lib/ai/ai.service";
import { apiFailure } from "@/src/lib/api/api-response";
import { parseJsonRequestBody } from "@/src/lib/api/json-request";
import { parseProviderName } from "@/src/lib/ai/provider-options";
import { buildChatMessages, buildGeneralChatMessages } from "@/src/lib/ai/prompts";
import { getChatExecutionPlan, getWebSearchQuery } from "@/src/lib/ai/question-classifier";
import {
  type AnswerConfidence,
  type AnswerVerification,
  type SourceDocument,
} from "@/src/lib/chat/chat.types";
import {
  buildWebAnswerMessages,
  buildWebAnswerReferences,
  createInsufficientWebAnswer,
  formatWebAnswerReferences,
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
  const parsed = await parseJsonRequestBody<ChatRequestBody>(request);

  if (!parsed.ok) {
    return Response.json(
      { ok: false, error: parsed.error },
      { status: parsed.status }
    );
  }

  const body = parsed.data;
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!message) {
    const failure = apiFailure(400, "MESSAGE_REQUIRED", "Message is required.");
    return Response.json({ ok: false, error: failure.error }, { status: failure.status });
  }

  if (message.length > 4000) {
    const failure = apiFailure(413, "MESSAGE_TOO_LONG", "Message is too long.");
    return Response.json({ ok: false, error: failure.error }, { status: failure.status });
  }

  const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
  const providerName = parseProviderName(body.model || body.provider);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        send("status", { status: "submitting" });
        const session = await ensureSession(sessionId, message);
        send("session", { sessionId: session.id });
        await addMessage({ sessionId: session.id, role: "user", content: message });

        if (isQualityCommand(message)) {
          const report = await checkDocumentQuality(message);
          const answer = formatQualityReport(report);
          const confidence = {
            level: "high" as const,
            score: 1,
            reason: "로컬 문서 품질검사 결과입니다."
          };
          const verification = {
            supportedClaims: [],
            weakClaims: [],
            unsupportedClaims: [],
            warning: null
          };
          send("sources", { sources: [], confidence });
          send("delta", { text: answer });
          await addMessage({
            sessionId: session.id,
            role: "assistant",
            content: answer,
            sources: [],
            confidence,
            verification
          });
          await runAutoMemoryEngineQuietly({
            sessionId: session.id,
            userMessage: message,
            assistantAnswer: answer
          });
          send("done", {
            answer,
            sources: [],
            confidence,
            verification,
            sessionId: session.id
          });
          return;
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

        send("status", { status: "generating" });

        if (plan.intent === "WEB") {
          send("status", { status: "searching-web" });
          const webResults = await searchWeb(getWebSearchQuery(message));
          const webContext = selectWebAnswerContext(message, webResults);
          const references = buildWebAnswerReferences(webContext);
          confidence = {
            level: references.length > 0 ? "medium" : "none",
            score: references.length > 0 ? 0.72 : 0,
            reason: references.length > 0 ? "웹 검색 결과를 종합한 답변입니다." : "웹 검색 근거가 부족합니다."
          };
          send("sources", { sources, confidence });

          if (webContext.length === 0) {
            answer = createInsufficientWebAnswer();
            send("delta", { text: answer });
          } else {
            send("status", { status: "streaming" });
            for await (const token of streamChatWithAI(
              buildWebAnswerMessages(message, webContext),
              providerName
            )) {
              answer += token;
              send("delta", { text: token });
            }

            const referenceText = formatWebAnswerReferences(references);
            if (referenceText) {
              const suffix = `\n\n참고자료\n${referenceText}`;
              answer += suffix;
              send("delta", { text: suffix });
            }
          }
        } else if (plan.intent === "LOCAL") {
          send("status", { status: "searching-local" });
          const chunks = await hybridSearch(message, 8);
          const context = buildRagContext(chunks);
          sources = context.sources;
          confidence = calculateConfidence(chunks);
          send("sources", { sources, confidence });
          send("status", { status: "streaming" });
          for await (const token of streamChatWithAI(
            buildChatMessages(context.contextText, message),
            providerName
          )) {
            answer += token;
            send("delta", { text: token });
          }
          verification = verifyAnswer(answer, sources);
        } else {
          send("sources", { sources, confidence });
          send("status", { status: "streaming" });
          for await (const token of streamChatWithAI(
            buildGeneralChatMessages(message),
            providerName
          )) {
            answer += token;
            send("delta", { text: token });
          }
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

        send("done", {
          answer,
          sources,
          confidence,
          verification,
          sessionId: session.id
        });
      } catch (error) {
        send("error", { code: "GENERATION_FAILED", error: getReadableError(error) });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}

function getReadableError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Streaming 중단: AI 응답을 완료하지 못했습니다.";
}

function emptyVerification() {
  return {
    supportedClaims: [],
    weakClaims: [],
    unsupportedClaims: [],
    warning: null
  };
}
