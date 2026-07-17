import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { refreshOAuthConnection } from "@/src/lib/oauth/oauth-connection.service";
import { toPublicIntegrationConnection } from "@/src/lib/oauth/integration-connection.types";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

type RouteContext = { params: Promise<{ connectionId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOriginMutation(request);
    const owner = await requireOwnerContext(request);
    const { connectionId } = await context.params;
    const connection = await refreshOAuthConnection(owner.uid, connectionId);
    return NextResponse.json({ ok: true, connection: toPublicIntegrationConnection(connection) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Connection refresh failed." }, { status: 400 });
  }
}
