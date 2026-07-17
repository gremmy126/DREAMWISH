import { NextResponse } from "next/server";
import { loginAccount } from "@/src/lib/auth/account.repository";
import { isAdminEmail } from "@/src/lib/auth/access-control";
import { getAuthRouteError } from "@/src/lib/auth/auth-route-error";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS
} from "@/src/lib/auth/session-token";
import { verifyFirebaseIdToken } from "@/src/lib/firebase/firebase-server-auth";
import { getBillingEntitlement } from "@/src/lib/billing/billing.repository";
import { upsertOperationalAccount } from "@/src/lib/admin/account-admin.repository";
import { buildOperationalAccessState, hasEffectiveEntitlement } from "@/src/lib/billing/effective-entitlement";
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
    const entitlement = isAdminEmail(verified.email)
      ? null
      : await getBillingEntitlement(verified.uid);
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
    const entitled = await hasEffectiveEntitlement({
      userId: verified.uid,
      role: operationalAccount.role,
      billingActive: entitlement?.status === "active"
    });
    const access = buildOperationalAccessState({
      email: verified.email,
      role: operationalAccount.role,
      entitled
    });
    const sessionToken = await createSessionToken({
      uid: verified.uid,
      email: verified.email,
      name: verified.name,
      role: operationalAccount.role,
      paid: access.paid,
      entitled: access.canUseApp,
      sessionVersion: operationalAccount.sessionVersion
    });
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
