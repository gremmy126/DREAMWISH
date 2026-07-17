import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  getAutomationRun,
  recordAutomationRun
} from "@/src/lib/automation/run.repository";
import { getScenario } from "@/src/lib/automation/scenario.repository";
import { executeScenarioGraph } from "@/src/lib/automation/workflow-engine";
import { getVerifiedConnectionStates } from "@/src/lib/integrations/verified-connection.service";

type Context = { params: Promise<{ runId: string }> };

/** Re-executes a run with its stored trigger data; links the new run to the original. */
export async function POST(request: Request, context: Context) {
  const owner = await requireOwnerContext(request);
  const { runId } = await context.params;
  const original = await getAutomationRun(owner.uid, runId);
  if (!original) {
    return NextResponse.json({ error: "실행 기록을 찾을 수 없습니다." }, { status: 404 });
  }
  const scenario = await getScenario(owner.uid, original.scenarioId);
  if (!scenario) {
    return NextResponse.json({ error: "시나리오를 찾을 수 없습니다." }, { status: 404 });
  }

  const connectedApps = new Set<string>();
  try {
    for (const connection of await getVerifiedConnectionStates(owner.uid)) {
      if (connection.status === "connected") connectedApps.add(connection.connectorId);
    }
  } catch {
    // Reduced detail only.
  }

  const startedAt = new Date().toISOString();
  const result = executeScenarioGraph(scenario, {
    triggerData: original.triggerData,
    connectedApps
  });
  const run = await recordAutomationRun({
    ownerId: owner.uid,
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    trigger: original.trigger,
    status: result.status,
    steps: result.steps,
    triggerData: original.triggerData,
    waiting: result.waiting ? { ...result.waiting, context: result.context } : null,
    retryOfRunId: original.id,
    error: null,
    startedAt,
    finishedAt: new Date().toISOString()
  });
  return NextResponse.json({ run });
}
