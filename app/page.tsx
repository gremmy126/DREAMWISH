import type { Metadata } from "next";
import { cookies } from "next/headers";
import Script from "next/script";
import { AppShell } from "@/components/layout/AppShell";
import { SESSION_COOKIE_NAME } from "@/src/lib/auth/session-token";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/src/lib/site/metadata";

const SOCIAL_IMAGE = {
  url: "/images/dreamwish-social-card.png",
  width: 1200,
  height: 630,
  alt: "DREAMWISH 개인두뇌 AI"
};

export const metadata: Metadata = {
  title: { absolute: "DREAMWISH - 나만의 개인두뇌 AI" },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: "/",
    siteName: SITE_NAME,
    title: "DREAMWISH - 나만의 개인두뇌 AI",
    description: SITE_DESCRIPTION,
    images: [SOCIAL_IMAGE]
  },
  twitter: {
    card: "summary_large_image",
    title: "DREAMWISH - 나만의 개인두뇌 AI",
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
      <Script
        id="dreamwish-structured-data"
        type="application/ld+json"
        strategy="beforeInteractive"
      >
        {JSON.stringify(structuredData).replace(/</gu, "\\u003c")}
      </Script>
      <AppShell hasServerSession={hasServerSession} />
    </>
  );
}
