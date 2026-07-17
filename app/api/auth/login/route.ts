import { NextResponse } from "next/server";
import { loginAccount } from "@/src/lib/auth/account.repository";
import { getAuthRouteError } from "@/src/lib/auth/auth-route-error";
import {
  authCookieAttributes,
  clearedAuthCookieAttributes,
  completePrimaryAuthentication
} from "@/src/lib/auth/session-issuance.service";
import { SESSION_COOKIE_NAME } from "@/src/lib/auth/session-token";
import { verifyFirebaseIdToken } from "@/src/lib/firebase/firebase-server-auth";
import { upsertOperationalAccount } from "@/src/lib/admin/account-admin.repository";
import { redeemCouponByCode } from "@/src/lib/coupons/coupon.repository";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      idToken?: string;
      couponCode?: string;
    };
    const idToken = typeof body.idToken === "string" ? body.idToken.trim() : "";
    if (!idToken) {
      return NextResponse.json(
        { ok: false, error: "Firebase ID token is required." },
        { status: 401 }
      );
    }

    const verified = await verifyFirebaseIdToken(idToken);
    const result = await loginAccount({
      email: verified.email,
      name: verified.name
    });
    const operationalAccount = await upsertOperationalAccount({
      id: verified.uid,
      email: verified.email,
      name: verified.name,
      provider: "password",
      providerSubject: verified.uid
    });
    let couponResult: "applied" | "invalid" | null = null;
    if (typeof body.couponCode === "string" && body.couponCode.trim()) {
      try {
        await redeemCouponByCode({ code: body.couponCode, userId: verified.uid });
        couponResult = "applied";
      } catch {
        couponResult = "invalid";
      }
    }
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
      const response = NextResponse.json({
        ok: true,
        mfaRequired: true,
        couponResult
      });
      response.cookies.set(clearedAuthCookieAttributes(SESSION_COOKIE_NAME));
      response.cookies.set(authCookieAttributes(authentication.challengeCookie));
      return response;
    }

    const access = authentication.access;
    const response = NextResponse.json({
      ok: true,
      account: {
        ...result.account,
        role: operationalAccount.role,
        paid: access.paid,
        paidAt: access.paid ? result.account.paidAt || new Date().toISOString() : null
      },
      access,
      couponResult
    });
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
