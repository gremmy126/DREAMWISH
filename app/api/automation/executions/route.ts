import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { listExecutions } from "@/src/lib/automation/runtime/execution.repository";

export async function GET(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    return NextResponse.json({ ok: true, executions: await listExecutions(owner.uid) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Executions could not be loaded." }, { status: 400 });
  }
}
