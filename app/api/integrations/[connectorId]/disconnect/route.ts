import { NextResponse } from "next/server";
import {
  assertConnectableOAuthProvider,
  resolveOAuthService
} from "@/src/lib/oauth/oauth.service";
import { revokeOAuthToken } from "@/src/lib/repositories/oauth-token.repository";

type RouteContext = {
  params: Promise<{ connectorId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { connectorId } = await context.params;
    const provider = assertConnectableOAuthProvider(connectorId);
    const url = new URL(request.url);
    const service = resolveOAuthService(provider, url.searchParams.get("service"));
    const token = await revokeOAuthToken(provider, service);
    return NextResponse.json({ ok: true, revoked: Boolean(token), provider, service });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "OAuth disconnect failed."
      },
      { status: 400 }
    );
  }
}
