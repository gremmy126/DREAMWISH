import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
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
  // 결정 분석 대화는 결정 기록에만 저장한다. 자유 채팅 세션 미러링은 하지
  // 않아 결정 분석 내용이 자유 대화 목록에 나타나지 않는다.
  return NextResponse.json({ decision });
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
