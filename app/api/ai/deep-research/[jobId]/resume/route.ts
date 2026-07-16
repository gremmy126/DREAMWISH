import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { getResearchJob } from "@/src/lib/deep-research/deep-research.repository";
import { researchErrorResponse } from "@/src/lib/deep-research/research-api";
import { toResearchJobView } from "@/src/lib/deep-research/deep-research.types";
import { resumeResearchWorker } from "@/src/lib/deep-research/research-worker";

type RouteContext = { params: Promise<{ jobId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const owner = await requireOwnerContext(request);
    const { jobId } = await context.params;
    const existing = await getResearchJob(owner.uid, jobId);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: { code: "RESEARCH_NOT_FOUND", message: "조사를 찾을 수 없습니다." } },
        { status: 404 }
      );
    }
    await resumeResearchWorker(owner.uid, jobId);
    const job = await getResearchJob(owner.uid, jobId);
    return NextResponse.json({
      ok: true,
      data: { job: job ? toResearchJobView(job) : toResearchJobView(existing) }
    });
  } catch (error) {
    return researchErrorResponse(error);
  }
}
