import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { generateSurveySummary } from "@/src/lib/surveys/survey-ai";
import {
  attachAiSummaryToSignal,
  computeAndStoreEmployeeSignal,
  getSurveyResults
} from "@/src/lib/surveys/survey.service";
import { surveyErrorResponse } from "../../survey-route-helpers";

type RouteContext = { params: Promise<{ surveyId: string }> };

// AI summary of anonymized aggregates + de-identified open answers. A summary
// failure returns aiFailed: true while statistics stay fully available.
export async function POST(request: Request, context: RouteContext) {
  try {
    const owner = await requireOwnerContext(request);
    const { surveyId } = await context.params;
    const results = await getSurveyResults(owner.uid, surveyId);
    if (results.locked) {
      return NextResponse.json(
        {
          error: "결과 공개 최소 인원을 아직 충족하지 못했습니다.",
          code: "RESULTS_PENDING",
          responseCount: results.responseCount,
          minimumResultCount: results.minimumResultCount
        },
        { status: 409 }
      );
    }

    await computeAndStoreEmployeeSignal(owner.uid, surveyId);
    const summary = await generateSurveySummary(results.aggregate, results.openAnswers);
    if (!summary) {
      return NextResponse.json({ aiFailed: true, summary: null });
    }
    const signal = await attachAiSummaryToSignal(owner.uid, surveyId, {
      generatedSummary: summary.summary,
      topSupportReasons: summary.top_support_reasons,
      topConcerns: summary.top_concerns,
      minorityViews: summary.minority_views
    });
    return NextResponse.json({ aiFailed: false, summary, signal });
  } catch (error) {
    return surveyErrorResponse(error);
  }
}
