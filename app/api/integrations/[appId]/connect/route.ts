import { NextResponse } from "next/server";
import {
  assertConnectableOAuthProvider,
  resolveOAuthService
} from "@/src/lib/oauth/oauth.service";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { getOAuthAppIdForLegacyTarget } from "@/src/lib/oauth/oauth-provider-adapter";
import { startOAuthAuthorization } from "@/src/lib/oauth/oauth-authorization-flow";

type RouteContext = {
  params: Promise<{ appId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const owner = await requireOwnerContext(request);
    const { appId } = await context.params;
    const provider = assertConnectableOAuthProvider(appId);
    const url = new URL(request.url);
    const service = resolveOAuthService(provider, url.searchParams.get("service"));

    const authorization = await startOAuthAuthorization({
      ownerId: owner.uid,
      appId: getOAuthAppIdForLegacyTarget(provider, service),
      requestUrl: request.url,
      returnTo: url.searchParams.get("returnTo")
    });
    return NextResponse.redirect(authorization.authorizationUrl);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "OAuth connection could not be started."
      },
      { status: 400 }
    );
  }
}
