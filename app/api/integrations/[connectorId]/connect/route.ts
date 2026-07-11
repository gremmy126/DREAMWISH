import { NextResponse } from "next/server";
import {
  createOAuthAuthorizationUrl,
  assertConnectableOAuthProvider,
  resolveOAuthService
} from "@/src/lib/oauth/oauth.service";
import { getOAuthProviderConfig, validateOAuthProviderConfigured } from "@/src/lib/oauth/oauth-provider-registry";
import { getOAuthRedirectUri } from "@/src/lib/oauth/oauth-redirect";
import { createOAuthSecurityParams } from "@/src/lib/oauth/oauth-state";
import { createOAuthSession } from "@/src/lib/repositories/oauth-session.repository";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";

type RouteContext = {
  params: Promise<{ connectorId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const owner = await requireOwnerContext(request);
    const { connectorId } = await context.params;
    const provider = assertConnectableOAuthProvider(connectorId);
    const url = new URL(request.url);
    const service = resolveOAuthService(provider, url.searchParams.get("service"));

    validateOAuthProviderConfigured(provider);

    const redirectUri = getOAuthRedirectUri(provider, request.url);
    const security = createOAuthSecurityParams();
    const config = getOAuthProviderConfig(provider);
    await createOAuthSession({
      ownerId: owner.uid,
      provider,
      service,
      state: security.state,
      redirectUri,
      codeVerifier: config.supportsPkce ? security.codeVerifier : null,
      returnTo: url.searchParams.get("returnTo")
    });

    const authorizationUrl = createOAuthAuthorizationUrl({
      provider,
      service,
      redirectUri,
      state: security.state,
      codeChallenge: config.supportsPkce ? security.codeChallenge : undefined
    });

    return NextResponse.redirect(authorizationUrl);
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
