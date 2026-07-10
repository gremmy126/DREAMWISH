import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Cookie Policy | DREAMWISH",
  description: "DREAMWISH 개인두뇌 AI의 쿠키 정책과 Google Consent Mode 안내입니다."
};

export default function CookiePolicyPage() {
  return (
    <main className="min-h-screen bg-app-bg px-4 py-10 text-app-text sm:px-6">
      <article className="mx-auto max-w-3xl rounded-app border border-app-border bg-app-card p-6 shadow-app sm:p-8">
        <Link className="text-sm font-semibold text-app-primary" href="/">
          DREAMWISH
        </Link>
        <h1 className="mt-5 text-3xl font-semibold tracking-normal">Cookie Policy</h1>
        <p className="mt-2 text-sm text-app-muted">최종 업데이트: 2026년 7월 10일</p>

        <div className="mt-8 space-y-7 text-sm leading-7 text-app-muted">
          <section>
            <h2 className="text-lg font-semibold text-app-text">1. 쿠키 사용 목적</h2>
            <p className="mt-3">
              DREAMWISH는 로그인 유지, 보안, 결제 완료 확인, 언어 및 화면 설정,
              서비스 분석, 광고 전환 측정을 위해 쿠키와 localStorage를 사용합니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-app-text">2. 쿠키 유형</h2>
            <div className="mt-3 overflow-hidden rounded-app border border-app-border">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-app-bg text-app-text">
                  <tr>
                    <th className="p-3 font-semibold">유형</th>
                    <th className="p-3 font-semibold">용도</th>
                    <th className="p-3 font-semibold">기본 상태</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-app-border">
                    <td className="p-3 font-semibold text-app-text">필수 쿠키</td>
                    <td className="p-3">인증, 보안, 결제 반환 확인</td>
                    <td className="p-3">항상 활성</td>
                  </tr>
                  <tr className="border-t border-app-border">
                    <td className="p-3 font-semibold text-app-text">분석 쿠키</td>
                    <td className="p-3">Google Analytics를 통한 사용 흐름 분석</td>
                    <td className="p-3">거부</td>
                  </tr>
                  <tr className="border-t border-app-border">
                    <td className="p-3 font-semibold text-app-text">광고 쿠키</td>
                    <td className="p-3">Google Ads 전환 측정 및 광고 개인화 동의</td>
                    <td className="p-3">거부</td>
                  </tr>
                  <tr className="border-t border-app-border">
                    <td className="p-3 font-semibold text-app-text">기능 쿠키</td>
                    <td className="p-3">언어, 테마, 편의 설정 저장</td>
                    <td className="p-3">허용</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-app-text">3. Google Consent Mode v2</h2>
            <p className="mt-3">
              최초 로드 시 ad_storage, analytics_storage, ad_user_data,
              ad_personalization은 denied로 설정됩니다. functionality_storage와
              security_storage는 서비스 동작을 위해 granted로 설정됩니다. 사용자가
              선택을 저장하면 gtag consent update가 실행되고 GTM, GA4, Google Ads가
              해당 동의 상태를 따릅니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-app-text">4. 저장 방식</h2>
            <p className="mt-3">
              동의 선택은 cookieConsent 이름으로 localStorage와 cookie에 모두 저장됩니다.
              쿠키 보관 기간은 180일이며, 브라우저 설정에서 직접 삭제할 수 있습니다.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-app-text">5. 설정 변경</h2>
            <p className="mt-3">
              Footer 또는 Settings 화면의 Cookie settings 버튼을 통해 언제든지 동의
              선택을 변경할 수 있습니다. 선택을 변경하면 즉시 Google Consent Mode
              update가 실행됩니다.
            </p>
          </section>
        </div>

        <nav className="mt-10 flex flex-wrap gap-3 border-t border-app-border pt-5 text-sm">
          <Link className="font-semibold text-app-primary" href="/privacy">
            Privacy Policy
          </Link>
          <Link className="font-semibold text-app-primary" href="/cookies">
            Cookie Policy
          </Link>
          <Link className="font-semibold text-app-primary" href="/terms">
            Terms
          </Link>
        </nav>
      </article>
    </main>
  );
}
