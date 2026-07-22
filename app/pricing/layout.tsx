import type { Metadata } from "next";
import { BreadcrumbJsonLd } from "@/components/seo/BreadcrumbJsonLd";

export const metadata: Metadata = {
  title: "Pricing",
  description: "DreamWish 요금제 — AI 의사결정 플랫폼을 합리적인 가격으로 시작하세요.",
  alternates: { canonical: "/pricing" },
  robots: { index: true, follow: true }
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BreadcrumbJsonLd name="Pricing" path="/pricing" />
      {children}
    </>
  );
}
