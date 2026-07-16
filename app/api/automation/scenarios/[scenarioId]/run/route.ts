import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { validateScenario } from "@/src/lib/automation/scenario-designer";
import { executeScenarioSteps, resolveScenarioNextRun } from "@/src/lib/automation/scenario-scheduler";
import { recordAutomationRun } from "@/src/lib/automation/run.repository";
import { getScenario, recordScenarioRun, saveScenario } from "@/src/lib/automation/scenario.repository";
import { getVerifiedConnectionStates } from "@/src/lib/integrations/verified-connection.service";

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

  const connectedApps = new Set<string>();
  try {
    const connections = await getVerifiedConnectionStates(owner.uid);
    for (const connection of connections) {
      if (connection.status === "connected") connectedApps.add(connection.connectorId);
    }
  } catch {
    // Connection lookup failure degrades to credential-only checks.
  }

  const startedAt = new Date().toISOString();
  const result = executeScenarioSteps(scenario, { connectedApps });
  const finishedAt = new Date().toISOString();

  const run = await recordAutomationRun({
    ownerId: owner.uid,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    trigger: "manual",
    status: result.status,
    steps: result.steps,
    error: null,
    startedAt,
    finishedAt
  });

  const updated = await recordScenarioRun(owner.uid, scenarioId, result.status !== "failed");
  if (updated) {
    updated.nextRunAt = resolveScenarioNextRun(updated);
    await saveScenario(owner.uid, updated);
  }

  return NextResponse.json({ run, scenario: updated });
}
