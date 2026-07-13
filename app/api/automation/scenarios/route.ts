import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { buildScenarioFromPrompt, type AutomationScenario } from "@/src/lib/automation/scenario-designer";
import { listScenarios, saveScenario } from "@/src/lib/automation/scenario.repository";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  return NextResponse.json({ scenarios: await listScenarios(owner.uid) });
}

export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as { prompt?: string; scenario?: AutomationScenario };
  const draft = body.scenario
    ? { ...body.scenario, ownerId: owner.uid, status: body.scenario.status || "draft" as const }
    : buildScenarioFromPrompt(body.prompt || "새 자동화 시나리오", owner.uid);
  const scenario = await saveScenario(owner.uid, draft);
  return NextResponse.json({ scenario }, { status: 201 });
}
