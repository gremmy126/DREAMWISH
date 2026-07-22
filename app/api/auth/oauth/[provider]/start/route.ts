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
    // 쿠폰 연동은 부가 기능이다: COUPON_HASH_SECRET 미설정 등 쿠폰 해시
    // 실패가 소셜 로그인 자체를 막아서는 안 된다.
    let pendingCouponHash: string | null = null;
    try {
      pendingCouponHash = typeof body.couponCode === "string" && body.couponCode.trim()
        ? hashCouponCode(body.couponCode)
        : readPendingCouponHash(request.headers.get("cookie"));
    } catch (couponError) {
      console.error("[oauth-start] coupon hash skipped:", couponError instanceof Error ? couponError.message : couponError);
    }
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
    const message = error instanceof Error ? error.message : String(error);
    // 운영자가 원인을 바로 찾을 수 있도록 서버 로그와 응답에 설정 문제를
    // 구체적으로 남긴다 (시크릿 값 자체는 노출하지 않는다).
    console.error("[oauth-start] failed:", message);
    let friendly = "소셜 로그인을 시작하지 못했습니다.";
    const missingEnv = message.match(/^([A-Z0-9_]+) is not configured\.$/u)?.[1];
    if (missingEnv) {
      // 환경 변수 "이름"만 노출한다 (값은 절대 노출하지 않는다).
      friendly = `소셜 로그인이 아직 설정되지 않았습니다. 서버 환경 변수 ${missingEnv}를 설정해 주세요.`;
    } else if (/not configured/u.test(message)) {
      friendly = "소셜 로그인이 아직 설정되지 않았습니다. (환경 변수 확인 필요)";
    } else if (/redirect URI is invalid/u.test(message)) {
      friendly =
        "리다이렉트 주소 설정이 잘못되었습니다. KAKAO_REDIRECT_URI / NAVER_REDIRECT_URI 값이 " +
        "https://도메인/api/auth/oauth/<kakao|naver>/callback 형식인지 확인해 주세요.";
    } else if (/AUTH_OAUTH_STATE_SECRET|AUTH_SESSION_SECRET/u.test(message)) {
      friendly = "서버 보안 키가 설정되지 않았습니다. AUTH_OAUTH_STATE_SECRET(32자 이상)을 설정해 주세요.";
    }
    return NextResponse.json({ ok: false, error: friendly }, { status: 503 });
  }
}

