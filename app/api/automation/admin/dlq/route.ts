import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { listDeadLetterJobs, reexecuteDeadLetterJob } from "@/src/lib/automation/queue/dlq.repository";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  if (owner.role !== "admin") return NextResponse.json({ ok: false, error: "Administrator access is required." }, { status: 403 });
  return NextResponse.json({ ok: true, jobs: await listDeadLetterJobs() });
}

export async function POST(request: Request) {
  assertSameOriginMutation(request);
  const owner = await requireOwnerContext(request);
  if (owner.role !== "admin") return NextResponse.json({ ok: false, error: "Administrator access is required." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as { jobId?: string };
  const source = (await listDeadLetterJobs(500)).find((job) => job.id === body.jobId);
  if (!source) return NextResponse.json({ ok: false, error: "Dead-letter job not found." }, { status: 404 });
  const result = await reexecuteDeadLetterJob({ source, actorId: owner.uid });
  return NextResponse.json({ ok: true, jobId: result.job.id, executionId: result.execution.id });
}
