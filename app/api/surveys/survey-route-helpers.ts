import { NextResponse } from "next/server";
import { SurveyError } from "@/src/lib/surveys/survey.service";

export function surveyErrorResponse(error: unknown): NextResponse {
  if (error instanceof SurveyError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  }
  // Deliberately generic: submission bodies and tokens must never leak into
  // logs or error payloads.
  return NextResponse.json(
    { error: "요청을 처리하지 못했습니다.", code: "SURVEY_REQUEST_FAILED" },
    { status: 500 }
  );
}
