import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME } from "@/src/lib/site/metadata";

const description = "개인두뇌 AI DREAMWISH의 개인정보 처리방침입니다.";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description,
  alternates: { canonical: "/privacy" },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: "/privacy",
    siteName: SITE_NAME,
    title: "Privacy Policy | DREAMWISH",
    description
  },
  twitter: { card: "summary", title: "Privacy Policy | DREAMWISH", description }
};

export default function PrivacyPage() {
  return (
    <PolicyLayout title="개인정보 처리방침" updatedAt="2026년 7월 13일">
      <PolicySection title="1. 서비스 개요">
        <p>
          DREAMWISH는 개인두뇌 AI 서비스를 제공하기 위해 계정, 대화, 파일, 연결된
          외부 앱 및 고객지원에 필요한 정보를 처리합니다. 서비스는 사용자의
          지식 관리, AI 채팅, 자동화, 통합 앱 연결을 지원합니다.
        </p>
      </PolicySection>
      <PolicySection title="2. 수집하는 정보">
        <ul>
          <li>계정 정보: 이메일, 로그인 제공자, 인증 식별자</li>
          <li>서비스 이용 정보: 채팅, 메모리, 파일 메타데이터, 설정 값</li>
          <li>통합 정보: 사용자가 승인한 외부 앱의 토큰 및 동기화 상태</li>
          <li>분석 정보: 동의한 경우 GA4 이벤트, 기기 및 브라우저 정보</li>
          <li>광고 정보: 동의한 경우 AdSense 광고 노출 및 상호작용 정보</li>
        </ul>
      </PolicySection>
      <PolicySection title="3. 처리 목적">
        <ul>
          <li>회원 인증, 로그인 유지, 보안 이벤트 감지</li>
          <li>AI 채팅, 파일 분석, 개인화된 지식 검색 제공</li>
          <li>외부 앱 통합, 자동화 실행, 사용자가 요청한 데이터 동기화</li>
          <li>고객지원 요청 대응 및 서비스 안정성 개선</li>
          <li>동의한 범위 내 서비스 품질 분석 및 공개 화면 광고 제공</li>
        </ul>
      </PolicySection>
      <PolicySection title="4. 쿠키와 Google Consent Mode">
        <p>
          DREAMWISH는 Google Consent Mode v2를 적용합니다. 최초 방문 시 분석 및
          광고 저장소는 거부 상태로 시작하며, 사용자가 동의한 뒤에만 GA4, GTM,
          Google Ads 관련 저장소가 허용됩니다. 자세한 내용은{" "}
          <Link className="font-semibold text-app-primary" href="/cookies">
            Cookie Policy
          </Link>
          를 확인하세요.
        </p>
      </PolicySection>
      <PolicySection title="5. 보관 기간">
        <p>
          계정 정보는 회원 탈퇴 또는 법령상 보관 의무가 종료될 때까지 보관됩니다.
          통합 토큰은 연결 해제 시 삭제되며, 쿠키 동의 기록은 최대 180일 동안
          보관됩니다. 법령상 별도 보관 의무가 있는 기록은 해당 기간 동안 보관될 수
          있습니다.
        </p>
      </PolicySection>
      <PolicySection title="6. 사용자의 권리">
        <p>
          사용자는 개인정보 열람, 정정, 삭제, 처리 제한, 동의 철회, 외부 앱 연결
          해제를 요청할 수 있습니다. 쿠키 설정은 Footer 또는 Settings 화면의
          쿠키 설정 버튼에서 언제든지 변경할 수 있습니다.
        </p>
      </PolicySection>
      <PolicySection title="7. 제3자 제공 및 처리위탁">
        <p>
          인증, 분석, 광고, 외부 앱 연동을 위해 Firebase, Google AdSense,
          사용자가 승인한 통합 제공자 등 필요한 서비스 제공자에게 제한된 정보가
          전달될 수 있습니다. 민감한 서버 키는 클라이언트에 노출하지 않습니다.
        </p>
      </PolicySection>
      <PolicySection title="8. 문의">
        <p>
          개인정보 및 보안 관련 문의는 서비스 운영자에게 문의하세요. 공식 연락처가
          확정되면 본 방침에 반영합니다.
        </p>
      </PolicySection>
    </PolicyLayout>
  );
}

function PolicyLayout({
  title,
  updatedAt,
  children
}: {
  title: string;
  updatedAt: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-app-bg px-4 py-10 text-app-text sm:px-6">
      <article className="mx-auto max-w-3xl rounded-app border border-app-border bg-app-card p-6 shadow-app sm:p-8">
        <Link className="text-sm font-semibold text-app-primary" href="/">
          DREAMWISH
        </Link>
        <h1 className="mt-5 text-3xl font-semibold tracking-normal">{title}</h1>
        <p className="mt-2 text-sm text-app-muted">최종 업데이트: {updatedAt}</p>
        <div className="mt-8 space-y-7 text-sm leading-7 text-app-text">{children}</div>
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

function PolicySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-3 space-y-3 text-app-muted [&_li]:ml-5 [&_li]:list-disc">{children}</div>
    </section>
  );
}
