import { NextResponse } from "next/server";
import { OwnerContextError } from "../auth/owner-context";
import { ResearchJobError } from "./deep-research.repository";

export function researchErrorResponse(error: unknown) {
  if (error instanceof OwnerContextError) {
    return NextResponse.json(
      { ok: false, error: { code: error.code, message: error.message } },
      { status: error.status }
    );
  }
  if (error instanceof ResearchJobError) {
    return NextResponse.json(
      { ok: false, error: { code: error.code, message: error.message } },
      { status: error.status }
    );
  }
  return NextResponse.json(
    {
      ok: false,
      error: { code: "INTERNAL_SERVER_ERROR", message: "심층 조사 요청이 실패했습니다." }
    },
    { status: 500 }
  );
}
