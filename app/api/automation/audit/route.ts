import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { listAutomationAuditEvents } from "@/src/lib/automation/runtime/audit.repository";

export async function GET(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    return NextResponse.json({ ok: true, events: await listAutomationAuditEvents(owner.uid) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Audit events could not be loaded." }, { status: 400 });
  }
}
