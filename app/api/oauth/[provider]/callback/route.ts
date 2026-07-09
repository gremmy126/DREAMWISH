import { NextResponse } from "next/server";
import { handleOAuthCallback } from "@/src/lib/oauth/oauth-callback";
import { assertOAuthProvider } from "@/src/lib/oauth/oauth.service";
import { completeOAuthSession } from "@/src/lib/repositories/oauth-session.repository";

type RouteContext = {
  params: Promise<{ provider: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { provider: rawProvider } = await context.params;
    const provider = assertOAuthProvider(rawProvider);
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code) throw new Error("OAuth code가 없습니다.");

    await handleOAuthCallback({
      provider,
      code,
      redirectUri: `${url.origin}/api/oauth/${provider}/callback`
    });
    if (state) await completeOAuthSession(state);

    return NextResponse.redirect(`${url.origin}/?view=integrations`);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "OAuth 연결에 실패했습니다."
      },
      { status: 400 }
    );
  }
}
