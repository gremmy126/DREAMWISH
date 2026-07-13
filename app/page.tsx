import type { Metadata } from "next";
import Script from "next/script";
import { AppShell } from "@/components/layout/AppShell";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/src/lib/site/metadata";

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
    description: SITE_DESCRIPTION
  },
  twitter: {
    card: "summary",
    title: "DREAMWISH - 나만의 개인두뇌 AI",
    description: SITE_DESCRIPTION
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
      isAccessibleForFree: true,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "KRW"
      }
    }
  ]
};

export default function Home() {
  return (
    <>
      <Script
        id="dreamwish-structured-data"
        type="application/ld+json"
        strategy="beforeInteractive"
      >
        {JSON.stringify(structuredData).replace(/</gu, "\\u003c")}
      </Script>
      <AppShell />
    </>
  );
}
