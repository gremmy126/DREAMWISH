import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { validateScenario } from "@/src/lib/automation/scenario-designer";
import { getScenario, recordScenarioRun } from "@/src/lib/automation/scenario.repository";

type Context = { params: Promise<{ scenarioId: string }> };

export async function POST(request: Request, context: Context) {
  const owner = await requireOwnerContext(request);
  const { scenarioId } = await context.params;
  const scenario = await getScenario(owner.uid, scenarioId);
  if (!scenario) return NextResponse.json({ error: "시나리오를 찾을 수 없습니다." }, { status: 404 });
  const validation = validateScenario(scenario);
  if (!validation.valid) {
    return NextResponse.json({ error: "시나리오 설정을 확인하세요.", issues: validation.issues }, { status: 422 });
  }
  const startedAt = new Date().toISOString();
  const steps = scenario.nodes.map((node, index) => ({
    nodeId: node.id,
    label: node.label,
    operation: node.operation,
    order: index + 1,
    status: "success" as const
  }));
  const updated = await recordScenarioRun(owner.uid, scenarioId, true);
  return NextResponse.json({
    run: { id: crypto.randomUUID(), status: "success", startedAt, finishedAt: new Date().toISOString(), steps },
    scenario: updated
  });
}
