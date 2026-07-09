import { NextResponse } from "next/server";
import {
  assertOAuthProvider,
  createOAuthAuthorizationUrl
} from "@/src/lib/oauth/oauth.service";
import { createOAuthSession } from "@/src/lib/repositories/oauth-session.repository";

type RouteContext = {
  params: Promise<{ provider: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { provider: rawProvider } = await context.params;
  const provider = assertOAuthProvider(rawProvider);
  const url = new URL(request.url);
  const redirectUri = `${url.origin}/api/oauth/${provider}/callback`;
  const state = crypto.randomUUID();
  await createOAuthSession({ provider, redirectUri, state });
  const authorizationUrl = createOAuthAuthorizationUrl({
    provider,
    redirectUri,
    state
  });

  return NextResponse.redirect(authorizationUrl);
}
