import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/src/lib/auth/session-token";
import { MFA_CHALLENGE_COOKIE_NAME } from "@/src/lib/auth/mfa-challenge-token";
import { clearedAuthCookieAttributes } from "@/src/lib/auth/session-issuance.service";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(clearedAuthCookieAttributes(SESSION_COOKIE_NAME));
  response.cookies.set(clearedAuthCookieAttributes(MFA_CHALLENGE_COOKIE_NAME));
  return response;
}
