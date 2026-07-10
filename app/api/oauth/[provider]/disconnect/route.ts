import { NextResponse } from "next/server";
import {
  assertOAuthProvider,
  resolveOAuthService
} from "@/src/lib/oauth/oauth.service";
import { revokeOAuthToken } from "@/src/lib/repositories/oauth-token.repository";

type RouteContext = {
  params: Promise<{ provider: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { provider: rawProvider } = await context.params;
  const provider = assertOAuthProvider(rawProvider);
  if (provider === "firebase") {
    return NextResponse.json({ ok: true, revoked: false, provider });
  }

  const url = new URL(request.url);
  const service = resolveOAuthService(provider, url.searchParams.get("service"));
  const token = await revokeOAuthToken(provider, service || null);
  return NextResponse.json({ ok: true, revoked: Boolean(token), provider, service });
}
