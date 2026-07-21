import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  archiveSurvey,
  closeSurvey,
  getSurvey,
  getSurveyAdminStats,
  publishSurvey,
  updateSurveyDraft
} from "@/src/lib/surveys/survey.service";
import { surveyErrorResponse } from "../survey-route-helpers";

type RouteContext = { params: Promise<{ surveyId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const owner = await requireOwnerContext(request);
    const { surveyId } = await context.params;
    const survey = await getSurvey(owner.uid, surveyId);
    if (!survey || survey.status === "archived") {
      return NextResponse.json({ error: "설문을 찾을 수 없습니다." }, { status: 404 });
    }
    const stats = await getSurveyAdminStats(owner.uid, surveyId);
    return NextResponse.json({ survey, stats });
  } catch (error) {
    return surveyErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const owner = await requireOwnerContext(request);
    const { surveyId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown> & {
      action?: "publish" | "close";
    };
    if (body.action === "publish") {
      const survey = await publishSurvey(owner.uid, surveyId);
      return NextResponse.json({ survey });
    }
    if (body.action === "close") {
      const survey = await closeSurvey(owner.uid, surveyId);
      return NextResponse.json({ survey });
    }
    const survey = await updateSurveyDraft(owner.uid, surveyId, body as never);
    return NextResponse.json({ survey });
  } catch (error) {
    return surveyErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const owner = await requireOwnerContext(request);
    const { surveyId } = await context.params;
    await archiveSurvey(owner.uid, surveyId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return surveyErrorResponse(error);
  }
}
