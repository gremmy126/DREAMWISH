import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { startOAuthAuthorization } from "@/src/lib/oauth/oauth-authorization-flow";
import { getIntegrationConnection } from "@/src/lib/repositories/integration-connection.repository";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

type RouteContext = { params: Promise<{ connectionId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOriginMutation(request);
    const owner = await requireOwnerContext(request);
    const { connectionId } = await context.params;
    const connection = await getIntegrationConnection(owner.uid, connectionId);
    if (!connection) return NextResponse.json({ ok: false, error: "Connection not found." }, { status: 404 });
    const body = await request.json().catch(() => ({})) as { returnTo?: string };
    const authorization = await startOAuthAuthorization({
      ownerId: owner.uid,
      appId: connection.appId,
      requestUrl: request.url,
      returnTo: body.returnTo,
      requestedScopes: connection.grantedScopes
    });
    return NextResponse.json({ ok: true, ...authorization });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Reauthorization failed." }, { status: 400 });
  }
}
