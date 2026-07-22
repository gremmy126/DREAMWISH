import assert from "node:assert/strict";
import fs from "node:fs";

test("root renders a crawlable guest AI chat instead of a login or marketing page", () => {
  const page = read("app/page.tsx");
  const authGate = read("components/auth/AuthGate.tsx");
  const guestHome = read("components/home/GuestChatHome.tsx");

  assert.match(page, /<AppShell hasServerSession=\{hasServerSession\}\s*\/>/u);
  assert.match(page, /cookies\(\)/u);
  assert.match(authGate, /GuestChatHome/u);
  assert.match(guestHome, /로그인 후 AI를 사용할 수 있습니다\./u);

  for (const prompt of [
    "오늘 일정을 정리해줘",
    "회의를 요약해줘",
    "프로젝트를 생성해줘",
    "Gmail을 확인해줘",
    "CRM 고객을 찾아줘"
  ]) {
    assert.match(guestHome, new RegExp(prompt, "u"));
  }

  assert.match(guestHome, /aria-disabled="true"/u);
  assert.match(guestHome, /onLoginRequest/u);
  // SEO 사이트링크: 주요 메뉴는 크롤러가 읽을 수 있는 내부 링크로 노출된다.
  for (const href of ["/chat", "/memory", "/team", "/pricing", "/signup"]) {
    assert.match(guestHome, new RegExp(`href="${href}"`, "u"));
  }
  assert.doesNotMatch(guestHome, /FAQ|Docs|Blog/u);
  assert.doesNotMatch(guestHome, /fetch\s*\(/u);
});

test("guest interactions open an in-place Email Kakao and Naver login dialog", () => {
  const authGate = read("components/auth/AuthGate.tsx");
  const dialog = read("components/auth/LoginDialog.tsx");

  assert.match(authGate, /<LoginDialog/u);
  assert.match(authGate, /<GuestChatHome/u);
  assert.match(authGate, /setLoginOpen\(true\)/u);
  assert.match(authGate, /searchParams\.get\("login"\)/u);
  assert.match(authGate, /setLoginOpen\(false\)/u);
  assert.doesNotMatch(authGate, /window\.location\.(?:href|assign).*login/u);

  assert.match(dialog, /role="dialog"/u);
  assert.match(dialog, /aria-modal="true"/u);
  assert.match(dialog, /autoComplete="email"/u);
  assert.match(dialog, /카카오로 계속하기/u);
  assert.match(dialog, /네이버로 계속하기/u);
  assert.match(dialog, /쿠폰 코드/u);
  assert.match(dialog, /회원가입/u);
  assert.match(dialog, /비밀번호 찾기/u);
});

test("guest ads are manual consent-aware and cannot render in the signed-in workspace", () => {
  const authGate = read("components/auth/AuthGate.tsx");
  const guestHome = read("components/home/GuestChatHome.tsx");
  const ad = read("components/ads/GuestAdSlot.tsx");
  const layout = read("app/layout.tsx");

  assert.match(guestHome, /<GuestAdSlot/u);
  assert.match(guestHome, /!restoringSession \? <GuestAdSlot/u);
  assert.doesNotMatch(authGate, /GuestAdSlot/u);
  assert.match(ad, /ca-pub-5650931082151367/u);
  assert.match(ad, /NEXT_PUBLIC_ADSENSE_SLOT_ID/u);
  assert.match(ad, /3983195777/u);
  assert.match(ad, /useConsent/u);
  assert.match(ad, /adsbygoogle/u);
  assert.match(ad, /if \(!canLoadAds\) return null/u);
  assert.match(ad, /slotId \? \(/u);
  assert.doesNotMatch(ad, /enable_page_level_ads/u);
  assert.match(
    layout,
    /<head>[\s\S]*pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-5650931082151367[\s\S]*<\/head>/u
  );
  assert.match(layout, /crossOrigin="anonymous"/u);
  assert.match(
    layout,
    /<Script[\s\S]*id="google-adsense"[\s\S]*strategy="afterInteractive"/u
  );
  assert.doesNotMatch(layout, /<script\s+async[\s\S]*pagead2\.googlesyndication\.com/u);
  assert.doesNotMatch(ad, /pagead2\.googlesyndication\.com/u);
  assert.doesNotMatch(ad, /import Script from "next\/script"/u);
});

test("primary menu URLs are real 200 pages with metadata for SEO sitelinks", () => {
  // /chat /memory /team은 워크스페이스 뷰를 렌더링하는 실제 페이지다.
  for (const [file, view] of [
    ["app/chat/page.tsx", "chat"],
    ["app/memory/page.tsx", "memory"],
    ["app/team/page.tsx", "team"]
  ] as const) {
    const source = read(file);
    assert.match(source, /export const metadata/u, file);
    assert.match(source, new RegExp(`initialView="${view}"`, "u"), file);
    assert.match(source, /BreadcrumbJsonLd/u, file);
    assert.doesNotMatch(source, /permanentRedirect/u, file);
  }
  // /pricing /login /signup은 SSR 정적 랜딩(200 OK)이다.
  for (const file of ["app/pricing/page.tsx", "app/login/page.tsx", "app/signup/page.tsx"]) {
    const source = read(file);
    assert.doesNotMatch(source, /permanentRedirect/u, file);
    assert.match(source, /href="\/chat"/u, file);
  }
  // 페이지 타이틀은 루트 레이아웃의 "%s | DreamWish" 템플릿과 결합되어
  // "Login | DreamWish" 형태로 렌더링된다 (중복 접미사 방지).
  assert.match(read("app/login/layout.tsx"), /title: "Login"/u);
  assert.match(read("app/pricing/layout.tsx"), /title: "Pricing"/u);
  assert.match(read("app/layout.tsx"), /template: "%s \| DreamWish"/u);

  const redirects = new Map([
    ["app/payment/success/page.tsx", 'permanentRedirect("/")'],
    ["app/settings/billing/page.tsx", 'permanentRedirect("/")']
  ]);
  for (const [file, contract] of redirects) {
    assert.match(read(file), new RegExp(escapeRegExp(contract), "u"), file);
  }
  const billingSuccess = read("app/billing/success/page.tsx");
  assert.match(billingSuccess, /\/api\/billing\/status/u);
  assert.match(billingSuccess, /canUseApp/u);
  assert.equal(fs.existsSync("app/pricing/PricingPageClient.tsx"), false);
});

test("public home publishes canonical social metadata schema robots and sitemap", () => {
  const layout = read("app/layout.tsx");
  const page = read("app/page.tsx");
  const metadata = read("src/lib/site/metadata.ts");
  const robots = read("app/robots.ts");
  const sitemap = read("app/sitemap.ts");
  const sidebar = read("components/layout/Sidebar.tsx");
  const guestHome = read("components/home/GuestChatHome.tsx");
  const loginDialog = read("components/auth/LoginDialog.tsx");
  const brainLogo = read("components/brand/BrainLogo.tsx");
  const appIcon = read("app/icon.svg");

  assert.match(metadata, /https:\/\/dreamwish\.co\.kr/u);
  assert.match(layout, /metadataBase/u);
  assert.match(page, /openGraph/u);
  assert.match(page, /twitter/u);
  assert.match(layout, /robots/u);
  // JSON-LD는 JS 실행 없이도 크롤러가 읽도록 서버 렌더링 <script> 태그로
  // 삽입된다 (next/script는 클라이언트 로더를 거치므로 사용하지 않는다).
  assert.match(page, /<JsonLd/u);
  const jsonLd = read("components/seo/JsonLd.tsx");
  assert.match(jsonLd, /application\/ld\+json/u);
  assert.doesNotMatch(jsonLd, /from "next\/script"/u);
  assert.match(page, /SoftwareApplication/u);
  assert.match(page, /WebSite/u);
  assert.match(robots, /sitemap/u);
  assert.match(robots, /allow:\s*"\/"/u);
  assert.match(sitemap, /SITE_URL/u);
  // SEO 사이트링크 대상 페이지가 모두 sitemap에 포함된다.
  for (const path of ["/chat", "/memory", "/team", "/pricing", "/login", "/signup"]) {
    assert.match(sitemap, new RegExp(escapeRegExp(path), "u"));
  }
  assert.doesNotMatch(sitemap, /billing|payment/u);
  assert.match(page, /Organization/u);
  assert.match(page, /SiteNavigationElement/u);
  assert.match(page, /\/images\/dreamwish-social-card\.png/u);
  assert.match(page, /width:\s*1200/u);
  assert.match(page, /height:\s*630/u);
  assert.match(page, /card:\s*"summary_large_image"/u);
  assert.match(sidebar, /<BrainLogo/u);
  assert.match(guestHome, /<BrainLogo/u);
  assert.match(loginDialog, /<BrainLogo/u);
  assert.match(brainLogo, /aria-hidden/u);
  assert.match(appIcon, /<svg/u);
  assert.equal(fs.existsSync("public/images/dreamwish-social-card.png"), true);
  assert.equal(fs.existsSync("app/opengraph-image.tsx"), false);
  assert.equal(fs.existsSync("app/twitter-image.tsx"), false);
  assert.equal(fs.existsSync("src/lib/site/social-image.tsx"), false);
});

test("policy pages have their own canonical and social metadata", () => {
  for (const [file, canonical] of [
    ["app/privacy/page.tsx", "/privacy"],
    ["app/cookies/page.tsx", "/cookies"],
    ["app/terms/page.tsx", "/terms"],
    ["app/refunds/page.tsx", "/refunds"]
  ]) {
    const source = read(file);
    assert.match(source, new RegExp(`canonical: "${canonical}"`, "u"), file);
    assert.match(source, /openGraph:/u, file);
    assert.match(source, /twitter:/u, file);
  }
});

test("retired payment copy is absent from the active translation catalog", () => {
  const translations = read("src/lib/i18n/translations.ts");
  const contracts = read("src/lib/i18n/i18n-ui.contract.test.ts");

  assert.doesNotMatch(
    translations,
    /Polar|Checkout|paymentTitle|paymentBody|paymentRequired|checkoutNotConfigured|\bpricing:\s*\{|\bbilling:\s*\{|\bpayment:\s*\{/u
  );
  assert.doesNotMatch(contracts, /pricing|billing|checkoutNotConfigured/u);
});

test("Polar entitlement locks unpaid content while preserving the signed-in sidebar", () => {
  const appShell = read("components/layout/AppShell.tsx");
  const sidebar = read("components/layout/Sidebar.tsx");
  const authGate = read("components/auth/AuthGate.tsx");
  const paymentGate = read("components/billing/PaymentGate.tsx");
  const upgrade = read("components/billing/UpgradeButton.tsx");
  const context = read("src/lib/auth/access-context.tsx");

  assert.match(appShell, /<Sidebar/u);
  assert.match(appShell, /<ChatDecisionWorkspace/u);
  assert.match(appShell, /<MemoryOsView/u);
  assert.match(appShell, /<TeamView/u);
  assert.match(appShell, /<PaymentGate/u);
  assert.match(sidebar, /<UpgradeButton/u);
  assert.match(sidebar, /<UpgradeButton[\s\S]*<StorageStatus/u);
  assert.match(authGate, /AccessProvider/u);
  assert.match(context, /refreshAccess/u);
  assert.match(paymentGate, /requiresPayment/u);
  assert.match(upgrade, /\/api\/billing\/checkout/u);
  assert.match(upgrade, /\/api\/billing\/portal/u);
  assert.match(upgrade, /adminBypass/u);
  assert.equal(fs.existsSync("app/api/webhooks/polar/route.ts"), true);
});

function read(file: string) {
  assert.equal(fs.existsSync(file), true, `${file} must exist`);
  return fs.readFileSync(file, "utf8");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
