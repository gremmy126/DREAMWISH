import assert from "node:assert/strict";
import fs from "node:fs";

function read(file: string) {
  assert.equal(fs.existsSync(file), true, `${file} must exist`);
  return fs.readFileSync(file, "utf8");
}

test("legal pages share one operator record and policy layout", () => {
  const policy = read("src/lib/legal/policy.ts");
  const layout = read("components/legal/PolicyLayout.tsx");

  assert.match(policy, /businessName:\s*"드림위시"/u);
  assert.match(policy, /representative:\s*"김동현"/u);
  assert.match(policy, /147-07-03187/u);
  assert.match(policy, /제 2026-부산사상구-0185/u);
  assert.match(policy, /051-916-1222/u);
  assert.match(policy, /adveryhyeon@gmail\.com/u);
  assert.match(layout, /OPERATOR_INFO/u);
  assert.match(layout, /POLICY_LINKS/u);
});

test("refund policy is linked from public navigation and sitemap", () => {
  for (const file of [
    "components/layout/AppShell.tsx",
    "components/home/GuestChatHome.tsx",
    "app/sitemap.ts"
  ]) {
    assert.match(read(file), /\/refunds/u, file);
  }
});

test("Korean policy pages publish complete readable content", () => {
  const required = new Map<string, string[]>([
    [
      "app/privacy/page.tsx",
      ["개인정보 처리방침", "처리 목적", "처리하는 개인정보", "국외 이전", "이용자의 권리"]
    ],
    [
      "app/terms/page.tsx",
      ["서비스 이용약관", "AI 결과", "외부 서비스와 자동화", "유료 구독", "계약 해지"]
    ],
    [
      "app/refunds/page.tsx",
      ["환불 및 구독 해지 정책", "임의 환불", "구독 해지", "법정 권리", "플랫폼 오류"]
    ],
    [
      "app/cookies/page.tsx",
      ["쿠키 정책", "필수 쿠키", "분석 쿠키", "Google Consent Mode", "설정 변경"]
    ]
  ]);

  for (const [file, headings] of required) {
    const source = read(file);
    assert.match(source, /<PolicyLayout/u, file);
    assert.doesNotMatch(source, /�|媛쒖|泥섎━|쒕퉬/u, file);
    for (const heading of headings) {
      assert.match(source, new RegExp(heading, "u"), `${file}: ${heading}`);
    }
  }
});

test("refund policy preserves mandatory consumer rights", () => {
  const source = read("app/refunds/page.tsx");
  assert.match(source, /단순 변심 또는 미사용을 이유로 회사가 별도로 제공하는 임의 환불/u);
  assert.match(source, /관계 법령에 따른 청약철회·계약 해지·환급 권리/u);
  assert.match(source, /중복 결제|오결제/u);
  assert.match(source, /중대한 플랫폼 오류/u);
  assert.doesNotMatch(source, /어떠한 경우에도 환불|결제 즉시 사용한 것으로 간주|법정 청약철회 불가/u);
});

test("policies disclose domestic processors and that DREAMWISH does not store card details", () => {
  const privacy = read("app/privacy/page.tsx");
  const terms = read("app/terms/page.tsx");
  const refunds = read("app/refunds/page.tsx");
  for (const processor of ["PortOne", "KPN", "NHN KCP"]) {
    assert.match(privacy, new RegExp(processor, "u"));
  }
  assert.match(privacy, /카드 정보를 직접 저장하지/u);
  assert.match(terms, /테스트 결제/u);
  assert.match(refunds, /원 결제수단/u);
});
