import type { Metadata } from "next";
import Link from "next/link";
import { SITE_NAME } from "@/src/lib/site/metadata";

const description = "DREAMWISH 개인두뇌 AI 서비스 이용약관입니다.";

export const metadata: Metadata = {
  title: "Terms",
  description,
  alternates: { canonical: "/terms" },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: "/terms",
    siteName: SITE_NAME,
    title: "Terms | DREAMWISH",
    description
  },
  twitter: { card: "summary", title: "Terms | DREAMWISH", description }
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-app-bg px-4 py-10 text-app-text sm:px-6">
      <article className="mx-auto max-w-3xl rounded-app border border-app-border bg-app-card p-6 shadow-app sm:p-8">
        <Link className="text-sm font-semibold text-app-primary" href="/">
          DREAMWISH
        </Link>
        <h1 className="mt-5 text-3xl font-semibold tracking-normal">서비스 이용약관</h1>
        <p className="mt-2 text-sm text-app-muted">최종 업데이트: 2026년 7월 13일</p>

        <div className="mt-8 space-y-7 text-sm leading-7 text-app-muted">
          <TermsSection title="1. 목적">
            본 약관은 DREAMWISH 개인두뇌 AI 서비스의 이용 조건, 사용자와 운영자의 권리와
            의무, 책임 범위를 정합니다.
          </TermsSection>
          <TermsSection title="2. 계정과 보안">
            사용자는 본인의 계정 정보를 안전하게 관리해야 합니다. 외부 앱 연결, API 토큰,
            파일 업로드와 자동화 기능은 사용자가 직접 승인한 범위에서만 사용해야 합니다.
          </TermsSection>
          <TermsSection title="3. AI 결과물">
            AI가 생성한 답변은 참고 자료이며 정확성, 완전성, 최신성이 항상 보장되지는
            않습니다. 법률, 의료, 금융 등 중요한 결정에는 전문가 검토가 필요합니다.
          </TermsSection>
          <TermsSection title="4. 금지 행위">
            불법 콘텐츠 생성, 타인의 권리 침해, 보안 우회, 서비스 장애 유발, 승인되지 않은
            데이터 수집 또는 외부 앱 권한 오남용을 금지합니다.
          </TermsSection>
          <TermsSection title="5. 서비스 변경">
            운영자는 보안, 법령 준수, 기능 개선을 위해 서비스 기능과 정책을 변경할 수
            있습니다. 중요한 변경은 합리적인 방식으로 안내합니다.
          </TermsSection>
          <TermsSection title="6. 개인정보와 쿠키">
            개인정보 처리와 쿠키 사용은 Privacy Policy와 Cookie Policy를 따릅니다.
          </TermsSection>
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

function TermsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-app-text">{title}</h2>
      <p className="mt-3">{children}</p>
    </section>
  );
}
