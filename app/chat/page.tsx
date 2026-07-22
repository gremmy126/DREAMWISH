import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/AppShell";
import { BreadcrumbJsonLd } from "@/components/seo/BreadcrumbJsonLd";
import { SESSION_COOKIE_NAME } from "@/src/lib/auth/session-token";

export const metadata: Metadata = {
  title: "AI Chat",
  description:
    "AI가 질문하고 딥리서치·시뮬레이션·조직 의견을 거쳐 최종 결론까지 제안하는 의사결정 파트너. 웹사이트·앱·이미지를 만드는 AI Agent 포함.",
  alternates: { canonical: "/chat" },
  robots: { index: true, follow: true }
};

export default async function ChatPage() {
  const cookieStore = await cookies();
  const hasServerSession = Boolean(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  return (
    <>
      <BreadcrumbJsonLd name="AI Chat" path="/chat" />
      <AppShell hasServerSession={hasServerSession} initialView="chat" />
    </>
  );
}
