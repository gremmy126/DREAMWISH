import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { toPublicIntegrationConnection } from "@/src/lib/oauth/integration-connection.types";
import { listIntegrationConnections } from "@/src/lib/repositories/integration-connection.repository";

export async function GET(request: Request) {
  try {
    const owner = await requireOwnerContext(request);
    const appId = new URL(request.url).searchParams.get("appId");
    const connections = await listIntegrationConnections(owner.uid, appId);
    return NextResponse.json({ ok: true, connections: connections.map(toPublicIntegrationConnection) });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Connections could not be loaded." },
      { status: 401 }
    );
  }
}
