import { NextResponse } from "next/server";
import {
  buildAccessState,
  isAdminEmail
} from "@/src/lib/auth/access-control";
import { getAuthRouteError } from "@/src/lib/auth/auth-route-error";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS
} from "@/src/lib/auth/session-token";
import { verifyFirebaseIdToken } from "@/src/lib/firebase/firebase-server-auth";
import { getBillingEntitlement } from "@/src/lib/billing/billing.repository";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      idToken?: string;
    };
    const idToken = typeof body.idToken === "string" ? body.idToken.trim() : "";
    if (!idToken) {
      return NextResponse.json(
        { ok: false, error: "Firebase ID token is required." },
        { status: 401 }
      );
    }

    const verified = await verifyFirebaseIdToken(idToken);
    const entitlement = isAdminEmail(verified.email)
      ? null
      : await getBillingEntitlement(verified.uid);
    const access = buildAccessState({
      email: verified.email,
      paid: entitlement?.status === "active"
    });
    const sessionToken = await createSessionToken({
      uid: verified.uid,
      email: verified.email,
      name: verified.name,
      paid: access.paid
    });
    const response = NextResponse.json({ ok: true, access });
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: sessionToken,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
      secure: process.env.NODE_ENV === "production"
    });

    return response;
  } catch (error) {
    const publicError = getAuthRouteError(error);
    return NextResponse.json(
      { ok: false, error: publicError.message },
      { status: publicError.status }
    );
  }
}
