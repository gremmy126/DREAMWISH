import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { getScenario, saveScenario } from "@/src/lib/automation/scenario.repository";
import { resolveScenarioNextRun } from "@/src/lib/automation/scenario-scheduler";
import { validateWorkflowForActivation } from "@/src/lib/automation/runtime/workflow-validator";
import { activateWorkflowVersion, ensureRuntimeWorkflow, pauseRuntimeWorkflow, saveWorkflowVersion } from "@/src/lib/automation/runtime/workflow.repository";
import type { ApprovalPolicy } from "@/src/lib/automation/runtime/types";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

type RouteContext = { params: Promise<{ workflowId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOriginMutation(request);
    const owner = await requireOwnerContext(request);
    const { workflowId } = await context.params;
    const body = await request.json().catch(() => ({})) as {
      status?: "active" | "paused";
      approvalPolicy?: ApprovalPolicy;
      approvalExpiryMinutes?: number;
      notificationChannels?: string[];
      criticalAuthMethod?: "password" | "otp" | "admin" | null;
    };
    const scenario = await getScenario(owner.uid, workflowId);
    if (!scenario) return NextResponse.json({ ok: false, error: "워크플로를 찾을 수 없습니다." }, { status: 404 });
    if (body.status === "paused") {
      await pauseRuntimeWorkflow(owner.uid, workflowId);
      scenario.status = "paused";
      scenario.nextRunAt = null;
      return NextResponse.json({ ok: true, scenario: await saveScenario(owner.uid, scenario) });
    }

    const validation = await validateWorkflowForActivation(owner.uid, scenario);
    if (!validation.valid) return NextResponse.json({ ok: false, error: "활성화 전 검증에 실패했습니다.", issues: validation.issues }, { status: 422 });
    await ensureRuntimeWorkflow({
      ownerId: owner.uid,
      workflowId,
      name: scenario.name,
      approvalPolicy: body.approvalPolicy || "high_risk_two_stage",
      approvalExpiryMinutes: body.approvalExpiryMinutes,
      notificationChannels: body.notificationChannels,
      criticalAuthMethod: body.criticalAuthMethod
    });
    const version = await saveWorkflowVersion(owner.uid, workflowId, scenario, owner.uid);
    const workflow = await activateWorkflowVersion(owner.uid, workflowId, version.version);
    scenario.status = "active";
    scenario.nextRunAt = resolveScenarioNextRun(scenario);
    await saveScenario(owner.uid, scenario);
    return NextResponse.json({ ok: true, workflow, scenario, validation });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "워크플로를 활성화하지 못했습니다." }, { status: 400 });
  }
}
