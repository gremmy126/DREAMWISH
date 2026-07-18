import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { getExecutionDetail } from "@/src/lib/automation/runtime/execution.repository";
import { listExecutionEvents } from "@/src/lib/automation/runtime/event.repository";
import { getExecutionDiagnosticViews } from "@/src/lib/automation/runtime/execution-diagnosis.service";

type RouteContext = { params: Promise<{ executionId: string }> };
export async function GET(request: Request, context: RouteContext) {
  const owner = await requireOwnerContext(request);
  const { executionId } = await context.params;
  const detail = await getExecutionDetail(owner.uid, executionId);
  if (!detail) return NextResponse.json({ ok: false, error: "Execution not found." }, { status: 404 });
  const diagnostics = await getExecutionDiagnosticViews(owner.uid, [detail.execution], owner.role === "admin");
  const diagnostic = diagnostics.get(executionId)!;
  return NextResponse.json({
    ok: true,
    ...detail,
    diagnosis: diagnostic.diagnosis,
    queuePosition: diagnostic.queue.position,
    nextRunAt: diagnostic.queue.nextRunAt,
    events: await listExecutionEvents(owner.uid, executionId)
  });
}
