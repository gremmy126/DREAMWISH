import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { replaceApprovalAfterInputEdit } from "@/src/lib/automation/approval/approval.service";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

type RouteContext = { params: Promise<{ requestId: string }> };
export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOriginMutation(request);
    const owner = await requireOwnerContext(request);
    const { requestId } = await context.params;
    const body = await request.json().catch(() => ({})) as { input?: unknown };
    if (!body.input || typeof body.input !== "object" || Array.isArray(body.input)) {
      return NextResponse.json({ ok: false, error: "A valid input object is required." }, { status: 400 });
    }
    const approval = await replaceApprovalAfterInputEdit({ ownerId: owner.uid, requestId, actorId: owner.uid, newInput: body.input as Record<string, unknown> });
    return NextResponse.json({ ok: true, approval });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Input could not be updated." }, { status: 400 });
  }
}
