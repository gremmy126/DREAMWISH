import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { buildAutomationAnalysis } from "@/src/lib/automation/automation-analysis";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  const analysis = await buildAutomationAnalysis(owner.uid);
  return NextResponse.json(
    { analysis },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
