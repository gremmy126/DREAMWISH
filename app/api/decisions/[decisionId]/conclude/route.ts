import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  concludeDecision,
  conclusionToRecommendation
} from "@/src/lib/decisions/decision-conclusion";
import { getDecision, updateDecision } from "@/src/lib/decisions/decision.repository";
import { getSignalForDecision } from "@/src/lib/surveys/survey.service";

type RouteContext = { params: Promise<{ decisionId: string }> };

// Produces the final conclusion (1–2 sentence core + counterpoint outcomes).
// Falls back to the deterministic conclusion when the AI provider fails, so
// the report always completes.
export async function POST(request: Request, context: RouteContext) {
  const owner = await requireOwnerContext(request);
  const { decisionId } = await context.params;
  const decision = await getDecision(owner.uid, decisionId);
  if (!decision) {
    return NextResponse.json({ error: "결정을 찾을 수 없습니다." }, { status: 404 });
  }
  const signal = await getSignalForDecision(owner.uid, decisionId);
  const conclusion = await concludeDecision(decision, signal);
  const updated = await updateDecision(owner.uid, decisionId, {
    status: "deciding",
    recommendation: conclusionToRecommendation(conclusion)
  });
  return NextResponse.json({ decision: updated, conclusion, signal });
}
