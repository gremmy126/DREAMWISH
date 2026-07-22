import type { Metadata } from "next";
import Script from "next/script";
import { ConsentProvider } from "@/components/consent/ConsentProvider";
import { buildConsentInitializerScript } from "@/components/consent/consent";
import {
  NAVER_SITE_VERIFICATION,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL
} from "@/src/lib/site/metadata";
import "./globals.css";

const DEFAULT_GA_MEASUREMENT_ID = "G-PKW99058QE";
const GA_MEASUREMENT_ID =
  getPublicEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID") ||
  getPublicEnv("NEXT_PUBLIC_GOOGLE_TAG_ID") ||
  DEFAULT_GA_MEASUREMENT_ID;
const GTM_ID = getPublicEnv("NEXT_PUBLIC_GTM_ID");
const GOOGLE_ADS_ID = getPublicEnv("NEXT_PUBLIC_GOOGLE_ADS_ID");
const GOOGLE_TAG_LOADER_ID = GA_MEASUREMENT_ID || GOOGLE_ADS_ID;

const SOCIAL_IMAGE = {
  // ?v= 쿼리는 소셜 크롤러의 이전 카드 캐시를 무효화한다.
  url: "/images/dreamwish-social-card.png?v=3",
  width: 1200,
  height: 630,
  alt: "DreamWish — Better Decisions Powered by AI"
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: SITE_TITLE,
    template: "%s | DreamWish"
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    locale: "ko_KR",
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
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" }
  },
  other: {
    "google-adsense-account": "ca-pub-5650931082151367",
    "naver-site-verification": NAVER_SITE_VERIFICATION
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const googleTagConfigScript = buildGoogleTagConfigScript();

  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <Script
          id="google-consent-default"
          strategy="beforeInteractive"
        >
          {buildConsentInitializerScript()}
        </Script>
        <Script
          id="google-adsense"
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5650931082151367"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
      </head>
      <body>
        {GTM_ID ? (
          <noscript>
            <iframe
              title="Google Tag Manager"
              src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
            />
          </noscript>
        ) : null}
        <ConsentProvider>{children}</ConsentProvider>
        {GTM_ID ? (
          <Script id="google-tag-manager" strategy="afterInteractive">
            {`
              (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
              new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
              j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
              'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
              })(window,document,'script','dataLayer',${JSON.stringify(GTM_ID)});
            `}
          </Script>
        ) : null}
        {GOOGLE_TAG_LOADER_ID ? (
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
              GOOGLE_TAG_LOADER_ID
            )}`}
            strategy="afterInteractive"
          />
        ) : null}
        {googleTagConfigScript ? (
          <Script id="google-tags-config" strategy="afterInteractive">
            {googleTagConfigScript}
          </Script>
        ) : null}
      </body>
    </html>
  );
}

function getPublicEnv(name: string) {
  const raw = process.env[name];
  return raw?.trim().replace(/^["']|["']$/g, "") || "";
}

function buildGoogleTagConfigScript() {
  if (!GA_MEASUREMENT_ID && !GOOGLE_ADS_ID) return "";

  const lines = [
    "window.dataLayer = window.dataLayer || [];",
    "window.gtag = window.gtag || function gtag(){window.dataLayer.push(arguments);};",
    "window.gtag('js', new Date());"
  ];

  if (GA_MEASUREMENT_ID) {
    lines.push(
      `window.gtag('config', ${JSON.stringify(GA_MEASUREMENT_ID)}, { anonymize_ip: true });`
    );
  }

  if (GOOGLE_ADS_ID) {
    lines.push(`window.gtag('config', ${JSON.stringify(GOOGLE_ADS_ID)});`);
  }

  return lines.join("\n");
}
