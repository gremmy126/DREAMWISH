import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { createSession } from "@/src/lib/db/repositories/chat.repository";
import {
  createDecision,
  listDecisions,
  updateDecision
} from "@/src/lib/decisions/decision.repository";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  const decisions = await listDecisions(owner.uid);
  return NextResponse.json({ decisions });
}

export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    objective?: string;
    problem?: Record<string, unknown>;
  };
  if (!body.title?.trim()) {
    return NextResponse.json({ error: "결정 제목을 입력하세요." }, { status: 400 });
  }
  let decision = await createDecision(owner.uid, {
    title: body.title,
    objective: body.objective,
    problem: body.problem as never
  });
  // 결정 분석 대화도 자유 대화처럼 대화 목록에 나타나도록 채팅 세션을 함께
  // 만들어 연결한다. 세션 생성 실패가 결정 생성을 막아서는 안 된다.
  try {
    const session = await createSession(
      owner.uid,
      `[결정분석] ${decision.title.slice(0, 80)}`
    );
    decision =
      (await updateDecision(owner.uid, decision.id, { chatSessionId: session.id })) ||
      decision;
  } catch {
    // Best-effort: the decision still works without a mirrored session.
  }
  return NextResponse.json({ decision }, { status: 201 });
}
