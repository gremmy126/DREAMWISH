import type { Metadata } from "next";
import { BreadcrumbJsonLd } from "@/components/seo/BreadcrumbJsonLd";

export const metadata: Metadata = {
  title: "Login",
  description: "DreamWish에 로그인하고 AI 의사결정 파트너를 사용하세요.",
  alternates: { canonical: "/login" },
  robots: { index: true, follow: true }
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BreadcrumbJsonLd name="Login" path="/login" />
      {children}
    </>
  );
}
