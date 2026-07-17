import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { getExecutionDetail } from "@/src/lib/automation/runtime/execution.repository";
import { listExecutionEvents } from "@/src/lib/automation/runtime/event.repository";

type RouteContext = { params: Promise<{ executionId: string }> };
export async function GET(request: Request, context: RouteContext) {
  const owner = await requireOwnerContext(request);
  const { executionId } = await context.params;
  const detail = await getExecutionDetail(owner.uid, executionId);
  if (!detail) return NextResponse.json({ ok: false, error: "Execution not found." }, { status: 404 });
  return NextResponse.json({ ok: true, ...detail, events: await listExecutionEvents(owner.uid, executionId) });
}
