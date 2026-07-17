import { NextResponse } from "next/server";
import { getAuthRouteError } from "@/src/lib/auth/auth-route-error";
import {
  authCookieAttributes,
  clearedAuthCookieAttributes,
  completePrimaryAuthentication
} from "@/src/lib/auth/session-issuance.service";
import { SESSION_COOKIE_NAME } from "@/src/lib/auth/session-token";
import { verifyFirebaseIdToken } from "@/src/lib/firebase/firebase-server-auth";
import { upsertOperationalAccount } from "@/src/lib/admin/account-admin.repository";

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
    const operationalAccount = await upsertOperationalAccount({
      id: verified.uid,
      email: verified.email,
      name: verified.name,
      provider: "password",
      providerSubject: verified.uid
    });
    const authentication = await completePrimaryAuthentication({
      account: {
        id: verified.uid,
        email: verified.email,
        name: verified.name,
        role: operationalAccount.role,
        sessionVersion: operationalAccount.sessionVersion
      }
    });
    if (authentication.status === "mfa_required") {
      const response = NextResponse.json({ ok: true, mfaRequired: true });
      response.cookies.set(clearedAuthCookieAttributes(SESSION_COOKIE_NAME));
      response.cookies.set(authCookieAttributes(authentication.challengeCookie));
      return response;
    }

    const response = NextResponse.json({ ok: true, access: authentication.access });
    response.cookies.set(authCookieAttributes(authentication.sessionCookie));

    return response;
  } catch (error) {
    const publicError = getAuthRouteError(error);
    return NextResponse.json(
      { ok: false, error: publicError.message },
      { status: publicError.status }
    );
  }
}
