import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { getScenario } from "@/src/lib/automation/scenario.repository";
import { enqueueScenarioExecution } from "@/src/lib/automation/runtime/execution-enqueue.service";
import type { ApprovalPolicy } from "@/src/lib/automation/runtime/types";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

type RouteContext = { params: Promise<{ workflowId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOriginMutation(request);
    const owner = await requireOwnerContext(request);
    const { workflowId } = await context.params;
    const body = await request.json().catch(() => ({})) as {
      approvalPolicy?: ApprovalPolicy;
      approvalExpiryMinutes?: number;
      notificationChannels?: string[];
      triggerData?: Record<string, unknown>;
      criticalAuthMethod?: "password" | "otp" | "admin" | null;
    };
    const scenario = await getScenario(owner.uid, workflowId);
    if (!scenario) return NextResponse.json({ ok: false, error: "워크플로를 찾을 수 없습니다." }, { status: 404 });
    const result = await enqueueScenarioExecution({
      ownerId: owner.uid,
      actorId: owner.uid,
      scenario,
      executionMode: "manual",
      triggerType: "manual",
      approvalPolicy: body.approvalPolicy || "high_risk_two_stage",
      approvalExpiryMinutes: body.approvalExpiryMinutes,
      notificationChannels: body.notificationChannels,
      criticalAuthMethod: body.criticalAuthMethod,
      triggerData: body.triggerData,
      priority: 25
    });
    if (!result.queued) {
      return NextResponse.json({
        ok: false,
        waitingConnection: true,
        execution: result.execution,
        findings: result.findings,
        workflowVersion: result.workflowVersion
      }, { status: 409 });
    }
    return NextResponse.json({ ok: true, execution: result.execution, jobId: result.job.id, workflowVersion: result.workflowVersion }, { status: 202 });
  } catch (error) {
    const failure = error as { code?: string; findings?: unknown[] };
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "워크플로 실행을 예약하지 못했습니다.",
      ...(failure.code === "WORKFLOW_PREFLIGHT_FAILED" ? { findings: failure.findings } : {})
    }, { status: failure.code === "WORKFLOW_PREFLIGHT_FAILED" ? 422 : 400 });
  }
}
