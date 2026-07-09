import Link from "next/link";
import { AuthGate } from "@/components/auth/AuthGate";

export default function LoginPage() {
  return (
    <AuthGate>
      <main className="flex min-h-screen items-center justify-center bg-app-bg px-6">
        <section className="w-full max-w-md rounded-app border border-app-border bg-white p-7 text-center shadow-soft">
          <h1 className="text-xl font-semibold text-app-text">로그인 완료</h1>
          <p className="mt-2 text-sm leading-6 text-app-muted">
            DREAMWISH 사용 권한이 확인되었습니다.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex h-11 items-center justify-center rounded-app bg-app-primary px-5 text-sm font-semibold text-white"
          >
            앱으로 이동
          </Link>
        </section>
      </main>
    </AuthGate>
  );
}
