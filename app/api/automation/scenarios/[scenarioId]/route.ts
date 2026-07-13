import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import type { AutomationScenario, ScenarioStatus } from "@/src/lib/automation/scenario-designer";
import { deleteScenario, getScenario, saveScenario, updateScenarioStatus } from "@/src/lib/automation/scenario.repository";

type Context = { params: Promise<{ scenarioId: string }> };

export async function GET(request: Request, context: Context) {
  const owner = await requireOwnerContext(request);
  const { scenarioId } = await context.params;
  const scenario = await getScenario(owner.uid, scenarioId);
  return scenario
    ? NextResponse.json({ scenario })
    : NextResponse.json({ error: "시나리오를 찾을 수 없습니다." }, { status: 404 });
}

export async function PUT(request: Request, context: Context) {
  const owner = await requireOwnerContext(request);
  const { scenarioId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { scenario?: AutomationScenario; status?: ScenarioStatus };
  const updated = body.scenario
    ? await saveScenario(owner.uid, { ...body.scenario, id: scenarioId, ownerId: owner.uid })
    : body.status
      ? await updateScenarioStatus(owner.uid, scenarioId, body.status)
      : null;
  return updated
    ? NextResponse.json({ scenario: updated })
    : NextResponse.json({ error: "변경할 시나리오를 찾을 수 없습니다." }, { status: 404 });
}

export async function DELETE(request: Request, context: Context) {
  const owner = await requireOwnerContext(request);
  const { scenarioId } = await context.params;
  const deleted = await deleteScenario(owner.uid, scenarioId);
  return NextResponse.json({ deleted }, { status: deleted ? 200 : 404 });
}
