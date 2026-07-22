import assert from "node:assert/strict";
import fs from "node:fs";

// AdSense 인피드(콘텐츠 피드형) 광고 단위가 발급받은 슬롯·레이아웃 키로
// 구성되고, 사이트의 동의 기반 광고 정책을 그대로 따르는지 검증한다.
test("the in-feed AdSense unit uses the issued slot, layout key, and client", () => {
  const ad = fs.readFileSync("components/ads/InFeedAdSlot.tsx", "utf8");
  assert.match(ad, /ca-pub-5650931082151367/u);
  assert.match(ad, /6469730068/u);
  assert.match(ad, /-ef\+6k-30-ac\+ty/u);
  assert.match(ad, /data-ad-format="fluid"/u);
  assert.match(ad, /data-ad-layout-key=\{INFEED_LAYOUT_KEY\}/u);
  assert.match(ad, /NEXT_PUBLIC_ADSENSE_INFEED_SLOT_ID/u);
});

test("the in-feed unit is consent-gated like the rest of the site's ads", () => {
  const ad = fs.readFileSync("components/ads/InFeedAdSlot.tsx", "utf8");
  assert.match(ad, /useConsent/u);
  assert.match(ad, /if \(!canLoadAds \|\| !slotId\) return null/u);
  assert.match(ad, /adsbygoogle/u);
  // 로더 스크립트를 컴포넌트에서 중복 삽입하지 않는다(레이아웃 head에만).
  assert.doesNotMatch(ad, /pagead2\.googlesyndication\.com/u);
});

test("the guest home renders the in-feed unit within its content, not in the workspace", () => {
  const guestHome = fs.readFileSync("components/home/GuestChatHome.tsx", "utf8");
  const authGate = fs.readFileSync("components/auth/AuthGate.tsx", "utf8");
  assert.match(guestHome, /import \{ InFeedAdSlot \}/u);
  assert.match(guestHome, /!restoringSession \? <InFeedAdSlot/u);
  assert.doesNotMatch(authGate, /InFeedAdSlot/u);
});
