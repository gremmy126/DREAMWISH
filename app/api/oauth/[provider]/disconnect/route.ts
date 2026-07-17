import { NextResponse } from "next/server";
import {
  assertOAuthProvider,
  resolveOAuthService
} from "@/src/lib/oauth/oauth.service";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { getOAuthAppIdForLegacyTarget } from "@/src/lib/oauth/oauth-provider-adapter";
import { listIntegrationConnections } from "@/src/lib/repositories/integration-connection.repository";
import { disconnectOAuthConnection } from "@/src/lib/oauth/oauth-connection.service";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

type RouteContext = {
  params: Promise<{ provider: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  assertSameOriginMutation(request);
  const owner = await requireOwnerContext(request);
  const { provider: rawProvider } = await context.params;
  const provider = assertOAuthProvider(rawProvider);
  if (provider === "firebase") {
    return NextResponse.json({ ok: true, revoked: false, provider });
  }

  const url = new URL(request.url);
  const service = resolveOAuthService(provider, url.searchParams.get("service"));
  const appId = getOAuthAppIdForLegacyTarget(provider, service || null);
  const connection = (await listIntegrationConnections(owner.uid, appId)).find((candidate) => !["disconnected", "revoked"].includes(candidate.status));
  if (!connection) return NextResponse.json({ ok: true, disconnected: false, provider, service });
  const result = await disconnectOAuthConnection({ ownerId: owner.uid, connectionId: connection.id, actorId: owner.uid, reason: "legacy_oauth_route_confirmed" });
  return NextResponse.json({ ok: true, disconnected: true, provider, service, connection: result.connection });
}
