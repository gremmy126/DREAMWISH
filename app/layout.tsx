import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DREAMWISH",
  description: "DREAMWISH Local First Agentic AI OS.",
  other: {
    "google-adsense-account": "ca-pub-5650931082151367"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
