import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { listAutomationRuns } from "@/src/lib/automation/run.repository";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  const url = new URL(request.url);
  const runs = await listAutomationRuns(owner.uid, {
    scenarioId: url.searchParams.get("scenarioId") || undefined,
    limit: Number(url.searchParams.get("limit")) || 30
  });
  return NextResponse.json({ runs });
}
