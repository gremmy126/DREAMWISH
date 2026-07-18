import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";
import { getExecution } from "@/src/lib/automation/runtime/execution.repository";
import { getWorkflowVersion } from "@/src/lib/automation/runtime/workflow.repository";
import { getExecutionTriggerPayload } from "@/src/lib/automation/runtime/trigger-payload.repository";
import { enqueueScenarioExecution } from "@/src/lib/automation/runtime/execution-enqueue.service";
import type { AutomationScenario } from "@/src/lib/automation/scenario-designer";

type Context = { params: Promise<{ executionId: string }> };

export async function POST(request: Request, context: Context) {
  assertSameOriginMutation(request);
  const owner = await requireOwnerContext(request);
  const { executionId } = await context.params;
  const execution = await getExecution(owner.uid, executionId);
  if (!execution) return NextResponse.json({ ok: false, error: "실행 기록을 찾을 수 없습니다." }, { status: 404 });
  if (!execution.retryEligible) {
    return NextResponse.json({ ok: false, error: "이 실행은 안전하게 재시도할 수 없습니다." }, { status: 409 });
  }
  if (execution.retryAt && new Date(execution.retryAt).getTime() > Date.now()) {
    return NextResponse.json({ ok: false, error: "아직 재시도 시각이 되지 않았습니다.", retryAt: execution.retryAt }, { status: 409 });
  }
  const version = await getWorkflowVersion<AutomationScenario>(owner.uid, execution.workflowId, execution.workflowVersion);
  if (!version) return NextResponse.json({ ok: false, error: "고정된 워크플로 버전을 찾을 수 없습니다." }, { status: 409 });
  const triggerData = await getExecutionTriggerPayload(owner.uid, execution.id);
  const result = await enqueueScenarioExecution({
    ownerId: owner.uid,
    actorId: owner.uid,
    scenario: version.snapshot,
    executionMode: "manual",
    triggerType: `retry:${execution.triggerType}`,
    triggerEventId: `${execution.id}:${randomUUID()}`,
    triggerData,
    parentExecutionId: execution.id,
    resumedFromStepId: execution.resumedFromStepId,
    priority: 25
  });
  if (!result.queued) {
    return NextResponse.json({ ok: false, waitingConnection: true, execution: result.execution, findings: result.findings }, { status: 409 });
  }
  return NextResponse.json({ ok: true, execution: result.execution, jobId: result.job.id }, { status: 202 });
}
