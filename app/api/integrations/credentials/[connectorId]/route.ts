import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { getAutomationApp } from "@/src/lib/automation/app-registry";
import { deleteCredentialsByApp } from "@/src/lib/automation/credential.repository";
import { disableIntegrationSyncSetting } from "@/src/lib/integrations/integration-settings.repository";

export async function DELETE(request: Request, context: { params: Promise<{ connectorId: string }> }) {
  const owner = await requireOwnerContext(request);
  const { connectorId } = await context.params;
  if (!getAutomationApp(connectorId)) return NextResponse.json({ error: "지원하지 않는 앱입니다." }, { status: 404 });
  const deleted = await deleteCredentialsByApp(owner.uid, connectorId);
  await disableIntegrationSyncSetting(owner.uid, connectorId);
  return NextResponse.json({ disconnected: true, deleted });
}
