import { NextResponse } from "next/server";
import { handleOAuthCallback } from "@/src/lib/oauth/oauth-callback";
import { getOAuthRedirectUri } from "@/src/lib/oauth/oauth-redirect";
import { assertOAuthProvider } from "@/src/lib/oauth/oauth.service";
import {
  completeOAuthSession,
  findOAuthSession
} from "@/src/lib/repositories/oauth-session.repository";

type RouteContext = {
  params: Promise<{ provider: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const url = new URL(request.url);

  try {
    const { provider: rawProvider } = await context.params;
    const provider = assertOAuthProvider(rawProvider);
    if (provider === "firebase") {
      return NextResponse.redirect(`${url.origin}/?view=integrations&provider=firebase`);
    }

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code) throw new Error("OAuth code is missing.");

    const session = state ? await findOAuthSession(state) : null;
    const redirectUri = session?.redirectUri || getOAuthRedirectUri(provider, request.url);

    await handleOAuthCallback({
      provider,
      code,
      redirectUri
    });
    if (state) await completeOAuthSession(state);

    return NextResponse.redirect(`${url.origin}/?view=integrations&provider=${provider}&connected=1`);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "OAuth connection failed."
      },
      { status: 400 }
    );
  }
}
