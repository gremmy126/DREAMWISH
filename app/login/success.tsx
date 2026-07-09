"use client";

import Link from "next/link";
import { useAppLanguage } from "@/src/lib/i18n/use-app-language";

export function LoginSuccess() {
  const { language } = useAppLanguage();
  const text =
    language === "en"
      ? {
          title: "Login complete",
          description: "DREAMWISH access has been verified.",
          action: "Go to app"
        }
      : language === "ja"
        ? {
            title: "ログイン完了",
            description: "DREAMWISHのアクセス権を確認しました。",
            action: "アプリへ移動"
          }
        : {
            title: "로그인 완료",
            description: "DREAMWISH 사용 권한을 확인했습니다.",
            action: "앱으로 이동"
          };

  return (
    <main className="flex min-h-screen items-center justify-center bg-app-bg px-6">
      <section className="w-full max-w-md rounded-app border border-app-border bg-white p-7 text-center shadow-soft">
        <h1 className="text-xl font-semibold text-app-text">{text.title}</h1>
        <p className="mt-2 text-sm leading-6 text-app-muted">
          {text.description}
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex h-11 items-center justify-center rounded-app bg-app-primary px-5 text-sm font-semibold text-white"
        >
          {text.action}
        </Link>
      </section>
    </main>
  );
}
