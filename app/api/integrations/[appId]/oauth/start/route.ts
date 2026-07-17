import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { startOAuthAuthorization } from "@/src/lib/oauth/oauth-authorization-flow";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

type RouteContext = { params: Promise<{ appId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOriginMutation(request);
    const owner = await requireOwnerContext(request);
    const { appId } = await context.params;
    const body = await request.json().catch(() => ({})) as {
      returnTo?: string;
      requestedScopes?: string[];
    };
    const result = await startOAuthAuthorization({
      ownerId: owner.uid,
      appId,
      requestUrl: request.url,
      returnTo: body.returnTo,
      requestedScopes: Array.isArray(body.requestedScopes) ? body.requestedScopes.map(String) : undefined
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "OAuth connection could not be started." },
      { status: statusFor(error) }
    );
  }
}

function statusFor(error: unknown) {
  return typeof error === "object" && error && "status" in error ? Number(error.status) : 400;
}
