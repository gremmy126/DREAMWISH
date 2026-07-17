import { NextResponse } from "next/server";
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
  authCookieAttributes,
  completePrimaryAuthentication
} from "@/src/lib/auth/session-issuance.service";

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
    const authentication = await completePrimaryAuthentication({
      account: {
        id: account.id,
        email: account.email,
        name: account.name,
        role: account.role,
        sessionVersion: account.sessionVersion
      }
    });
    if (authentication.status === "mfa_required") {
      // Redirect carries only a non-secret signal; the challenge token travels
      // exclusively in the HttpOnly cookie and never appears in any URL.
      const response = NextResponse.redirect(new URL("/?oauth_login=mfa_required", origin));
      response.cookies.set(authCookieAttributes(authentication.challengeCookie));
      clearTransientCookies(response);
      return response;
    }
    const response = NextResponse.redirect(new URL("/?oauth_login=success", origin));
    response.cookies.set(authCookieAttributes(authentication.sessionCookie));
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
