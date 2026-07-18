import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { validateScenario } from "@/src/lib/automation/scenario-designer";
import { getScenario } from "@/src/lib/automation/scenario.repository";
import { enqueueScenarioExecution } from "@/src/lib/automation/runtime/execution-enqueue.service";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

type Context = { params: Promise<{ scenarioId: string }> };

export async function POST(request: Request, context: Context) {
  assertSameOriginMutation(request);
  const owner = await requireOwnerContext(request);
  const { scenarioId } = await context.params;
  const scenario = await getScenario(owner.uid, scenarioId);
  if (!scenario) return NextResponse.json({ error: "시나리오를 찾을 수 없습니다." }, { status: 404 });
  const validation = validateScenario(scenario);
  if (!validation.valid) {
    return NextResponse.json({ error: "시나리오 설정을 확인하세요.", issues: validation.issues }, { status: 422 });
  }

  const queued = await enqueueScenarioExecution({
    ownerId: owner.uid,
    actorId: owner.uid,
    scenario,
    executionMode: "manual",
    triggerType: "manual_legacy_route",
    priority: 25
  });
  if (!queued.queued) {
    return NextResponse.json({
      ok: false,
      waitingConnection: true,
      execution: queued.execution,
      findings: queued.findings,
      deprecatedRoute: true
    }, { status: 409 });
  }
  return NextResponse.json({ ok: true, execution: queued.execution, jobId: queued.job.id, deprecatedRoute: true }, { status: 202 });
}
