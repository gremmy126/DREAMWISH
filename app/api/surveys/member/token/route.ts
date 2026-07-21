import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { issueMemberToken } from "@/src/lib/surveys/survey.service";
import { surveyErrorResponse } from "../../survey-route-helpers";

// Verifies the signed-in member's eligibility and issues (or rotates) their
// anonymous response token. The token travels in the response body — never in
// a URL — and only its SHA-256 hash is stored server-side. This endpoint does
// not log tokens.
export async function POST(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    const body = (await request.json().catch(() => ({}))) as {
      organizationId?: string;
      surveyId?: string;
    };
    if (!body.organizationId || !body.surveyId) {
      return NextResponse.json({ error: "설문을 찾을 수 없습니다." }, { status: 404 });
    }
    const issued = await issueMemberToken(body.organizationId, body.surveyId, owner.email);
    return NextResponse.json(issued);
  } catch (error) {
    return surveyErrorResponse(error);
  }
}
