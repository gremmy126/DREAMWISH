import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { persistOAuthCallbackConnection } from "@/src/lib/oauth/oauth-connection.service";
import { getOAuthAppTarget } from "@/src/lib/oauth/oauth-provider-adapter";
import { buildPublicReturnUrl, getPublicAppUrl } from "@/src/lib/oauth/oauth-redirect";
import {
  normalizeReturnTarget,
  resolveOAuthSessionAppConfig
} from "@/src/lib/oauth/oauth-authorization-flow";
import { consumeOAuthSession } from "@/src/lib/repositories/oauth-session.repository";

type RouteContext = { params: Promise<{ appId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const url = new URL(request.url);
  try {
    const owner = await requireOwnerContext(request);
    const { appId } = await context.params;
    const target = getOAuthAppTarget(appId);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const providerError = url.searchParams.get("error");
    if (providerError) throw new Error(`OAuth provider returned an error: ${providerError}`);
    if (!code || !state) throw new Error("OAuth code or state is missing.");

    const session = await consumeOAuthSession({ ownerId: owner.uid, state, provider: target.provider });
    if (session.appId !== appId) throw new Error("OAuth application does not match state.");
    const oauthAppConfig = await resolveOAuthSessionAppConfig(session);
    const connection = await persistOAuthCallbackConnection({
      ownerId: owner.uid,
      appId,
      code,
      redirectUri: session.redirectUri,
      codeVerifier: session.codeVerifier || "",
      oauthAppConfigId: oauthAppConfig.id,
      oauthAppConfigVersion: oauthAppConfig.version,
      credentials: oauthAppConfig
    });
    const destination = new URL(normalizeReturnTarget(session.returnTo), getPublicAppUrl(request.url));
    destination.searchParams.set("connected", appId);
    destination.searchParams.set("connectionId", connection.id);
    return NextResponse.redirect(destination);
  } catch (error) {
    return NextResponse.redirect(buildPublicReturnUrl(request.url, {
      view: "integrations",
      error: "oauth_failed",
      reason: normalizeErrorReason(error instanceof Error ? error.message : "unknown")
    }));
  }
}

function normalizeErrorReason(message: string) {
  return message.toLowerCase().replace(/[^a-z0-9_ -]/gu, "").replace(/\s+/gu, "_").slice(0, 80);
}
