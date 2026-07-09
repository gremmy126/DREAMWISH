import { NextResponse } from "next/server";
import { chatWithAI } from "@/src/lib/ai/ai.service";
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
  try {
    const body = await request.json();
    const message = String(body.message || "").trim();
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
    const useRag = body.useRag !== false;
    const providerName = parseProviderName(body.model || body.provider);

    if (!message) {
      return NextResponse.json({ error: "질문을 입력해주세요." }, { status: 400 });
    }

    if (message.length > 4000) {
      return NextResponse.json(
        { error: "질문이 너무 깁니다. 4000자 이하로 줄여주세요." },
        { status: 400 }
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
      return NextResponse.json({
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
      });
    }

    const chunks = useRag ? await hybridSearch(message, 8) : [];
    const context = buildRagContext(chunks);
    const confidence = calculateConfidence(chunks);

    const answer =
      useRag && chunks.length === 0
        ? UNKNOWN_ANSWER
        : await chatWithAI(
            useRag
              ? buildChatMessages(context.contextText, message)
              : buildGeneralChatMessages(message),
            providerName
          );

    const verification = verifyAnswer(answer, context.sources);

    await addMessage({
      sessionId: session.id,
      role: "assistant",
      content: answer,
      sources: context.sources,
      confidence,
      verification
    });

    return NextResponse.json({
      answer,
      sources: context.sources,
      confidence,
      verification,
      sessionId: session.id
    });
  } catch (error) {
    return NextResponse.json(
      { error: getReadableError(error) },
      { status: 500 }
    );
  }
}

function getReadableError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "AI 채팅 처리 중 알 수 없는 오류가 발생했습니다.";
}
