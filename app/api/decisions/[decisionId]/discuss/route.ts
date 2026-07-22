import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  discussDecision,
  type DecisionDiscussionMessage
} from "@/src/lib/decisions/decision-discussion";
import { getDecision } from "@/src/lib/decisions/decision.repository";
import { getSignalForDecision } from "@/src/lib/surveys/survey.service";

type RouteContext = { params: Promise<{ decisionId: string }> };

// Follow-up Q&A for an already-analysed decision. Keeps the conversation in the
// decision workspace (grounded in its research/simulation/conclusion) instead
// of handing the user off to free chat.
export async function POST(request: Request, context: RouteContext) {
  const owner = await requireOwnerContext(request);
  const { decisionId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as {
    question?: unknown;
    history?: unknown;
  };
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ error: "질문을 입력해주세요." }, { status: 400 });
  }

  const decision = await getDecision(owner.uid, decisionId);
  if (!decision) {
    return NextResponse.json({ error: "결정을 찾을 수 없습니다." }, { status: 404 });
  }

  const history: DecisionDiscussionMessage[] = Array.isArray(body.history)
    ? body.history
        .filter(
          (item): item is { role: unknown; text: unknown } =>
            Boolean(item) && typeof item === "object"
        )
        .map<DecisionDiscussionMessage>((item) => ({
          role: item.role === "ai" ? "ai" : "user",
          text: typeof item.text === "string" ? item.text : ""
        }))
        .filter((item) => item.text.trim())
    : [];

  const signal = await getSignalForDecision(owner.uid, decisionId);
  const answer = await discussDecision(decision, signal, question, history);
  return NextResponse.json({ answer });
}
