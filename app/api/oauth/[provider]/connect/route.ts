import { NextResponse } from "next/server";
import { assertOAuthProvider } from "@/src/lib/oauth/oauth.service";

type RouteContext = {
  params: Promise<{ provider: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { provider: rawProvider } = await context.params;
  const provider = assertOAuthProvider(rawProvider);
  const url = new URL(request.url);

  if (provider === "firebase") {
    return NextResponse.redirect(
      new URL("/?view=integrations&provider=firebase", url.origin)
    );
  }

  const redirect = new URL(`/api/integrations/${provider}/connect`, url.origin);
  url.searchParams.forEach((value, key) => redirect.searchParams.set(key, value));
  return NextResponse.redirect(redirect);
}
