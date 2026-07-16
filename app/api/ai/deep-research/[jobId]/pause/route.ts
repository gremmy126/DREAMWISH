import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { requestResearchPause } from "@/src/lib/deep-research/deep-research.repository";
import { researchErrorResponse } from "@/src/lib/deep-research/research-api";
import { toResearchJobView } from "@/src/lib/deep-research/deep-research.types";

type RouteContext = { params: Promise<{ jobId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const owner = await requireOwnerContext(request);
    const { jobId } = await context.params;
    const job = await requestResearchPause(owner.uid, jobId);
    if (!job) {
      return NextResponse.json(
        { ok: false, error: { code: "RESEARCH_NOT_FOUND", message: "조사를 찾을 수 없습니다." } },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, data: { job: toResearchJobView(job) } });
  } catch (error) {
    return researchErrorResponse(error);
  }
}
