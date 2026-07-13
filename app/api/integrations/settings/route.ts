import { NextResponse } from "next/server";
import {
  listEnabledIntegrationApps,
  listIntegrationSyncSettings,
  saveIntegrationSyncSetting
} from "@/src/lib/integrations/integration-settings.repository";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";

export async function GET(request: Request) {
  const owner = await requireOwnerContext(request);
  return NextResponse.json({
    settings: await listIntegrationSyncSettings(owner.uid),
    enabledApps: await listEnabledIntegrationApps(owner.uid)
  });
}

export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as {
    connectorId?: string;
    enabled?: boolean;
    syncDays?: number;
    commandPrefix?: string;
  };
  if (!body.connectorId) {
    return NextResponse.json({ error: "connectorId가 필요합니다." }, { status: 400 });
  }
  const setting = await saveIntegrationSyncSetting({
    ownerId: owner.uid,
    connectorId: body.connectorId,
    enabled: Boolean(body.enabled),
    syncDays: typeof body.syncDays === "number" ? body.syncDays : 30,
    commandPrefix: body.commandPrefix || body.connectorId
  });
  return NextResponse.json({ setting }, { status: 201 });
}
