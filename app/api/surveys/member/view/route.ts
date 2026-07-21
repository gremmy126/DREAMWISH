import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { getSurveyForMember } from "@/src/lib/surveys/survey.service";
import { surveyErrorResponse } from "../../survey-route-helpers";

// Member-facing survey view: questions only, no target list, no invites.
export async function GET(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId") || "";
    const surveyId = url.searchParams.get("surveyId") || "";
    if (!organizationId || !surveyId) {
      return NextResponse.json({ error: "설문을 찾을 수 없습니다." }, { status: 404 });
    }
    const survey = await getSurveyForMember(organizationId, surveyId, owner.email);
    return NextResponse.json({ survey });
  } catch (error) {
    return surveyErrorResponse(error);
  }
}
