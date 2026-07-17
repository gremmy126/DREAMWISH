import { NextResponse } from "next/server";
import { requireAdminContext } from "@/src/lib/admin/admin-guard";
import {
  listDeadLetterJobs,
  reexecuteDeadLetterJob
} from "@/src/lib/automation/queue/dlq.repository";
import { maskSensitiveValue as maskSensitive } from "@/src/lib/automation/action-ui-model";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

export async function GET(request: Request) {
  await requireAdminContext(request);
  const jobs = (await listDeadLetterJobs()).map((job) => ({
    ...job,
    safePayload: maskSensitive(job.safePayload)
  }));
  return NextResponse.json({ ok: true, jobs });
}

export async function POST(request: Request) {
  assertSameOriginMutation(request);
  const owner = await requireAdminContext(request);
  const body = (await request.json().catch(() => ({}))) as { jobId?: string };
  const source = (await listDeadLetterJobs(500)).find((job) => job.id === body.jobId);
  if (!source) {
    return NextResponse.json({ ok: false, error: "Dead-letter job not found." }, { status: 404 });
  }
  const result = await reexecuteDeadLetterJob({ source, actorId: owner.uid });
  return NextResponse.json({ ok: true, jobId: result.job.id, executionId: result.execution.id });
}
