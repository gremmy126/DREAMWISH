import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { disconnectOAuthConnection } from "@/src/lib/oauth/oauth-connection.service";
import { toPublicIntegrationConnection } from "@/src/lib/oauth/integration-connection.types";
import { getIntegrationConnection, listConnectionWorkflowImpact } from "@/src/lib/repositories/integration-connection.repository";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

type RouteContext = { params: Promise<{ connectionId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOriginMutation(request);
    const owner = await requireOwnerContext(request);
    const { connectionId } = await context.params;
    const body = await request.json().catch(() => ({})) as { confirmed?: boolean; reason?: string };
    if (!body.confirmed) {
      const connection = await getIntegrationConnection(owner.uid, connectionId);
      if (!connection) return NextResponse.json({ ok: false, error: "Connection not found." }, { status: 404 });
      const affectedWorkflows = await listConnectionWorkflowImpact(owner.uid, connectionId);
      return NextResponse.json({
        ok: true,
        confirmationRequired: true,
        connection: toPublicIntegrationConnection(connection),
        affectedWorkflows
      });
    }
    const result = await disconnectOAuthConnection({
      ownerId: owner.uid,
      connectionId,
      actorId: owner.uid,
      reason: String(body.reason || "user_requested_disconnect")
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Connection could not be disconnected." }, { status: 400 });
  }
}
