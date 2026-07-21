import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { listSurveysForMember } from "@/src/lib/surveys/survey.service";
import { surveyErrorResponse } from "../survey-route-helpers";

// "내 설문" — surveys targeting the signed-in member across organizations.
// Shows only the member's own completion state; admins never see per-person
// status through any endpoint.
export async function GET(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    const surveys = await listSurveysForMember(owner.email);
    return NextResponse.json({ surveys });
  } catch (error) {
    return surveyErrorResponse(error);
  }
}
