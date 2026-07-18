import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { listExecutions } from "@/src/lib/automation/runtime/execution.repository";
import { getExecutionDiagnosticViews } from "@/src/lib/automation/runtime/execution-diagnosis.service";

export async function GET(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    const executions = await listExecutions(owner.uid);
    const diagnostics = await getExecutionDiagnosticViews(owner.uid, executions, owner.role === "admin");
    return NextResponse.json({
      ok: true,
      executions: executions.map((execution) => {
        const diagnostic = diagnostics.get(execution.id)!;
        return {
          ...execution,
          diagnosis: diagnostic.diagnosis,
          queuePosition: diagnostic.queue.position,
          nextRunAt: diagnostic.queue.nextRunAt
        };
      })
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Executions could not be loaded." }, { status: 400 });
  }
}
