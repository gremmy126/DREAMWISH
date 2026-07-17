import { NextResponse } from "next/server";
import { assertSameOriginMutation } from "@/src/lib/security/csrf";
import { createSocialAuthorizationUrl, isSocialProvider } from "@/src/lib/auth/social-oauth";
import {
  issueOAuthLoginState,
  OAUTH_LOGIN_STATE_COOKIE,
  OAUTH_LOGIN_STATE_MAX_AGE_SECONDS
} from "@/src/lib/auth/oauth-login-state";
import { hashCouponCode } from "@/src/lib/coupons/coupon-code";
import { readPendingCouponHash } from "@/src/lib/coupons/coupon.service";

export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  try {
    assertSameOriginMutation(request);
    const { provider } = await context.params;
    if (!isSocialProvider(provider)) return NextResponse.json({ ok: false, error: "지원하지 않는 로그인 방식입니다." }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as { couponCode?: string };
    const pendingCouponHash = typeof body.couponCode === "string" && body.couponCode.trim()
      ? hashCouponCode(body.couponCode)
      : readPendingCouponHash(request.headers.get("cookie"));
    const issued = await issueOAuthLoginState({ provider, pendingCouponHash });
    const response = NextResponse.json({ ok: true, authorizationUrl: createSocialAuthorizationUrl(provider, issued.state) });
    response.cookies.set({
      name: OAUTH_LOGIN_STATE_COOKIE,
      value: issued.cookie,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/auth/oauth",
      maxAge: OAUTH_LOGIN_STATE_MAX_AGE_SECONDS
    });
    return response;
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error && /not configured/u.test(error.message) ? "소셜 로그인이 아직 설정되지 않았습니다." : "소셜 로그인을 시작하지 못했습니다." }, { status: 503 });
  }
}

