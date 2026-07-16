import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  deleteResearchJob,
  getResearchJob
} from "@/src/lib/deep-research/deep-research.repository";
import { researchErrorResponse } from "@/src/lib/deep-research/research-api";
import { toResearchJobView } from "@/src/lib/deep-research/deep-research.types";
import { recoverOrphanedResearchJobs } from "@/src/lib/deep-research/research-worker";

type RouteContext = { params: Promise<{ jobId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const owner = await requireOwnerContext(request);
    const { jobId } = await context.params;
    await recoverOrphanedResearchJobs();
    const job = await getResearchJob(owner.uid, jobId);
    if (!job) return notFound();
    return NextResponse.json(
      { ok: true, data: { job: toResearchJobView(job) } },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return researchErrorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const owner = await requireOwnerContext(request);
    const { jobId } = await context.params;
    const deleted = await deleteResearchJob(owner.uid, jobId);
    if (!deleted) return notFound();
    return NextResponse.json({ ok: true, data: { deleted: true } });
  } catch (error) {
    return researchErrorResponse(error);
  }
}

function notFound() {
  return NextResponse.json(
    { ok: false, error: { code: "RESEARCH_NOT_FOUND", message: "조사를 찾을 수 없습니다." } },
    { status: 404 }
  );
}
