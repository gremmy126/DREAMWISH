import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { getDecision } from "@/src/lib/decisions/decision.repository";
import { generateSurveyDraft } from "@/src/lib/surveys/survey-ai";
import { getSurvey, updateSurveyDraft } from "@/src/lib/surveys/survey.service";
import { surveyErrorResponse } from "../../survey-route-helpers";

type RouteContext = { params: Promise<{ surveyId: string }> };

// Generates an AI question draft for a draft survey. The draft is stored on
// the survey but never published automatically: the administrator reviews it
// and publishes explicitly via PATCH { action: "publish" }.
export async function POST(request: Request, context: RouteContext) {
  try {
    const owner = await requireOwnerContext(request);
    const { surveyId } = await context.params;
    const survey = await getSurvey(owner.uid, surveyId);
    if (!survey) {
      return NextResponse.json({ error: "설문을 찾을 수 없습니다." }, { status: 404 });
    }
    if (survey.status !== "draft") {
      return NextResponse.json(
        { error: "초안 상태의 설문만 AI 초안을 적용할 수 있습니다." },
        { status: 409 }
      );
    }
    const decision = survey.decisionId
      ? await getDecision(owner.uid, survey.decisionId)
      : null;
    const draft = await generateSurveyDraft(decision);
    const updated = await updateSurveyDraft(owner.uid, surveyId, {
      questions: draft.questions
    });
    return NextResponse.json({ survey: updated, source: draft.source });
  } catch (error) {
    return surveyErrorResponse(error);
  }
}
