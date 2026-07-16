import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  approveAndExecuteRun,
  buildRunApprovalPreview
} from "@/src/lib/automation/run-approval";

type Context = { params: Promise<{ runId: string }> };

/**
 * Approval flow for scheduled/manual runs with pending external sends:
 * POST {} → preview only (what exactly will be sent, nothing goes out);
 * POST { confirm: true } → executes the approved sends with owner tokens.
 */
export async function POST(request: Request, context: Context) {
  const owner = await requireOwnerContext(request);
  const { runId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { confirm?: boolean };

  if (body.confirm !== true) {
    const preview = await buildRunApprovalPreview(owner.uid, runId);
    if (!preview) {
      return NextResponse.json({ error: "실행 기록을 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ preview });
  }

  const run = await approveAndExecuteRun(owner.uid, runId);
  if (!run) {
    return NextResponse.json({ error: "실행 기록을 찾을 수 없습니다." }, { status: 404 });
  }
  return NextResponse.json({ run });
}
