import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { assembleDecisionBrief } from "@/src/lib/decisions/decision-brief";
import { getDecision } from "@/src/lib/decisions/decision.repository";
import { getSignalForDecision } from "@/src/lib/surveys/survey.service";

type RouteContext = { params: Promise<{ decisionId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const owner = await requireOwnerContext(request);
  const { decisionId } = await context.params;
  const decision = await getDecision(owner.uid, decisionId);
  if (!decision) {
    return NextResponse.json({ error: "결정을 찾을 수 없습니다." }, { status: 404 });
  }
  const signal = await getSignalForDecision(owner.uid, decisionId);
  const brief = assembleDecisionBrief(decision, signal);
  return NextResponse.json({ brief });
}
