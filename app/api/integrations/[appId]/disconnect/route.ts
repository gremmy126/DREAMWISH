import { NextResponse } from "next/server";
import {
  assertConnectableOAuthProvider,
  resolveOAuthService
} from "@/src/lib/oauth/oauth.service";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { getOAuthAppIdForLegacyTarget } from "@/src/lib/oauth/oauth-provider-adapter";
import { listIntegrationConnections } from "@/src/lib/repositories/integration-connection.repository";
import { disconnectOAuthConnection } from "@/src/lib/oauth/oauth-connection.service";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

type RouteContext = {
  params: Promise<{ appId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOriginMutation(request);
    const owner = await requireOwnerContext(request);
    const { appId: providerId } = await context.params;
    const provider = assertConnectableOAuthProvider(providerId);
    const url = new URL(request.url);
    const service = resolveOAuthService(provider, url.searchParams.get("service"));
    const targetAppId = getOAuthAppIdForLegacyTarget(provider, service);
    const connections = await listIntegrationConnections(owner.uid, targetAppId);
    const connection = connections.find((candidate) => !["disconnected", "revoked"].includes(candidate.status));
    if (!connection) return NextResponse.json({ ok: true, disconnected: false, provider, service });
    const result = await disconnectOAuthConnection({
      ownerId: owner.uid,
      connectionId: connection.id,
      actorId: owner.uid,
      reason: "legacy_connector_ui_confirmed"
    });
    return NextResponse.json({ ok: true, disconnected: true, provider, service, connection: result.connection });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "OAuth disconnect failed."
      },
      { status: 400 }
    );
  }
}
