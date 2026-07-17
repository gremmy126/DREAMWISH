import { NextResponse } from "next/server";
import { requireOwnerContext } from "@/src/lib/auth/owner-context";
import { testOAuthConnection } from "@/src/lib/oauth/oauth-connection.service";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";

type RouteContext = { params: Promise<{ connectionId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    assertSameOriginMutation(request);
    const owner = await requireOwnerContext(request);
    const { connectionId } = await context.params;
    return NextResponse.json({ ok: true, ...(await testOAuthConnection(owner.uid, connectionId)) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Connection test failed." }, { status: 400 });
  }
}
