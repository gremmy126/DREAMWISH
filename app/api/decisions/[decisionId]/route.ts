import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  addMessage,
  getSession
} from "@/src/lib/db/repositories/chat.repository";
import {
  deleteDecision,
  getDecision,
  updateDecision
} from "@/src/lib/decisions/decision.repository";
import type { Decision } from "@/src/lib/decisions/decision.types";
import { listSurveysForDecision } from "@/src/lib/surveys/survey.service";

type RouteContext = { params: Promise<{ decisionId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const owner = await requireOwnerContext(request);
  const { decisionId } = await context.params;
  const decision = await getDecision(owner.uid, decisionId);
  if (!decision) {
    return NextResponse.json({ error: "결정을 찾을 수 없습니다." }, { status: 404 });
  }
  const surveys = await listSurveysForDecision(owner.uid, decisionId);
  return NextResponse.json({ decision, surveys });
}

export async function PATCH(request: Request, context: RouteContext) {
  const owner = await requireOwnerContext(request);
  const { decisionId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as Partial<Decision>;
  const decision = await updateDecision(owner.uid, decisionId, body);
  if (!decision) {
    return NextResponse.json({ error: "결정을 찾을 수 없습니다." }, { status: 404 });
  }
  if (Array.isArray(body.conversation) && decision.chatSessionId) {
    await mirrorConversationToChatSession(owner.uid, decision);
  }
  return NextResponse.json({ decision });
}

// 결정 분석 대화를 연결된 채팅 세션에 미러링해 자유 대화 목록에서도 기록을
// 볼 수 있게 한다. 대화는 사실상 append-only이므로 저장된 것 이후만 추가한다.
async function mirrorConversationToChatSession(ownerId: string, decision: Decision) {
  try {
    const sessionId = decision.chatSessionId;
    if (!sessionId) return;
    const detail = await getSession(ownerId, sessionId);
    if (!detail) return;
    const pending = decision.conversation.slice(detail.messages.length);
    for (const message of pending) {
      await addMessage({
        ownerId,
        sessionId,
        role: message.role === "ai" ? "assistant" : "user",
        content: message.text
      });
    }
  } catch {
    // Mirroring is best-effort; the decision record remains authoritative.
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const owner = await requireOwnerContext(request);
  const { decisionId } = await context.params;
  const deleted = await deleteDecision(owner.uid, decisionId);
  if (!deleted) {
    return NextResponse.json({ error: "결정을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
