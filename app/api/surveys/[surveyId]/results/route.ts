import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  computeAndStoreEmployeeSignal,
  getSurveyResults
} from "@/src/lib/surveys/survey.service";
import { surveyErrorResponse } from "../../survey-route-helpers";

type RouteContext = { params: Promise<{ surveyId: string }> };

// Aggregated results only. Individual responses are never addressable through
// any API; below the minimum-result threshold this returns the waiting state
// with counts only.
export async function GET(request: Request, context: RouteContext) {
  try {
    const owner = await requireOwnerContext(request);
    const { surveyId } = await context.params;
    const results = await getSurveyResults(owner.uid, surveyId);
    if (!results.locked) {
      await computeAndStoreEmployeeSignal(owner.uid, surveyId);
    }
    return NextResponse.json({ results });
  } catch (error) {
    return surveyErrorResponse(error);
  }
}
