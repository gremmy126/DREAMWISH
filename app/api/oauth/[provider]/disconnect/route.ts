import { NextResponse } from "next/server";
import {
  assertOAuthProvider,
  resolveOAuthService
} from "@/src/lib/oauth/oauth.service";
import { revokeOAuthToken } from "@/src/lib/repositories/oauth-token.repository";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";

type RouteContext = {
  params: Promise<{ provider: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const owner = await requireOwnerContext(request);
  const { provider: rawProvider } = await context.params;
  const provider = assertOAuthProvider(rawProvider);
  if (provider === "firebase") {
    return NextResponse.json({ ok: true, revoked: false, provider });
  }

  const url = new URL(request.url);
  const service = resolveOAuthService(provider, url.searchParams.get("service"));
  const token = await revokeOAuthToken(owner.uid, provider, service || null);
  return NextResponse.json({ ok: true, revoked: Boolean(token), provider, service });
}
