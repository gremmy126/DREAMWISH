import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/AppShell";
import { BreadcrumbJsonLd } from "@/components/seo/BreadcrumbJsonLd";
import { SESSION_COOKIE_NAME } from "@/src/lib/auth/session-token";

export const metadata: Metadata = {
  title: "Memory | DreamWish",
  description:
    "결정·리서치·교훈·결과가 자동으로 축적되는 AI Memory OS. 조직의 의사결정 자산을 연결합니다.",
  alternates: { canonical: "/memory" },
  robots: { index: true, follow: true }
};

export default async function MemoryPage() {
  const cookieStore = await cookies();
  const hasServerSession = Boolean(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  return (
    <>
      <BreadcrumbJsonLd name="Memory" path="/memory" />
      <AppShell hasServerSession={hasServerSession} initialView="memory" />
    </>
  );
}
