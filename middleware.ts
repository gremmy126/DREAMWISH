import { NextResponse, type NextRequest } from "next/server";
import { decideApiAccess } from "@/src/lib/auth/api-access-policy";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
  type SessionClaims
} from "@/src/lib/auth/session-token";

const ACCESS_ERROR_MESSAGES = {
  UNAUTHORIZED: "Authentication is required.",
  PAYMENT_REQUIRED: "An active Polar payment is required.",
  FORBIDDEN: "Administrator access is required."
} as const;

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  let claims: SessionClaims | null = null;

  if (token) {
    try {
      claims = await verifySessionToken(token);
    } catch {
      claims = null;
    }
  }

  const decision = decideApiAccess(request.nextUrl.pathname, claims);
  if (decision.allowed) return NextResponse.next();

  return NextResponse.json(
    {
      ok: false,
      error: {
        code: decision.code,
        message: ACCESS_ERROR_MESSAGES[decision.code]
      }
    },
    { status: decision.status }
  );
}

export const config = {
  matcher: ["/api/:path*"]
};
