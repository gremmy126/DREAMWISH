import Link from "next/link";

// SSR 200 페이지 — 크롤러가 색인할 수 있는 로그인 랜딩. 실제 로그인 UI는
// 홈의 인증 다이얼로그(/?login=1)가 담당한다. Metadata는 layout.tsx에 있다.
export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-app-primary text-2xl font-extrabold text-white shadow-soft">
        D
      </div>
      <h1 className="mt-5 text-3xl font-extrabold text-app-text">DreamWish 로그인</h1>
      <p className="mt-3 text-sm leading-6 text-app-muted">
        이메일, 카카오, 네이버 계정으로 로그인하고 AI 의사결정 파트너를 사용하세요.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/?login=1"
          className="flex h-11 items-center rounded-2xl bg-app-primary px-6 text-sm font-bold text-white shadow-soft transition hover:opacity-90"
        >
          로그인하기
        </Link>
        <Link
          href="/signup"
          className="flex h-11 items-center rounded-2xl border border-app-border bg-white px-6 text-sm font-semibold text-app-text transition hover:bg-app-hover"
        >
          Get Started
        </Link>
      </div>
      <nav aria-label="주요 페이지" className="mt-10 flex flex-wrap justify-center gap-4 text-xs font-semibold text-app-muted">
        <Link className="transition hover:text-app-primary" href="/chat">AI Chat</Link>
        <Link className="transition hover:text-app-primary" href="/memory">Memory</Link>
        <Link className="transition hover:text-app-primary" href="/team">Team</Link>
        <Link className="transition hover:text-app-primary" href="/pricing">Pricing</Link>
      </nav>
    </main>
  );
}
