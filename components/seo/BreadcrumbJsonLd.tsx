import Script from "next/script";
import { SITE_URL } from "@/src/lib/site/metadata";

// Schema.org BreadcrumbList — 모든 주요 페이지에 적용되어 구글 사이트링크
// 생성을 돕는다. 서버에서 렌더링되므로 JS 실행 없이도 크롤러가 읽는다.
export function BreadcrumbJsonLd({ name, path }: { name: string; path: string }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name, item: `${SITE_URL}${path}` }
    ]
  };
  return (
    <Script
      id={`breadcrumb-${path.replace(/\//gu, "-")}`}
      type="application/ld+json"
      strategy="beforeInteractive"
    >
      {JSON.stringify(data).replace(/</gu, "\\u003c")}
    </Script>
  );
}
