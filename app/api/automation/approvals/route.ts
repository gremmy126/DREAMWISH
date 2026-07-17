import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { listApprovalRequests } from "@/src/lib/automation/approval/approval.repository";
import { expireDueApprovals } from "@/src/lib/automation/approval/approval.service";
import { getPinnedWorkflowActionDefinition, getRuntimeWorkflow } from "@/src/lib/automation/runtime/workflow.repository";
import { getIntegrationConnection } from "@/src/lib/repositories/integration-connection.repository";
import { toPublicIntegrationConnection } from "@/src/lib/oauth/integration-connection.types";
import { getStepRun } from "@/src/lib/automation/runtime/execution.repository";

export async function GET(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    await expireDueApprovals(owner.uid);
    const approvals = await listApprovalRequests(owner.uid);
    const enriched = await Promise.all(approvals.map(async (approval) => {
      const [definition, workflow, connection, step] = await Promise.all([
        getPinnedWorkflowActionDefinition({
        ownerId: owner.uid,
        workflowId: approval.snapshot.workflowId,
        workflowVersion: approval.snapshot.workflowVersion,
        nodeId: approval.snapshot.nodeId
        }),
        getRuntimeWorkflow(owner.uid, approval.snapshot.workflowId),
        approval.snapshot.integrationConnectionId ? getIntegrationConnection(owner.uid, approval.snapshot.integrationConnectionId) : Promise.resolve(null),
        getStepRun(owner.uid, approval.stepRunId)
      ]);
      return {
        ...approval,
        definition,
        workflowName: workflow?.name || approval.snapshot.workflowId,
        connection: connection ? toPublicIntegrationConnection(connection) : null,
        rateLimitRemaining: step?.rateLimitRemaining ?? null,
        preview: step?.previewData || null
      };
    }));
    return NextResponse.json({ ok: true, approvals: enriched });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Approvals could not be loaded." }, { status: 400 });
  }
}
