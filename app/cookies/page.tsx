import type { Metadata } from "next";
import { PolicyLayout, PolicySection } from "@/components/legal/PolicyLayout";
import { SITE_NAME } from "@/src/lib/site/metadata";

const description = "DREAMWISH의 필수·기능·분석·광고 쿠키와 Google Consent Mode 설정을 안내합니다.";

export const metadata: Metadata = {
  title: "쿠키 정책",
  description,
  alternates: { canonical: "/cookies" },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: "/cookies",
    siteName: SITE_NAME,
    title: "쿠키 정책 | DREAMWISH",
    description
  },
  twitter: { card: "summary", title: "쿠키 정책 | DREAMWISH", description }
};

export default function CookiePolicyPage() {
  return (
    <PolicyLayout title="쿠키 정책" description={description}>
      <PolicySection id="meaning" title="1. 쿠키와 브라우저 저장소">
        <p>
          쿠키는 웹사이트가 브라우저에 저장하는 작은 정보입니다. DREAMWISH는 쿠키와 localStorage를 로그인·보안,
          이용자 설정, 동의 선택, 서비스 분석 및 광고 측정에 사용합니다. 브라우저 설정에 따라 쿠키를 삭제하거나
          차단할 수 있지만 필수 저장소를 차단하면 로그인과 핵심 기능이 정상 동작하지 않을 수 있습니다.
        </p>
      </PolicySection>

      <PolicySection id="categories" title="2. 사용하는 저장소 유형">
        <div className="overflow-x-auto">
          <table>
            <thead><tr><th>유형</th><th>목적</th><th>기본 상태</th></tr></thead>
            <tbody>
              <tr><td>필수 쿠키</td><td>로그인 세션, 인증, 보안, 요청 위조 방지와 핵심 서비스 운영</td><td>항상 활성</td></tr>
              <tr><td>기능 저장소</td><td>언어, 테마, 화면 설정, 쿠키 선택 등 편의 기능 유지</td><td>활성, 설정에서 변경 가능</td></tr>
              <tr><td>분석 쿠키</td><td>Google Analytics를 통한 이용 흐름, 방문과 성능 측정</td><td>동의 전 거부</td></tr>
              <tr><td>광고 쿠키</td><td>Google Ads·AdSense 광고 제공, 전환 측정과 개인 맞춤 동의</td><td>동의 전 거부</td></tr>
            </tbody>
          </table>
        </div>
      </PolicySection>

      <PolicySection id="consent-mode" title="3. Google Consent Mode v2">
        <p>
          첫 방문 시 분석과 광고 관련 저장소는 거부 상태로 시작합니다. 선택을 저장하면 Google 태그에 다음 동의
          신호가 전달됩니다.
        </p>
        <ul>
          <li><code>analytics_storage</code>: 분석 목적 저장 허용 여부</li>
          <li><code>ad_storage</code>: 광고 목적 저장 허용 여부</li>
          <li><code>ad_user_data</code>: 광고 관련 이용자 데이터 사용 동의</li>
          <li><code>ad_personalization</code>: 맞춤 광고 동의</li>
          <li><code>functionality_storage</code>: 편의 기능 저장 허용 여부</li>
          <li><code>security_storage</code>: 보안상 필요한 저장으로 항상 활성</li>
        </ul>
        <p>
          동의 전에도 Google 스크립트가 제한된 신호를 전송할 수 있으나, 분석·광고 저장과 맞춤 광고는 저장된 동의
          상태에 따라 제어됩니다. IP 익명화 등 제공되는 보호 설정을 적용합니다.
        </p>
      </PolicySection>

      <PolicySection id="consent-record" title="4. 동의 선택의 저장 기간">
        <p>
          쿠키 선택은 <code>cookieConsent</code>라는 이름으로 cookie와 localStorage에 저장되며, 선택 시각과 버전을
          포함합니다. 보유 기간은 180일이고, 그 전에 이용자가 삭제하거나 설정을 변경하면 즉시 새 선택이 적용됩니다.
        </p>
      </PolicySection>

      <PolicySection id="change" title="5. 설정 변경 및 거부 방법">
        <p>
          Footer 또는 DREAMWISH 설정 화면의 “쿠키 설정”을 눌러 언제든 분석·광고·기능 저장소의 선택을 변경할 수
          있습니다. 브라우저 설정에서도 전체 쿠키와 사이트 데이터를 삭제할 수 있습니다. 분석 또는 광고를 거부해도
          로그인과 유료 핵심 기능은 이용할 수 있으나, 일부 맞춤 기능이나 광고 측정은 제한될 수 있습니다.
        </p>
      </PolicySection>

      <PolicySection id="third-parties" title="6. 외부 제공자">
        <p>
          선택한 동의에 따라 Google Analytics, Google Tag Manager, Google Ads 및 Google AdSense가 브라우저·기기,
          페이지 방문, 광고 상호작용과 유사한 정보를 처리할 수 있습니다. 구체적인 국외 처리와 이용자 권리는
          개인정보 처리방침 및 Google의 관련 정책을 따릅니다.
        </p>
      </PolicySection>

      <PolicySection id="changes" title="7. 정책 변경">
        <p>
          사용 기술, 제공자 또는 법령이 변경되면 이 정책을 개정할 수 있습니다. 쿠키의 목적이나 선택 범위가
          중요하게 변경되면 배너 또는 서비스 화면에서 다시 안내하거나 필요한 동의를 받습니다.
        </p>
      </PolicySection>
    </PolicyLayout>
  );
}
