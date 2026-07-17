import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  buildRunApprovalPreview
} from "@/src/lib/automation/run-approval";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

type Context = { params: Promise<{ runId: string }> };

/**
 * Approval flow for scheduled/manual runs with pending external sends:
 * POST {} → preview only (what exactly will be sent, nothing goes out);
 * POST { confirm: true } → executes the approved sends with owner tokens.
 */
export async function POST(request: Request, context: Context) {
  assertSameOriginMutation(request);
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

  return NextResponse.json({
    error: "이전 승인 실행 경로는 종료되었습니다. 승인 센터에서 영속 승인 요청을 처리해 주세요.",
    code: "LEGACY_APPROVAL_EXECUTION_DISABLED"
  }, { status: 410 });
}
