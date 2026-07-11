import { NextResponse } from "next/server";
import { getConnectorAuthState } from "@/src/lib/integrations/connection-status";
import { connectorRegistry } from "@/src/lib/integrations/registry";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";

export async function POST(request: Request) {
  const owner = await requireOwnerContext(request);
  const body = (await request.json().catch(() => ({}))) as { connectorId?: string };
  const connectorId = body.connectorId || "";

  if (!connectorId) {
    return NextResponse.json({ ok: false, message: "connectorId is required" }, { status: 400 });
  }

  const connector = connectorRegistry.get(connectorId);
  const auth = await getConnectorAuthState(owner.uid, connectorId, request.url);
  await connector.testConnection();

  return NextResponse.json({
    ok: auth.status === "connected",
    message: `${auth.detail} Connector test completed.`,
    auth
  });
}
