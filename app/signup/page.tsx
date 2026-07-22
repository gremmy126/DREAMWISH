import type { Metadata } from "next";
import Link from "next/link";
import { BreadcrumbJsonLd } from "@/components/seo/BreadcrumbJsonLd";

export const metadata: Metadata = {
  title: "Get Started",
  description:
    "DreamWish AI 의사결정 플랫폼을 시작하세요. AI Chat, Memory, Team으로 더 나은 결정을 만드세요.",
  alternates: { canonical: "/signup" },
  robots: { index: true, follow: true }
};

// SSR 정적 랜딩 — 크롤러가 JS 없이 링크를 읽을 수 있다.
export default function SignupPage() {
  return (
    <>
      <BreadcrumbJsonLd name="Get Started" path="/signup" />
      <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-app-primary text-2xl font-extrabold text-white shadow-soft">
          D
        </div>
        <h1 className="mt-5 text-3xl font-extrabold text-app-text">DreamWish 시작하기</h1>
        <p className="mt-3 max-w-lg text-sm leading-6 text-app-muted">
          질문하고, 분석하고, 실행 가능한 결론을 얻어보세요. AI Chat이 딥리서치와
          시뮬레이션, 조직의 익명 의견까지 반영해 최종 결론을 제안합니다.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/login"
            className="flex h-11 items-center rounded-2xl bg-app-primary px-6 text-sm font-bold text-white shadow-soft transition hover:opacity-90"
          >
            무료로 시작하기
          </Link>
          <Link
            href="/pricing"
            className="flex h-11 items-center rounded-2xl border border-app-border bg-white px-6 text-sm font-semibold text-app-text transition hover:bg-app-hover"
          >
            요금 안내
          </Link>
        </div>
        <nav aria-label="주요 페이지" className="mt-10 flex flex-wrap justify-center gap-4 text-xs font-semibold text-app-muted">
          <Link className="transition hover:text-app-primary" href="/chat">AI Chat</Link>
          <Link className="transition hover:text-app-primary" href="/memory">Memory</Link>
          <Link className="transition hover:text-app-primary" href="/team">Team</Link>
          <Link className="transition hover:text-app-primary" href="/pricing">Pricing</Link>
          <Link className="transition hover:text-app-primary" href="/login">Login</Link>
        </nav>
      </main>
    </>
  );
}
