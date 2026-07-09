import { NextResponse } from "next/server";
import {
  applyAcceptedConnection,
  buildConnectionAcceptancePlan
} from "@/src/lib/connections/connections.service";
import {
  buildExternalConnectionPlan,
  findExternalConnectionTarget
} from "@/src/lib/connections/external-actions";
import { saveIntegrationSyncSetting } from "@/src/lib/integrations/integration-settings.repository";

export async function POST(request: Request) {
  const body = await request.json();
  const sourcePath = String(body.sourcePath || "");
  const targetPath = String(body.targetPath || "");
  const targetType = String(body.targetType || "");
  const externalTargetId = String(body.externalTargetId || "");
  const approved = body.approved === true;

  if (targetType === "app" || targetType === "website" || externalTargetId) {
    const target = findExternalConnectionTarget(externalTargetId || targetPath);
    if (!target) {
      return NextResponse.json({ error: "External connection target not found" }, { status: 404 });
    }

    const plan = buildExternalConnectionPlan(target);
    if (!approved) {
      return NextResponse.json({
        requiresApproval: true,
        message: "Connection preview created. Accepting will enable this app command in AI Chat.",
        plan
      });
    }

    await saveIntegrationSyncSetting({
      connectorId: target.id === "google-workspace" ? "gmail" : target.id,
      enabled: true,
      syncDays: 30,
      commandPrefix: target.commandPrefix
    });
    return NextResponse.json({
      applied: true,
      message: `${target.label} connection enabled for AI Chat commands.`,
      plan
    });
  }

  if (!sourcePath || !targetPath) {
    return NextResponse.json({ error: "sourcePath와 targetPath가 필요합니다." }, { status: 400 });
  }

  if (!approved) {
    const plan = await buildConnectionAcceptancePlan({ sourcePath, targetPath });
    return NextResponse.json({
      requiresApproval: true,
      message: "승인 전에는 Markdown 파일을 수정하지 않습니다.",
      plan: {
        sourcePath: plan.sourcePath,
        targetPath: plan.targetPath,
        targetLink: plan.targetLink,
        changed: plan.changed
      }
    });
  }

  return NextResponse.json(await applyAcceptedConnection({ sourcePath, targetPath }));
}
