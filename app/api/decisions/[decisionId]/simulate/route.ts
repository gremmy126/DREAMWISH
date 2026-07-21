import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { simulateDecision } from "@/src/lib/decisions/decision-simulation";
import { getDecision, updateDecision } from "@/src/lib/decisions/decision.repository";
import { getSignalForDecision } from "@/src/lib/surveys/survey.service";

type RouteContext = { params: Promise<{ decisionId: string }> };

// Runs the deterministic simulation and stores the result on the decision.
export async function POST(request: Request, context: RouteContext) {
  const owner = await requireOwnerContext(request);
  const { decisionId } = await context.params;
  const decision = await getDecision(owner.uid, decisionId);
  if (!decision) {
    return NextResponse.json({ error: "결정을 찾을 수 없습니다." }, { status: 404 });
  }
  const signal = await getSignalForDecision(owner.uid, decisionId);
  const { alternatives, result } = simulateDecision(decision, signal);
  const updated = await updateDecision(owner.uid, decisionId, {
    alternatives,
    simulationResult: result
  });
  return NextResponse.json({ decision: updated, simulation: result });
}
