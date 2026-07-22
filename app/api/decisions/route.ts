import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  createDecision,
  listDecisions
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
  // 결정 분석 대화는 결정 기록에만 저장된다. 자유 채팅 세션을 만들거나
  // 연결하지 않아 자유 대화 목록과 완전히 분리된다.
  const decision = await createDecision(owner.uid, {
    title: body.title,
    objective: body.objective,
    problem: body.problem as never
  });
  return NextResponse.json({ decision }, { status: 201 });
}
