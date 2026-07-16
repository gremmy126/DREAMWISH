import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  archiveSession,
  ensureSession
} from "@/src/lib/db/repositories/chat.repository";
import {
  createResearchJob,
  listResearchJobs
} from "@/src/lib/deep-research/deep-research.repository";
import { researchErrorResponse } from "@/src/lib/deep-research/research-api";
import { toResearchJobView, type ResearchSettings } from "@/src/lib/deep-research/deep-research.types";
import { resolveResearchSettings } from "@/src/lib/deep-research/research-budget";
import {
  recoverOrphanedResearchJobs,
  startResearchWorker
} from "@/src/lib/deep-research/research-worker";

export async function POST(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    const body = (await request.json().catch(() => ({}))) as {
      query?: unknown;
      chatSessionId?: unknown;
      settings?: unknown;
    };
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const chatSessionId =
      typeof body.chatSessionId === "string" && body.chatSessionId.trim()
        ? body.chatSessionId.trim().slice(0, 100)
        : null;
    const settings = resolveResearchSettings(
      typeof body.settings === "object" && body.settings !== null
        ? (body.settings as Partial<ResearchSettings>)
        : undefined
    );

    await recoverOrphanedResearchJobs();
    const session = await ensureSession(owner.uid, chatSessionId || undefined, query);
    let job;
    try {
      job = await createResearchJob({
        ownerId: owner.uid,
        chatSessionId: session.id,
        query,
        settings
      });
    } catch (error) {
      if (!chatSessionId) await archiveSession(owner.uid, session.id);
      throw error;
    }
    startResearchWorker(owner.uid, job.id);
    return NextResponse.json(
      { ok: true, data: { job: toResearchJobView(job), session } },
      { status: 202 }
    );
  } catch (error) {
    return researchErrorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    const url = new URL(request.url);
    await recoverOrphanedResearchJobs();
    const jobs = await listResearchJobs(owner.uid, {
      limit: Number(url.searchParams.get("limit")) || 10,
      chatSessionId: url.searchParams.get("sessionId") || undefined
    });
    return NextResponse.json(
      { ok: true, data: { jobs: jobs.map(toResearchJobView) } },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    return researchErrorResponse(error);
  }
}
