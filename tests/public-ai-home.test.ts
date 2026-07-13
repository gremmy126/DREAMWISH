import assert from "node:assert/strict";
import fs from "node:fs";

test("root renders a crawlable guest AI chat instead of a login or marketing page", () => {
  const page = read("app/page.tsx");
  const authGate = read("components/auth/AuthGate.tsx");
  const guestHome = read("components/home/GuestChatHome.tsx");

  assert.match(page, /<AppShell\s*\/>/u);
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
  assert.doesNotMatch(guestHome, /주요 기능|Pricing|FAQ|Features|Docs|Blog/u);
  assert.doesNotMatch(guestHome, /fetch\s*\(/u);
});

test("guest interactions open an in-place Email Google and GitHub login dialog", () => {
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
  assert.match(dialog, /Google로 계속하기/u);
  assert.match(dialog, /GitHub로 계속하기/u);
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

test("obsolete chat login and pricing URLs redirect while Polar success can refresh access", () => {
  const redirects = new Map([
    ["app/chat/page.tsx", 'permanentRedirect("/")'],
    ["app/login/page.tsx", 'permanentRedirect("/?login=1")'],
    ["app/pricing/page.tsx", 'permanentRedirect("/")'],
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
  const openGraphImage = read("app/opengraph-image.tsx");
  const twitterImage = read("app/twitter-image.tsx");
  const socialImage = read("src/lib/site/social-image.tsx");

  assert.match(metadata, /https:\/\/dreamwish\.co\.kr/u);
  assert.match(layout, /metadataBase/u);
  assert.match(page, /openGraph/u);
  assert.match(page, /twitter/u);
  assert.match(layout, /robots/u);
  assert.match(page, /application\/ld\+json/u);
  assert.match(page, /SoftwareApplication/u);
  assert.match(page, /WebSite/u);
  assert.match(robots, /sitemap/u);
  assert.match(robots, /allow:\s*"\/"/u);
  assert.match(sitemap, /SITE_URL/u);
  assert.doesNotMatch(sitemap, /pricing|billing|payment/u);
  assert.match(openGraphImage, /renderSocialImage/u);
  assert.match(socialImage, /ImageResponse/u);
  assert.match(socialImage, /1200/u);
  assert.match(socialImage, /630/u);
  assert.match(twitterImage, /renderSocialImage/u);
});

test("policy pages have their own canonical and social metadata", () => {
  for (const [file, canonical] of [
    ["app/privacy/page.tsx", "/privacy"],
    ["app/cookies/page.tsx", "/cookies"],
    ["app/terms/page.tsx", "/terms"]
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
  assert.match(appShell, /<ChatView/u);
  assert.match(appShell, /<MemoryView/u);
  assert.match(appShell, /<BusinessHub/u);
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
