import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  submitSurveyResponse,
  type SurveyAnswerInput
} from "@/src/lib/surveys/survey.service";
import { surveyErrorResponse } from "../../survey-route-helpers";

// Anonymous submission endpoint. The token and answers arrive in the POST
// body (never URL parameters) and are never written to application logs. The
// service stores no user id, email, invite id, IP address, or user agent with
// the response; submission runs as a single transaction and a failed save
// leaves the token unredeemed.
export async function POST(request: Request) {
  try {
    await requireOwnerContext(request);
    const body = (await request.json().catch(() => ({}))) as {
      organizationId?: string;
      surveyId?: string;
      token?: string;
      answers?: SurveyAnswerInput[];
    };
    if (!body.organizationId || !body.surveyId) {
      return NextResponse.json({ error: "설문을 찾을 수 없습니다." }, { status: 404 });
    }
    const result = await submitSurveyResponse(
      body.organizationId,
      body.surveyId,
      String(body.token || ""),
      Array.isArray(body.answers) ? body.answers : []
    );
    return NextResponse.json({ ok: true, responseId: result.responseId });
  } catch (error) {
    return surveyErrorResponse(error);
  }
}
