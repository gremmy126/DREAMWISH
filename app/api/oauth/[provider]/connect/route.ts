import { NextResponse } from "next/server";
import {
  assertOAuthProvider,
  createOAuthAuthorizationUrl
} from "@/src/lib/oauth/oauth.service";
import { getOAuthRedirectUri } from "@/src/lib/oauth/oauth-redirect";
import { getOAuthConnectionStatus } from "@/src/lib/oauth/token.service";
import { createOAuthSession } from "@/src/lib/repositories/oauth-session.repository";

type RouteContext = {
  params: Promise<{ provider: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { provider: rawProvider } = await context.params;
    const provider = assertOAuthProvider(rawProvider);
    const requestUrl = request.url;

    if (provider === "firebase") {
      const status = await getOAuthConnectionStatus(provider);
      return NextResponse.redirect(
        new URL(`/?view=integrations&provider=firebase&connected=${status.connected ? "1" : "0"}`, requestUrl)
      );
    }

    if (provider === "github" && !process.env.GITHUB_CLIENT_ID?.trim()) {
      const status = await getOAuthConnectionStatus(provider);
      return NextResponse.redirect(
        new URL(`/?view=integrations&provider=github&connected=${status.connected ? "1" : "0"}`, requestUrl)
      );
    }

    if (provider === "notion" && !process.env.NOTION_CLIENT_ID?.trim()) {
      const status = await getOAuthConnectionStatus(provider);
      return NextResponse.redirect(
        new URL(`/?view=integrations&provider=notion&connected=${status.connected ? "1" : "0"}`, requestUrl)
      );
    }

    const redirectUri = getOAuthRedirectUri(provider, requestUrl);
    const state = crypto.randomUUID();
    await createOAuthSession({ provider, redirectUri, state });
    const authorizationUrl = createOAuthAuthorizationUrl({
      provider,
      redirectUri,
      state
    });

    return NextResponse.redirect(authorizationUrl);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "OAuth connection could not be started."
      },
      { status: 400 }
    );
  }
}
