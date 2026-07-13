import { streamChatWithAI } from "@/src/lib/ai/ai.service";
import { createExecutionPreview } from "@/src/lib/agent/approval";
import { planAgentExecution } from "@/src/lib/agent/planner";
import { apiFailure } from "@/src/lib/api/api-response";
import { parseJsonRequestBody } from "@/src/lib/api/json-request";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { parseProviderName } from "@/src/lib/ai/provider-options";
import {
  appendApprovedMemoryToMessages,
  buildContextAwareChatMessages,
  buildModeChatMessages
} from "@/src/lib/ai/prompts";
import { getChatExecutionPlan, getWebSearchQuery } from "@/src/lib/ai/question-classifier";
import {
  type AnswerConfidence,
  type AnswerVerification,
  type ChatMessageRecord,
  type SourceDocument
} from "@/src/lib/chat/chat.types";
import { parseChatMode } from "@/src/lib/chat/chat-mode-policy";
import {
  buildWebAnswerMessages,
  buildWebAnswerReferences,
  formatWebAnswerReferences,
  selectWebAnswerContext
} from "@/src/lib/ai/web-answer";
import { toClientAIError } from "@/src/lib/ai/errors";
import { emptyAnswerVerification } from "@/src/lib/ai/graph/chat-state";
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
import { buildRagContext } from "@/src/lib/rag/context-builder";
import { calculateConfidence } from "@/src/lib/rag/confidence";
import { hybridSearch } from "@/src/lib/rag/rag.service";
import { verifyAnswer } from "@/src/lib/rag/verification";
import {
  buildUnverifiedWebFallbackMessages,
  searchWebSafely
} from "@/src/lib/web-search/web-search-outcome";

type ChatRequestBody = {
  message?: unknown;
  sessionId?: unknown;
  model?: unknown;
  provider?: unknown;
  mode?: unknown;
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
  let session: Awaited<ReturnType<typeof ensureSession>>;
  try {
    if (
      Object.prototype.hasOwnProperty.call(body, "sessionId") &&
      typeof body.sessionId !== "string"
    ) {
      throw new ChatSessionNotFoundError();
    }
    session = await ensureSession(owner.uid, sessionId, message);
  } catch (error) {
    if (error instanceof ChatSessionNotFoundError) {
      return Response.json(
        { ok: false, error: toClientAIError(error) },
        { status: error.status }
      );
    }
    throw error;
  }

  const providerName = parseProviderName(body.model || body.provider);
  const mode = parseChatMode(body.mode);
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
        send("session", { sessionId: session.id, session });
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

        if (mode !== "ask") {
          send("status", { status: "generating" });
          const executionPlan = await planAgentExecution(message);
          const executionPreview = createExecutionPreview(executionPlan);
          const chunks = await hybridSearch(message, 8);
          const context = buildRagContext(chunks);
          const sources = mergeSources(context.sources, memoryContext.sources);
          const confidence = calculateConfidence(chunks);
          const messages = buildModeChatMessages({
            mode,
            question: message,
            contextText: context.contextText,
            memoryContextText: memoryContext.contextText,
            executionPreviewText: formatExecutionPreview(executionPreview)
          });

          send("sources", { sources, confidence });
          send("status", { status: "streaming" });
          let answer = "";
          for await (const token of streamChatWithAI(messages, providerName)) {
            answer += token;
            send("delta", { text: token });
          }

          const verification =
            context.sources.length > 0
              ? verifyAnswer(answer, context.sources)
              : emptyAnswerVerification();

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
          send("done", {
            answer,
            sources,
            confidence,
            verification,
            sessionId: session.id,
            memoryStatus: capture?.status || memoryContext.status,
            memoryCandidates: summarizeCandidates(capture?.candidates || [])
          });
          return;
        }

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
          send("done", {
            answer,
            sources: memoryContext.sources,
            confidence,
            verification,
            sessionId: session.id,
            memoryStatus: capture?.status || memoryContext.status,
            memoryCandidates: summarizeCandidates(capture?.candidates || [])
          });
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
          const webOutcome = await searchWebSafely(getWebSearchQuery(message));
          const webContext = selectWebAnswerContext(message, webOutcome.results);
          const references = buildWebAnswerReferences(webContext);
          confidence = {
            level: references.length > 0 ? "medium" : "none",
            score: references.length > 0 ? 0.72 : 0,
            reason: references.length > 0 ? "Web search context was used." : "No web context was found."
          };
          send("sources", { sources, confidence });

          if (webContext.length === 0) {
            verification = {
              ...verification,
              warning: webOutcome.warning || "Live web sources could not be verified."
            };
            send("status", { status: "streaming" });
            for await (const token of streamChatWithAI(
              appendApprovedMemoryToMessages(
                buildUnverifiedWebFallbackMessages(
                  message,
                  webOutcome.warning || "No usable live web sources were found."
                ),
                memoryContext.contextText
              ),
              providerName
            )) {
              answer += token;
              send("delta", { text: token });
            }
          } else {
            send("status", { status: "streaming" });
            for await (const token of streamChatWithAI(
              appendApprovedMemoryToMessages(
                buildWebAnswerMessages(message, webContext),
                memoryContext.contextText
              ),
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
              contextAvailable: context.sources.length > 0,
              memoryContextText: memoryContext.contextText
            }),
            providerName
          )) {
            answer += token;
            send("delta", { text: token });
          }
          verification =
            context.sources.length > 0 ? verifyAnswer(answer, sources) : emptyAnswerVerification();
        }
        sources = mergeSources(sources, memoryContext.sources);

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
        send("done", {
          answer,
          sources,
          confidence,
          verification,
          sessionId: session.id,
          memoryStatus: capture?.status || memoryContext.status,
          memoryCandidates: summarizeCandidates(capture?.candidates || [])
        });
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

function formatExecutionPreview(preview: ReturnType<typeof createExecutionPreview>) {
  return [
    `목표: ${preview.goal}`,
    `위험도: ${preview.risk}`,
    ...preview.steps.map(
      (step) =>
        `${step.order}. ${step.title}: ${step.description}${
          step.requiresApproval ? " (사용자 승인 필요)" : ""
        }`
    )
  ].join("\n");
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
