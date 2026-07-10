import { NextResponse } from "next/server";
import { handleOAuthCallback } from "@/src/lib/oauth/oauth-callback";
import { assertConnectableOAuthProvider } from "@/src/lib/oauth/oauth.service";
import { consumeOAuthSession } from "@/src/lib/repositories/oauth-session.repository";

type RouteContext = {
  params: Promise<{ connectorId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const url = new URL(request.url);

  try {
    const { connectorId } = await context.params;
    const provider = assertConnectableOAuthProvider(connectorId);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const providerError = url.searchParams.get("error");

    if (providerError) {
      throw new Error(`OAuth provider returned an error: ${providerError}`);
    }
    if (!code) throw new Error("OAuth code is missing.");
    if (!state) throw new Error("OAuth state is missing.");

    const session = await consumeOAuthSession({ state, provider });
    await handleOAuthCallback({
      provider,
      service: session.service,
      code,
      redirectUri: session.redirectUri,
      codeVerifier: session.codeVerifier
    });

    return NextResponse.redirect(
      new URL(`/?view=integrations&connected=${session.service}`, url.origin)
    );
  } catch (error) {
    const provider = url.pathname.split("/").at(-2) || "unknown";
    const redirect = new URL("/", url.origin);
    redirect.searchParams.set("view", "integrations");
    redirect.searchParams.set("error", "oauth_failed");
    redirect.searchParams.set("provider", provider);
    if (error instanceof Error) redirect.searchParams.set("reason", normalizeErrorReason(error.message));
    return NextResponse.redirect(redirect);
  }
}

function normalizeErrorReason(message: string) {
  return message.toLowerCase().replace(/[^a-z0-9_ -]/gu, "").replace(/\s+/gu, "_").slice(0, 80);
}
