import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { rejectPendingApproval } from "@/src/lib/automation/approval/approval.service";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

type RouteContext = { params: Promise<{ requestId: string }> };
export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOriginMutation(request);
    const owner = await requireOwnerContext(request);
    const { requestId } = await context.params;
    return NextResponse.json({ ok: true, approval: await rejectPendingApproval({ ownerId: owner.uid, requestId, actorId: owner.uid }) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Approval could not be rejected." }, { status: 400 });
  }
}
