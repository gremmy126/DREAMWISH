"use client";

import { Smartphone } from "lucide-react";
import { useEffect, useState } from "react";

export default function CompanionPairPage() {
  const [appLink, setAppLink] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const sessionId = url.searchParams.get("sessionId");
    const token = url.searchParams.get("token");
    const apiVersion = url.searchParams.get("apiVersion") || "1";
    if (!sessionId || !token || !/^[A-Za-z0-9_-]{43,128}$/u.test(token)) {
      setExpired(true);
      return;
    }
    const query = new URLSearchParams({ apiVersion, sessionId, token });
    setAppLink(`dreamwish://companion/pair?${query.toString()}`);
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-app-bg px-4 py-10">
      <section className="w-full max-w-md rounded-app border border-app-border bg-white p-6 text-center shadow-soft">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-50 text-app-primary"><Smartphone size={26} /></span>
        <h1 className="mt-4 text-lg font-semibold text-app-text">DREAMWISH 휴대폰 연결</h1>
        {expired ? (
          <p className="mt-3 text-sm leading-6 text-app-muted">연결 링크가 올바르지 않거나 만료되었습니다. 웹의 비즈니스 페이지에서 새 QR 코드를 만들어 다시 스캔하세요.</p>
        ) : (
          <>
            <p className="mt-3 text-sm leading-6 text-app-muted">이 페이지는 DREAMWISH Companion 앱에서 열려야 합니다. 앱이 설치되어 있으면 아래 버튼으로 앱을 여세요.</p>
            {appLink ? (
              <a href={appLink} className="mt-5 inline-flex h-12 items-center justify-center rounded-2xl bg-app-primary px-6 text-sm font-semibold text-white">앱에서 계속하기</a>
            ) : null}
            <div className="mt-5 rounded-2xl border border-app-border bg-app-bg p-4 text-left text-xs leading-6 text-app-text">
              <p className="font-semibold">앱이 없다면</p>
              <ol className="mt-1 list-decimal space-y-1 pl-5">
                <li>DREAMWISH Companion 앱을 설치합니다.</li>
                <li>웹의 비즈니스 페이지에서 새 QR 코드를 만듭니다.</li>
                <li>휴대폰 카메라로 QR 코드를 다시 스캔합니다.</li>
              </ol>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
