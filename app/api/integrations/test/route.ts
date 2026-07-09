import { NextResponse } from "next/server";
import { getConnectorAuthState } from "@/src/lib/integrations/connection-status";
import { connectorRegistry } from "@/src/lib/integrations/registry";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { connectorId?: string };
  const connectorId = body.connectorId || "";

  if (!connectorId) {
    return NextResponse.json({ ok: false, message: "connectorId is required" }, { status: 400 });
  }

  const connector = connectorRegistry.get(connectorId);
  const auth = await getConnectorAuthState(connectorId);
  const test = await connector.testConnection();

  return NextResponse.json({
    ok: auth.status === "connected" || auth.status === "mock_mode",
    message: `${auth.detail} ${test.message}`,
    auth
  });
}
