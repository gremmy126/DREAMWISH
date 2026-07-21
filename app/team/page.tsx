import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/AppShell";
import { BreadcrumbJsonLd } from "@/components/seo/BreadcrumbJsonLd";
import { SESSION_COOKIE_NAME } from "@/src/lib/auth/session-token";

export const metadata: Metadata = {
  title: "Team | DreamWish",
  description:
    "익명 설문과 회의, 조직 인사이트를 AI가 분석해 의사결정에 반영하는 Team Intelligence Hub.",
  alternates: { canonical: "/team" },
  robots: { index: true, follow: true }
};

export default async function TeamPage() {
  const cookieStore = await cookies();
  const hasServerSession = Boolean(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  return (
    <>
      <BreadcrumbJsonLd name="Team" path="/team" />
      <AppShell hasServerSession={hasServerSession} initialView="team" />
    </>
  );
}
