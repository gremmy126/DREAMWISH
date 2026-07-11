import { streamChatWithAI } from "@/src/lib/ai/ai.service";
import { apiFailure } from "@/src/lib/api/api-response";
import { parseJsonRequestBody } from "@/src/lib/api/json-request";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { parseProviderName } from "@/src/lib/ai/provider-options";
import { buildContextAwareChatMessages } from "@/src/lib/ai/prompts";
import { getChatExecutionPlan, getWebSearchQuery } from "@/src/lib/ai/question-classifier";
import {
  type AnswerConfidence,
  type AnswerVerification,
  type SourceDocument
} from "@/src/lib/chat/chat.types";
import {
  buildWebAnswerMessages,
  buildWebAnswerReferences,
  createInsufficientWebAnswer,
  formatWebAnswerReferences,
  selectWebAnswerContext
} from "@/src/lib/ai/web-answer";
import { toClientAIError } from "@/src/lib/ai/errors";
import { emptyAnswerVerification } from "@/src/lib/ai/graph/chat-state";
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
  const owner = await requireOwnerContext(request);
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
    const failure = apiFailure(400, "EMPTY_MESSAGE", "Message is required.");
    return Response.json({ ok: false, error: failure.error }, { status: failure.status });
  }

  if (message.length > 4000) {
    const failure = apiFailure(413, "INVALID_REQUEST", "Message is too long.");
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
        const session = await ensureSession(owner.uid, sessionId, message);
        send("session", { sessionId: session.id, session });
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
          send("sources", { sources: [], confidence });
          send("delta", { text: answer });
          await saveAssistantExchange(
            owner.uid,
            session.id,
            message,
            answer,
            [],
            confidence,
            verification
          );
          send("done", { answer, sources: [], confidence, verification, sessionId: session.id });
          return;
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

        send("status", { status: "generating" });

        if (plan.intent === "WEB") {
          send("status", { status: "searching-web" });
          const webResults = await searchWeb(getWebSearchQuery(message));
          const webContext = selectWebAnswerContext(message, webResults);
          const references = buildWebAnswerReferences(webContext);
          confidence = {
            level: references.length > 0 ? "medium" : "none",
            score: references.length > 0 ? 0.72 : 0,
            reason: references.length > 0 ? "Web search context was used." : "No web context was found."
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
        } else {
          if (plan.intent === "LOCAL") send("status", { status: "searching-local" });
          const chunks = plan.intent === "LOCAL" ? await hybridSearch(message, 8) : [];
          const context = buildRagContext(chunks);
          sources = context.sources;
          confidence =
            plan.intent === "LOCAL"
              ? calculateConfidence(chunks)
              : confidence;
          send("sources", { sources, confidence });
          send("status", { status: "streaming" });
          for await (const token of streamChatWithAI(
            buildContextAwareChatMessages({
              question: message,
              contextText: context.contextText,
              contextAvailable: context.sources.length > 0
            }),
            providerName
          )) {
            answer += token;
            send("delta", { text: token });
          }
          verification =
            context.sources.length > 0 ? verifyAnswer(answer, sources) : emptyAnswerVerification();
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
        send("done", { answer, sources, confidence, verification, sessionId: session.id });
      } catch (error) {
        send("error", toClientAIError(error));
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
