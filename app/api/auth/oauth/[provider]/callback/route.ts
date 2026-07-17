import { NextResponse } from "next/server";
import { getBillingEntitlement } from "@/src/lib/billing/billing.repository";
import { buildOperationalAccessState, hasEffectiveEntitlement } from "@/src/lib/billing/effective-entitlement";
import { getAppOrigin } from "@/src/lib/billing/polar";
import { redeemCouponByHash } from "@/src/lib/coupons/coupon.repository";
import { PENDING_COUPON_COOKIE } from "@/src/lib/coupons/coupon.service";
import {
  consumeOAuthLoginState,
  OAUTH_LOGIN_STATE_COOKIE,
  readOAuthStateCookie
} from "@/src/lib/auth/oauth-login-state";
import { exchangeSocialCode, fetchSocialProfile, isSocialProvider } from "@/src/lib/auth/social-oauth";
import { linkOrCreateSocialIdentity } from "@/src/lib/auth/social-identity.service";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS
} from "@/src/lib/auth/session-token";

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const origin = getAppOrigin();
  try {
    const { provider } = await context.params;
    if (!isSocialProvider(provider)) throw new Error("Unsupported provider.");
    const url = new URL(request.url);
    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || "";
    if (!code || !state || url.searchParams.has("error")) throw new Error("OAuth callback was denied.");
    const stateCookie = readOAuthStateCookie(request.headers.get("cookie"));
    if (!stateCookie) throw new Error("OAuth state cookie is missing.");
    const consumed = await consumeOAuthLoginState({ provider, state, cookie: stateCookie });
    const token = await exchangeSocialCode(provider, code, state);
    const profile = await fetchSocialProfile(provider, token);
    const account = await linkOrCreateSocialIdentity(provider, profile);
    if (account.status !== "active") throw new Error("This account is not active.");
    if (consumed.pendingCouponHash) {
      await redeemCouponByHash({ codeHash: consumed.pendingCouponHash, userId: account.id }).catch(() => undefined);
    }
    const billing = await getBillingEntitlement(account.id);
    const entitled = await hasEffectiveEntitlement({ userId: account.id, role: account.role, billingActive: billing.status === "active" });
    const access = buildOperationalAccessState({ email: account.email, role: account.role, entitled });
    const session = await createSessionToken({ uid: account.id, email: account.email, name: account.name, role: account.role, paid: access.paid, entitled: access.canUseApp, sessionVersion: account.sessionVersion });
    const response = NextResponse.redirect(new URL("/?oauth_login=success", origin));
    response.cookies.set({ name: SESSION_COOKIE_NAME, value: session, httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_MAX_AGE_SECONDS });
    clearTransientCookies(response);
    return response;
  } catch (error) {
    const code = error instanceof Error && /email consent/u.test(error.message) ? "email_consent_required" : "oauth_failed";
    const response = NextResponse.redirect(new URL(`/?login=1&oauth_error=${code}`, origin));
    clearTransientCookies(response);
    return response;
  }
}

function clearTransientCookies(response: NextResponse) {
  response.cookies.set({ name: OAUTH_LOGIN_STATE_COOKIE, value: "", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/auth/oauth", maxAge: 0 });
  response.cookies.set({ name: PENDING_COUPON_COOKIE, value: "", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
}

