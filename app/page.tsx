import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/AppShell";
import { JsonLd } from "@/components/seo/JsonLd";
import { SESSION_COOKIE_NAME } from "@/src/lib/auth/session-token";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL
} from "@/src/lib/site/metadata";

const SOCIAL_IMAGE = {
  // ?v= 쿼리는 소셜 크롤러의 이전 카드 캐시를 무효화한다.
  url: "/images/dreamwish-social-card.png?v=3",
  width: 1200,
  height: 630,
  alt: "DreamWish — Better Decisions Powered by AI"
};

export const metadata: Metadata = {
  title: { absolute: SITE_TITLE },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: "/",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [SOCIAL_IMAGE]
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [SOCIAL_IMAGE]
  }
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      inLanguage: "ko-KR"
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/icon.svg`
    },
    {
      "@type": "SiteNavigationElement",
      "@id": `${SITE_URL}/#nav`,
      name: ["AI Chat", "Memory", "Team", "Pricing", "Login", "Get Started"],
      url: [
        `${SITE_URL}/chat`,
        `${SITE_URL}/memory`,
        `${SITE_URL}/team`,
        `${SITE_URL}/pricing`,
        `${SITE_URL}/login`,
        `${SITE_URL}/signup`
      ]
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#application`,
      name: SITE_NAME,
      url: SITE_URL,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: SITE_DESCRIPTION,
      isAccessibleForFree: false
    }
  ]
};

export default async function Home() {
  const cookieStore = await cookies();
  const hasServerSession = Boolean(cookieStore.get(SESSION_COOKIE_NAME)?.value);

  return (
    <>
      <JsonLd id="dreamwish-structured-data" data={structuredData} />
      <AppShell hasServerSession={hasServerSession} />
    </>
  );
}
