import { streamChatWithAI } from "@/src/lib/ai/ai.service";
import { parseProviderName } from "@/src/lib/ai/provider-options";
import { buildChatMessages, buildGeneralChatMessages } from "@/src/lib/ai/prompts";
import { addMessage, ensureSession } from "@/src/lib/db/repositories/chat.repository";
import {
  checkDocumentQuality,
  formatQualityReport,
  isQualityCommand
} from "@/src/lib/quality/document-quality.service";
import { buildRagContext } from "@/src/lib/rag/context-builder";
import { calculateConfidence } from "@/src/lib/rag/confidence";
import { hybridSearch } from "@/src/lib/rag/rag.service";
import { verifyAnswer } from "@/src/lib/rag/verification";

const UNKNOWN_ANSWER = "현재 로컬 문서 안에서는 이 내용을 확인할 수 없습니다.";

export async function POST(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        const body = await request.json();
        const message = String(body.message || "").trim();
        const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
        const useRag = body.useRag !== false;
        const providerName = parseProviderName(body.model || body.provider);

        if (!message) {
          send("error", { error: "질문을 입력해주세요." });
          controller.close();
          return;
        }

        if (message.length > 4000) {
          send("error", { error: "질문이 너무 깁니다. 4000자 이하로 줄여주세요." });
          controller.close();
          return;
        }

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
          send("done", {
            answer,
            sources: [],
            confidence,
            verification,
            sessionId: session.id
          });
          return;
        }

        const chunks = useRag ? await hybridSearch(message, 8) : [];
        const context = buildRagContext(chunks);
        const confidence = calculateConfidence(chunks);
        send("sources", { sources: context.sources, confidence });

        let answer = "";

        if (useRag && chunks.length === 0) {
          answer = UNKNOWN_ANSWER;
          send("delta", { text: answer });
        } else {
          for await (const token of streamChatWithAI(
            useRag
              ? buildChatMessages(context.contextText, message)
              : buildGeneralChatMessages(message),
            providerName
          )) {
            answer += token;
            send("delta", { text: token });
          }
        }

        const verification = verifyAnswer(answer, context.sources);

        await addMessage({
          sessionId: session.id,
          role: "assistant",
          content: answer,
          sources: context.sources,
          confidence,
          verification
        });

        send("done", {
          answer,
          sources: context.sources,
          confidence,
          verification,
          sessionId: session.id
        });
      } catch (error) {
        send("error", { error: getReadableError(error) });
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
