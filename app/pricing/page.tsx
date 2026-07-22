import Link from "next/link";
import {
  DEFAULT_DOMESTIC_MONTHLY_AMOUNT_KRW,
  getDomesticMonthlyAmountKrw
} from "@/src/lib/billing/billing-config";

// SSR 200 페이지 — 크롤러가 색인할 수 있는 요금 안내. 결제는 로그인 후
// 설정에서 진행된다. Metadata는 layout.tsx에 있다.
export default function PricingPage() {
  // 월 구독 금액의 단일 출처를 그대로 표시한다. 잘못된 설정이어도 SEO 페이지가
  // 200을 유지하도록 기본값으로 폴백한다.
  let monthlyKrw = DEFAULT_DOMESTIC_MONTHLY_AMOUNT_KRW;
  try {
    monthlyKrw = getDomesticMonthlyAmountKrw();
  } catch {
    monthlyKrw = DEFAULT_DOMESTIC_MONTHLY_AMOUNT_KRW;
  }
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-3xl font-extrabold text-app-text">Pricing</h1>
      <p className="mt-3 max-w-lg text-sm leading-6 text-app-muted">
        DreamWish는 AI Chat 의사결정 분석, Memory OS, Team 익명 설문을 하나의
        요금제로 제공합니다.
      </p>
      <div className="mt-8 w-full max-w-sm rounded-app border border-app-border bg-white p-6 text-left shadow-app">
        <p className="text-xs font-bold text-app-primary">DreamWish Pro</p>
        <p className="mt-2 text-3xl font-extrabold text-app-text">
          ₩{monthlyKrw.toLocaleString("ko-KR")}<span className="text-sm font-semibold text-app-muted"> / 월</span>
        </p>
        <ul className="mt-4 space-y-2 text-xs leading-5 text-app-text">
          <li>✓ AI 의사결정 분석 — 인터뷰·딥리서치·시뮬레이션·최종 결론</li>
          <li>✓ Memory OS — 결정·교훈·패턴 자동 축적</li>
          <li>✓ Team — 익명 설문과 조직 인텔리전스</li>
          <li>✓ 결정 이력·보고서 다운로드</li>
        </ul>
        <Link
          href="/?login=1"
          className="mt-5 flex h-11 items-center justify-center rounded-2xl bg-app-primary text-sm font-bold text-white shadow-soft transition hover:opacity-90"
        >
          로그인하고 시작하기
        </Link>
      </div>
      <nav aria-label="주요 페이지" className="mt-10 flex flex-wrap justify-center gap-4 text-xs font-semibold text-app-muted">
        <Link className="transition hover:text-app-primary" href="/chat">AI Chat</Link>
        <Link className="transition hover:text-app-primary" href="/memory">Memory</Link>
        <Link className="transition hover:text-app-primary" href="/team">Team</Link>
        <Link className="transition hover:text-app-primary" href="/login">Login</Link>
        <Link className="transition hover:text-app-primary" href="/signup">Get Started</Link>
      </nav>
    </main>
  );
}
