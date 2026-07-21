import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  createSurvey,
  getSurveyAdminStats,
  listSurveys
} from "@/src/lib/surveys/survey.service";
import { surveyErrorResponse } from "./survey-route-helpers";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  const surveys = await listSurveys(owner.uid);
  const stats = await Promise.all(
    surveys.map((survey) => getSurveyAdminStats(owner.uid, survey.id))
  );
  return NextResponse.json({
    surveys: surveys.map((survey, index) => ({ ...survey, stats: stats[index] }))
  });
}

export async function POST(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const survey = await createSurvey(owner.uid, owner.uid, body as never);
    return NextResponse.json({ survey }, { status: 201 });
  } catch (error) {
    return surveyErrorResponse(error);
  }
}
