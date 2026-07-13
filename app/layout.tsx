import type { Metadata } from "next";
import Script from "next/script";
import { ConsentProvider } from "@/components/consent/ConsentProvider";
import { buildConsentInitializerScript } from "@/components/consent/consent";
import {
  NAVER_SITE_VERIFICATION,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL
} from "@/src/lib/site/metadata";
import "./globals.css";

const GA_MEASUREMENT_ID =
  getPublicEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID") || getPublicEnv("NEXT_PUBLIC_GOOGLE_TAG_ID");
const GTM_ID = getPublicEnv("NEXT_PUBLIC_GTM_ID");
const GOOGLE_ADS_ID = getPublicEnv("NEXT_PUBLIC_GOOGLE_ADS_ID");
const GOOGLE_TAG_LOADER_ID = GA_MEASUREMENT_ID || GOOGLE_ADS_ID;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: "DREAMWISH - 나만의 개인두뇌 AI",
    template: "%s | DREAMWISH"
  },
  description: SITE_DESCRIPTION,
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
      <body>
        <Script
          id="google-consent-default"
          strategy="beforeInteractive"
        >
          {buildConsentInitializerScript()}
        </Script>
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
