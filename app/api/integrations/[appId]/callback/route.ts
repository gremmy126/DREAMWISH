import { NextResponse } from "next/server";
import { assertConnectableOAuthProvider } from "@/src/lib/oauth/oauth.service";
import { consumeOAuthSession } from "@/src/lib/repositories/oauth-session.repository";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { buildPublicReturnUrl } from "@/src/lib/oauth/oauth-redirect";
import { persistOAuthCallbackConnection } from "@/src/lib/oauth/oauth-connection.service";
import { getOAuthAppIdForLegacyTarget } from "@/src/lib/oauth/oauth-provider-adapter";

type RouteContext = {
  params: Promise<{ appId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const url = new URL(request.url);

  try {
    const owner = await requireOwnerContext(request);
    const { appId: legacyProviderId } = await context.params;
    const provider = assertConnectableOAuthProvider(legacyProviderId);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const providerError = url.searchParams.get("error");

    if (providerError) {
      throw new Error(`OAuth provider returned an error: ${providerError}`);
    }
    if (!code) throw new Error("OAuth code is missing.");
    if (!state) throw new Error("OAuth state is missing.");

    const session = await consumeOAuthSession({ ownerId: owner.uid, state, provider });
    const appId = session.appId || getOAuthAppIdForLegacyTarget(provider, session.service);
    const connection = await persistOAuthCallbackConnection({
      ownerId: owner.uid,
      appId,
      code,
      redirectUri: session.redirectUri,
      codeVerifier: session.codeVerifier || ""
    });

    return NextResponse.redirect(buildPublicReturnUrl(request.url, {
      view: "integrations",
      connected: session.service,
      appId,
      connectionId: connection.id
    }));
  } catch (error) {
    const provider = url.pathname.split("/").at(-2) || "unknown";
    const params: Record<string, string> = {
      view: "integrations",
      error: "oauth_failed",
      provider
    };
    if (error instanceof Error) params.reason = normalizeErrorReason(error.message);
    return NextResponse.redirect(buildPublicReturnUrl(request.url, params));
  }
}

function normalizeErrorReason(message: string) {
  return message.toLowerCase().replace(/[^a-z0-9_ -]/gu, "").replace(/\s+/gu, "_").slice(0, 80);
}
