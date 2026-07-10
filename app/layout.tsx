import type { Metadata } from "next";
import Script from "next/script";
import { NAVER_SITE_VERIFICATION } from "@/src/lib/site/metadata";
import "./globals.css";

const GOOGLE_TAG_ID = "G-PKW99058QE";

export const metadata: Metadata = {
  title: "DREAMWISH",
  description: "DREAMWISH Local First Agentic AI OS.",
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
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        {children}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_TAG_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GOOGLE_TAG_ID}');
          `}
        </Script>
      </body>
    </html>
  );
}
