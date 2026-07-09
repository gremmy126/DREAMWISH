import { NextResponse } from "next/server";
import { assertOAuthProvider } from "@/src/lib/oauth/oauth.service";
import { revokeOAuthToken } from "@/src/lib/repositories/oauth-token.repository";

type RouteContext = {
  params: Promise<{ provider: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { provider: rawProvider } = await context.params;
  const provider = assertOAuthProvider(rawProvider);
  const token = await revokeOAuthToken(provider);
  return NextResponse.json({ ok: true, revoked: Boolean(token), provider });
}
