import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { toPublicIntegrationConnection } from "@/src/lib/oauth/integration-connection.types";
import { getIntegrationConnection, listConnectionWorkflowImpact } from "@/src/lib/repositories/integration-connection.repository";

type RouteContext = { params: Promise<{ connectionId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const owner = await requireOwnerContext(request);
  const { connectionId } = await context.params;
  const connection = await getIntegrationConnection(owner.uid, connectionId);
  if (!connection) return NextResponse.json({ ok: false, error: "Connection not found." }, { status: 404 });
  const affectedWorkflows = await listConnectionWorkflowImpact(owner.uid, connectionId);
  return NextResponse.json({ ok: true, connection: toPublicIntegrationConnection(connection), affectedWorkflows });
}
