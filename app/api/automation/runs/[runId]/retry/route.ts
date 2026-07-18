import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import {
  getAutomationRun
} from "@/src/lib/automation/run.repository";
import { getScenario } from "@/src/lib/automation/scenario.repository";
import { enqueueScenarioExecution } from "@/src/lib/automation/runtime/execution-enqueue.service";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";
import { randomUUID } from "node:crypto";

type Context = { params: Promise<{ runId: string }> };

/** Re-executes a run with its stored trigger data; links the new run to the original. */
export async function POST(request: Request, context: Context) {
  assertSameOriginMutation(request);
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

  const queued = await enqueueScenarioExecution({
    ownerId: owner.uid,
    actorId: owner.uid,
    scenario,
    executionMode: "manual",
    triggerType: `legacy_retry:${original.trigger}`,
    triggerEventId: `${original.id}:${randomUUID()}`,
    triggerData: original.triggerData,
    priority: 25
  });
  if (!queued.queued) {
    return NextResponse.json({
      ok: false,
      waitingConnection: true,
      execution: queued.execution,
      findings: queued.findings
    }, { status: 409 });
  }
  return NextResponse.json({ ok: true, execution: queued.execution, jobId: queued.job.id }, { status: 202 });
}
