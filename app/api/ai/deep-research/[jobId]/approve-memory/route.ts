import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { researchErrorResponse } from "@/src/lib/deep-research/research-api";
import { toResearchJobView } from "@/src/lib/deep-research/deep-research.types";
import { approveResearchMemory } from "@/src/lib/deep-research/research-memory";

type RouteContext = { params: Promise<{ jobId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const owner = await requireOwnerContext(request);
    const { jobId } = await context.params;
    const approved = await approveResearchMemory(owner.uid, jobId);
    return NextResponse.json({
      ok: true,
      data: {
        job: toResearchJobView(approved.job),
        memory: approved.saved
      }
    });
  } catch (error) {
    return researchErrorResponse(error);
  }
}
